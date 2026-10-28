const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

function bridge(realSettings = false, fontOptions = {}, argv = []) {
    const calls = [];
    const listeners = new Map();
    const values = {prepareCompatibleVideos: true, cachePath: 'cache'};
    let exposed;
    let exists = true;
    const settings = {get: key => values[key], set: (...args) => calls.push(['set', ...args]),
        invalidate: () => calls.push(['invalidate'])};
    const modules = {
        './build-mode': require('../src/build-mode'),
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
        'electron-store': class {}, './settings-store': realSettings ? require('../src/settings-store') : {createSettingsStore: () => settings},
        './video-sources': require('../src/video-sources'), './playback': {convertedPath: () => 'C:/cache/converted/a.mp4'},
        path: require('node:path'), fs: {existsSync: () => exists}, url: require('node:url'),
        '../web/config/settings.json': require('../web/config/settings.json'), '../videos.json': [], '../localized/locales.json': require('../localized/locales.json'),
        './video-localization': require('../src/video-localization'),
        'font-list-universal': {getFonts: async () => ['Fallback Font']},
        child_process: {execFile: (command, args, callback) => {
            assert.equal(command, 'cscript');
            assert.equal(args[0], '//nologo');
            callback(fontOptions.error, fontOptions.stdout, '');
        }}, os: require('node:os')
    };
    const module = {exports: {}};
    vm.runInNewContext(fs.readFileSync(require.resolve('../src/preload.js'), 'utf8'), {
        module,
        process: {platform: 'win32', argv},
        console: {log() {}},
        setTimeout,
        require: Object.assign(name => {
            assert.ok(name in modules, name);
            return modules[name];
        }, {resolve: () => 'C:/font-list-universal/index.js'})
    });
    module.exports(modules['electron-store']);
    return {api: exposed, calls, listeners, values, missing: () => { exists = false; }};
}

test('preload identifies window previews from launch arguments', () => {
    assert.equal(bridge().api.windowPreview, false);
    assert.equal(bridge(false, {}, ['--aerial-window-preview']).api.windowPreview, true);
});

test('preload distinguishes embedded Windows previews from standalone previews', () => {
    const preview = bridge(false, {}, ['--aerial-embedded-preview']).api;
    assert.equal(preview.embeddedPreview, true);
    assert.equal(preview.windowPreview, false);
    assert.equal(bridge().api.embeddedPreview, false);
});

test('preload supplies file URLs for custom videos, escaping URL punctuation', () => {
    const f = bridge();
    const file = require('node:path').resolve('custom videos', 'Demo #1 100%.mp4');
    assert.deepEqual(f.api.videoSources({path: file}), [require('node:url').pathToFileURL(file).href]);
    assert.match(f.api.videoSources({path: file})[0], /Demo%20%231%20100%25\.mp4$/);
});

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

test('preload forwards monitor playback state to the main process', () => {
    const f = bridge();
    const state = {playing: ['old', 'new'], pending: 'next'};
    f.api.ipcRenderer.send('videoPlaybackState', state);
    assert.deepEqual(f.calls, [['send', 'videoPlaybackState', state]]);
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

test('update IPC exposes status and restart commands without forwarding privileged events', async () => {
    const f = bridge();
    f.api.ipcRenderer.send('restartForUpdate');
    f.api.ipcRenderer.send('checkForUpdates');
    assert.equal(await f.api.ipcRenderer.invoke('getUpdateStatus'), 'reply');
    let received;
    f.api.ipcRenderer.on('updateStatus', state => { received = state; });
    f.listeners.get('updateStatus')({sender: 'privileged'}, {status: 'ready', version: '1.4.0'});
    assert.deepEqual(received, {status: 'ready', version: '1.4.0'});
    assert.deepEqual(f.calls.slice(0, 3), [
        ['send', 'restartForUpdate', undefined], ['send', 'checkForUpdates', undefined],
        ['invoke', 'getUpdateStatus', undefined]
    ]);
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

test('config metadata and accent IPC use the restricted preload bridge', async () => {
    const f = bridge();
    assert.equal(f.api.settingsDefinition.at(-1).id, 'about');
    assert.equal(await f.api.ipcRenderer.invoke('getConfigAccent'), 'reply');
    let accent;
    f.api.ipcRenderer.on('configAccentChanged', color => { accent = color; });
    f.listeners.get('configAccentChanged')({sender: 'privileged'}, '0078d4ff');
    assert.equal(accent, '0078d4ff');
});

test('preload settings and source helpers honor current permissions', () => {
    const f = bridge();
    f.values.allowH265 = false;
    assert.deepEqual(f.api.videoSources({src: {H2641080p: 'h264', H2654k: '4k'}}), ['h264']);
    f.api.store.set('allow4K', false);
    assert.deepEqual(f.calls, [['set', 'allow4K', false]]);
    assert.equal(f.api.store.get('cachePath'), 'cache');
});

test('Windows font enumeration returns sorted unique display names instead of file paths', async () => {
    const f = bridge(false, {stdout: 'C:\\Fonts\\helvetica.otf\tHelvetica Neue LT Std Regular\r\n'
        + 'C:\\Fonts\\arial.ttf\t"Arial"\r\nC:\\Fonts\\arial.ttf\tArial\r\nC:\\Fonts\\unknown.ttf\r\n'});
    assert.deepEqual(Array.from(await f.api.fontListUniversal.getFonts()), ['Arial', 'Helvetica Neue LT Std Regular']);
});

test('Windows font enumeration falls back when the script fails', async () => {
    const f = bridge(false, {error: new Error('Script unavailable')});
    assert.deepEqual(await f.api.fontListUniversal.getFonts(), ['Fallback Font']);
});
