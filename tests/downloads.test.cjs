const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const {getVideoSources} = require('../src/video-sources');

function fixture(options = {}) {
    const source = fs.readFileSync(require.resolve('../src/app.js'), 'utf8');
    const start = source.indexOf('async function downloadVideos()');
    const end = source.indexOf('// Cache maintenance runs', start);
    const videos = ['a', 'b'].map(id => ({id, src: {H2641080p: id}}));
    const data = {videoCache: true, allowedVideos: ['a', 'b'], downloadedVideos: [], ...options.settings};
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const events = [];
    let writes = 0;
    const context = vm.createContext({
        cachePath: 'cache', downloading: false, videosById: new Map(videos.map(video => [video.id, video])),
        store: {get store() { return structuredClone(data); }, get: key => structuredClone(data[key]),
            set: changes => { writes++; Object.assign(data, changes); }},
        getVideoSources, convertedPath: () => 'converted', path: require('node:path'),
        console: {error: (...args) => events.push(['error', ...args])},
        downloadFile: async (url) => { events.push(['download', url]); await pending; },
        fs: {promises: {
            copyFile: async () => {
                events.push(['copy']);
                if (options.failCopy) {
                    throw new Error('Disk full');
                }
            },
            unlink: async () => events.push(['unlink']),
            readdir: async () => [],
            access: async () => { throw Object.assign(new Error(), {code: 'ENOENT'}); }
        }}
    });
    vm.runInContext(source.slice(start, end), context);
    return {context, data, events, release, writes: () => writes};
}

test('one download queue waits for copying and persists completion in one write per video', async () => {
    const f = fixture();
    const running = f.context.downloadVideos();
    await f.context.downloadVideos();
    assert.equal(f.events.filter(event => event[0] === 'download').length, 1);
    assert.equal(f.writes(), 0);
    f.release();
    await running;
    assert.deepEqual(Array.from(f.data.downloadedVideos), ['a', 'b']);
    assert.equal(f.writes(), 2);
    assert.equal(f.context.downloading, false);
    assert.deepEqual(f.events.map(event => event[0]), ['download', 'copy', 'unlink', 'download', 'copy', 'unlink']);
});

test('copy failures clean temporary files and release the queue without marking completion', async () => {
    const f = fixture({failCopy: true});
    f.release();
    await f.context.downloadVideos();
    assert.equal(f.writes(), 0);
    assert.equal(f.context.downloading, false);
    assert.ok(f.events.some(event => event[0] === 'unlink'));
    assert.ok(f.events.some(event => event[0] === 'error'));
});

test('download exclusions remove only excluded videos without mutating the playlist', () => {
    const f = fixture({settings: {alwaysDownloadVideos: ['b'], neverDownloadVideos: ['a']}});
    assert.deepEqual(Array.from(f.context.getVideosToDownload()), ['b']);
    assert.deepEqual(f.data.allowedVideos, ['a', 'b']);
});
