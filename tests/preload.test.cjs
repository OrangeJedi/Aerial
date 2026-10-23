const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

function bridge(realSettings = false) {
    const calls = [];
    const listeners = new Map();
    const values = {prepareCompatibleVideos: true, cachePath: 'cache'};
    let exposed;
    let exists = true;
    const settings = {get: key => values[key], set: (...args) => calls.push(['set', ...args]),
        invalidate: () => calls.push(['invalidate'])};
    const modules = {
        electron: {contextBridge: {exposeInMainWorld: (name, api) => { assert.equal(name, 'electron'); exposed = api; }},
            ipcRenderer: {send: (...args) => calls.push(['send', ...args]),
                sendSync: (channel, changes) => {
                    calls.push(['sync', channel]);
                    if (channel === 'settings-read') {
                        return structuredClone(values);
                    }
                    assert.equal(channel, 'settings-write');
                    Object.assign(values, changes);
                    return {ok: true};
                },
                invoke: (...args) => { calls.push(['invoke', ...args]); return Promise.resolve('reply'); },
                on: (channel, callback) => listeners.set(channel, callback)}},
        'electron-store': class {}, './settings-store': realSettings ? require('../settings-store') : {createSettingsStore: () => settings},
        './video-sources': require('../video-sources'), './playback': {convertedPath: () => 'C:/cache/converted/a.mp4'},
        path: require('node:path'), fs: {existsSync: () => exists}, url: require('node:url'),
        './videos.json': [], 'font-list-universal': {}
    };
    const module = {exports: {}};
    vm.runInNewContext(fs.readFileSync(require.resolve('../preload.js'), 'utf8'), {
        module,
        setTimeout,
        require: name => { assert.ok(name in modules, name); return modules[name]; }
    });
    module.exports(modules['electron-store']);
    return {api: exposed, calls, listeners, values, missing: () => { exists = false; }};
}

test('preload blocks unapproved send, receive and invoke channels', () => {
    const f = bridge();
    for (const channel of ['arbitrary', '__proto__', 'constructor', 'compatibleVideo']) {
        f.api.ipcRenderer.send(channel, 'payload');
        f.api.ipcRenderer.on(channel, () => assert.fail('Unapproved callback'));
    }
    for (const channel of ['arbitrary', '__proto__', 'quitApp']) {
        assert.equal(f.api.ipcRenderer.invoke(channel), undefined);
    }
    assert.deepEqual(f.calls, []);
    assert.equal(f.listeners.size, 0);
});

test('preload reads and edits central settings through IPC without a disk store', () => {
    const f = bridge(true);
    assert.equal(f.api.store.get('cachePath'), 'cache');
    f.api.store.set('allow4K', false);
    assert.equal(f.values.allow4K, false);
    assert.equal(f.api.store.get('allow4K'), false);
    assert.ok(f.calls.some(call => call[1] === 'settings-write'));
});

test('preload forwards approved IPC and strips privileged events before callbacks', async () => {
    const f = bridge();
    f.api.ipcRenderer.send('keyPress', 'Escape');
    assert.equal(await f.api.ipcRenderer.invoke('newVideoId', 'old'), 'reply');
    let received;
    f.api.ipcRenderer.on('displaySettings', (...args) => {
        assert.equal(f.calls.at(-1)[0], 'invalidate');
        received = args;
    });
    f.listeners.get('displaySettings')({sender: 'privileged'}, 'one', 'two');
    assert.deepEqual(received, ['one', 'two']);
    assert.deepEqual(f.calls.slice(0, 2), [['send', 'keyPress', 'Escape'], ['invoke', 'newVideoId', 'old']]);
});

test('converted playback requires enabled preparation and an existing output', () => {
    const f = bridge();
    assert.match(f.api.convertedVideo({id: 'a'}), /^file:.*a\.mp4$/);
    f.values.prepareCompatibleVideos = false;
    assert.equal(f.api.convertedVideo({id: 'a'}), null);
    f.values.prepareCompatibleVideos = true;
    f.missing();
    assert.equal(f.api.convertedVideo({id: 'a'}), null);
});

test('preload settings and source helpers honor current permissions', () => {
    const f = bridge();
    f.values.allowH265 = false;
    assert.deepEqual(f.api.videoSources({src: {H2641080p: 'h264', H2654k: '4k'}}), ['h264']);
    f.api.store.set('allow4K', false);
    assert.deepEqual(f.calls, [['set', 'allow4K', false]]);
    assert.equal(f.api.store.get('cachePath'), 'cache');
});
