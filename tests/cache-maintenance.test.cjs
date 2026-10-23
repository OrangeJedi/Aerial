const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function cache(options = {}) {
    const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
    const calls = [];
    const data = {downloadedVideos: ['a', 'b'], neverDownloadVideos: ['b'], ...options.settings};
    const entry = (name, directory = false) => ({name, isDirectory: () => directory});
    const context = vm.createContext({
        cachePath: 'cache', downloading: false, console: {error: (...args) => calls.push(['error', ...args])}, path,
        store: {get store() { return data; }, set: value => { calls.push(['save', value]); Object.assign(data, value); }},
        getVideosToDownload: () => ['a'],
        fs: {promises: {
            readdir: async (directory, flags) => {
                calls.push(['read', directory]);
                if (options.read) {
                    return options.read(directory, flags, entry, context);
                }
                if (!flags) {
                    return ['a.mov', 'notes.txt', 'converted'];
                }
                return directory === 'cache' ? [entry('a.mov'), entry('temp', true), entry('converted', true)]
                    : [entry('output.mp4'), entry('unexpected', true)];
            },
            stat: async () => ({size: 10}), mkdir: async () => {},
            unlink: async file => {
                calls.push(['unlink', file]);
                if (options.fail) {
                    throw Object.assign(new Error('Delete failed'), {code: options.fail});
                }
            }
        }}
    });
    const start = source.indexOf('async function getCacheSizeAsync(');
    vm.runInContext(source.slice(start, source.indexOf('//open & close functions', start)), context);
    return {context, calls, data};
}

test('cache deletion removes videos and converted files while preserving directories', async () => {
    const f = cache();
    await f.context.removeAllVideosInCache();
    assert.deepEqual(f.calls.filter(call => call[0] === 'unlink').map(call => call[1]),
        [path.join('cache', 'a.mov'), path.join('cache', 'converted', 'output.mp4')]);
    assert.deepEqual(Array.from(f.data.downloadedVideos), ['a']);
    assert.equal(f.data.videoCacheSize, 20);
});

test('pruning excludes forbidden videos and rescans only after deleting files', async () => {
    const f = cache({settings: {videoCacheRemoveUnallowed: true}});
    await f.context.pruneVideoCache();
    assert.deepEqual(f.calls.filter(call => call[0] === 'unlink'), [['unlink', path.join('cache', 'b.mov')]]);
    assert.equal(f.calls.filter(call => call[0] === 'save').length, 1);
});

test('missing files are tolerated and failed maintenance does not block later jobs', async () => {
    const missing = cache({fail: 'ENOENT'});
    await missing.context.pruneVideoCache();
    assert.equal(missing.calls.filter(call => call[0] === 'save').length, 0);
    const failed = cache({fail: 'EACCES'});
    await failed.context.pruneVideoCache();
    let ran = false;
    await failed.context.maintainCache(() => { ran = true; });
    assert.equal(ran, true);
    assert.equal(failed.calls.filter(call => call[0] === 'error').length, 1);
});

test('cache refresh does not overwrite a download queue playlist', async () => {
    const f = cache();
    f.context.downloading = true;
    let notified = false;
    await f.context.updateVideoCache(() => { notified = true; });
    assert.deepEqual(f.data.downloadedVideos, ['a', 'b']);
    assert.equal(f.data.videoCacheSize, 20);
    assert.equal(notified, true);
});

test('cache refresh discards stale results after changing cache location', async () => {
    const f = cache({read: (directory, flags, entry, context) => {
        context.cachePath = 'new-cache';
        return flags ? [] : ['old.mov'];
    }});
    let notified = false;
    await f.context.updateVideoCache(() => { notified = true; });
    assert.equal(f.calls.filter(call => call[0] === 'save').length, 0);
    assert.equal(notified, false);
});

test('temporary cache cleanup preserves directories', async () => {
    const f = cache();
    await f.context.clearCacheTemp();
    assert.deepEqual(f.calls.filter(call => call[0] === 'unlink'),
        [['unlink', path.join('cache', 'temp', 'output.mp4')]]);
});
