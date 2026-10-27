const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createPersistentSettings} = require('../src/settings-persistence');

function fixture(t, initial, overrides = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aerial-settings-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    const file = path.join(dir, 'config.json');
    if (initial !== undefined) {
        fs.writeFileSync(file, initial);
    }
    const callbacks = new Map();
    let id = 0;
    const reports = [];
    const store = createPersistentSettings(file, {
        schedule: callback => { callbacks.set(++id, callback); return id; },
        cancel: key => callbacks.delete(key),
        report: (...args) => reports.push(args),
        ...overrides
    });
    return {store, file, reports, callbacks};
}

test('failed rename retains edits and old config, then retries the latest changes', async t => {
    let locked = true;
    const f = fixture(t, '{"volume":1}', {
        io: {...fs.promises, rename: async (...args) => {
            if (locked) {
                throw Object.assign(new Error('locked'), {code: 'EPERM'});
            }
            return fs.promises.rename(...args);
        }}
    });
    f.store.set('volume', 2);
    assert.equal(await f.store.flush(), false);
    assert.equal(f.store.get('volume'), 2);
    assert.equal(JSON.parse(fs.readFileSync(f.file)).volume, 1);
    assert.equal(f.reports.length, 1);
    assert.equal(f.callbacks.size, 1);
    f.store.set({volume: 3, enabled: false});
    locked = false;
    assert.equal(await f.store.flush(), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.file)), {volume: 3, enabled: false});
    assert.deepEqual(JSON.parse(fs.readFileSync(`${f.file}.bak`)), {volume: 1});
});

test('edits arriving during an active save are persisted by the same flush', async t => {
    let release;
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const f = fixture(t, undefined, {
        io: {...fs.promises, rename: async (...args) => {
            entered();
            await gate;
            return fs.promises.rename(...args);
        }}
    });
    f.store.set('value', 1);
    const saving = f.store.flush();
    await started;
    f.store.set('value', 2);
    release();
    assert.equal(await saving, true);
    assert.equal(JSON.parse(fs.readFileSync(f.file)).value, 2);
});

test('corrupt config is preserved and a valid backup restores settings', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aerial-recovery-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, '{broken');
    fs.writeFileSync(`${file}.bak`, '{"volume":7}');
    const store = createPersistentSettings(file, {report() {}});
    assert.equal(store.get('volume'), 7);
    assert.ok(fs.readdirSync(dir).some(name => name.startsWith('config.json.corrupt-')));
    assert.equal(await store.flush(), true);
    assert.equal(JSON.parse(fs.readFileSync(file)).volume, 7);
});

test('unchanged edits do not queue writes and reset uses the same writer', async t => {
    const f = fixture(t, '{"enabled":true}');
    f.store.set('enabled', true);
    assert.equal(f.callbacks.size, 0);
    f.store.clear();
    f.store.set('default', 1);
    assert.equal(await f.store.flush(), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.file)), {default: 1});
});
