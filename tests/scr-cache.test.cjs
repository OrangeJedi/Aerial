const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {runtimeKey, cachedPortableScript} = require('../tools/build/scr-cache.cjs');

test('SCR runtime keys change for asset edits and renames, even without a version change', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aerial-runtime-key-'));
    t.after(async () => {
        assert.equal(path.dirname(directory), os.tmpdir());
        await fs.rm(directory, {recursive: true, force: true});
    });
    await fs.mkdir(path.join(directory, 'resources'));
    await fs.writeFile(path.join(directory, 'resources', 'app.asar'), 'application');
    await fs.writeFile(path.join(directory, 'Aerial.exe'), 'runtime');
    const original = await runtimeKey(directory);
    assert.equal(await runtimeKey(directory), original);
    await fs.writeFile(path.join(directory, 'Aerial.exe'), 'changed runtime');
    assert.notEqual(await runtimeKey(directory), original);
    await fs.writeFile(path.join(directory, 'Aerial.exe'), 'runtime');
    assert.equal(await runtimeKey(directory), original);
    await fs.rename(path.join(directory, 'Aerial.exe'), path.join(directory, 'Other.exe'));
    assert.notEqual(await runtimeKey(directory), original);
});

test('SCR portable cache serializes extraction and releases its lock before launching the app', async () => {
    const template = await fs.readFile(path.join(path.dirname(require.resolve('app-builder-lib/package.json')), 'templates', 'nsis', 'portable.nsi'), 'utf8');
    const script = cachedPortableScript(template, 'a'.repeat(64));
    assert.match(script, /\$LOCALAPPDATA\\Aerial\\scr-runtime\\a{64}/);
    assert.ok(script.indexOf('WaitForSingleObject') < script.indexOf('IfFileExists "$INSTDIR\\.complete"'));
    assert.ok(script.indexOf('FileWrite $R8') > script.indexOf('File /r'));
    const ready = script.slice(script.indexOf('runtimeReady:'));
    assert.ok(ready.indexOf('ReleaseMutex') < ready.indexOf('ExecWait'));
    assert.doesNotMatch(script.slice(script.indexOf('ExecWait')), /RMDir/);
    assert.throws(() => cachedPortableScript('changed template', 'a'.repeat(64)), /template changed/);
    assert.throws(() => cachedPortableScript(template, '../bad'), /Invalid SCR runtime cache key/);
});
