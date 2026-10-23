const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {fileURLToPath} = require('node:url');
const {createCompatibilityPlayer} = require('../playback');
const {getVideoSources} = require('../video-sources');

function renderer(successfulSources, downloaded = [], convert = async () => 'converted', settings = {}) {
    const attempts = [];
    class Player extends EventTarget {
        load() {
            attempts.push(this.src);
            queueMicrotask(() => this.dispatchEvent(new Event(successfulSources.includes(this.src) ? 'loadeddata' : 'error')));
        }
    }
    const context = vm.createContext({
        setTimeout, clearTimeout, WeakMap, Set,
        electron: {
            videoSources: video => getVideoSources(video, {get: key => settings[key]}),
            store: {get: key => ({downloadedVideos: downloaded, cachePath: '/cache'})[key]},
            ipcRenderer: {invoke: convert}
        }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/playback.js'), 'utf8') + '\nglobalThis.playback = videoPlayback;', context);
    return {playback: context.playback, player: new Player(), attempts};
}

const video = {id: 'sample', src: {H2641080p: '1080', H2651080p: 'hevc1080', H2654k: '4k', H2654k240: '240'}};

test('preview prefers cache and falls back through all qualities', async () => {
    const cached = renderer(['/cache/sample.mov'], ['sample']);
    await cached.playback.load(cached.player, video);
    assert.deepEqual(cached.attempts, ['/cache/sample.mov']);
    const fallback = renderer(['240'], ['sample']);
    await fallback.playback.load(fallback.player, video);
    assert.deepEqual(fallback.attempts, ['/cache/sample.mov', '1080', 'hevc1080', '4k', '240']);
});

test('screensaver prefers 4K240 and handles HEVC-only entries', async () => {
    const selected = renderer(['4k'], [], undefined, {prefer4K240: true});
    await selected.playback.load(selected.player, video);
    assert.deepEqual(selected.attempts, ['240', '4k']);
    const only = renderer(['240']);
    await only.playback.load(only.player, {id: 'new', src: {H2654k240: '240'}});
    assert.deepEqual(only.attempts, ['240']);
});

test('unsupported native sources request compatible playback by ID', async () => {
    const messages = [];
    const result = renderer(['converted'], [], async (channel, id) => {
        assert.equal(channel, 'compatibleVideo');
        assert.equal(id, 'sample');
        return 'converted';
    });
    await result.playback.load(result.player, video, status => messages.push(status));
    assert.equal(result.attempts.at(-1), 'converted');
    assert.ok(messages.some(message => message.includes('Preparing')));
    assert.equal(messages.at(-1), '');
});

test('changing selection cancels an outstanding conversion', async () => {
    let complete;
    const result = renderer(['1080'], [], () => new Promise(resolve => { complete = resolve; }));
    const first = result.playback.load(result.player, {id: 'old', src: {H2654k240: 'unsupported'}});
    while (!complete) {
        await new Promise(resolve => setImmediate(resolve));
    }
    await result.playback.load(result.player, video);
    complete('converted');
    await assert.rejects(first, /Playback cancelled/);
    assert.equal(result.player.src, '1080');
});

test('FFmpeg converts 10-bit HEVC 240fps and reuses one concurrent conversion', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aerial-playback-'));
    try {
        const input = path.join(directory, 'input.mov');
        execFileSync(require('ffmpeg-static'), ['-y', '-v', 'error', '-f', 'lavfi', '-i',
            'testsrc2=size=320x180:rate=240:duration=0.25', '-c:v', 'libx265', '-pix_fmt', 'yuv420p10le', '-tag:v', 'hvc1', input],
        {windowsHide: true, stdio: 'pipe'});
        const convert = createCompatibilityPlayer(path.join(directory, 'converted'));
        const [first, second] = await Promise.all([convert({path: input}), convert({path: input})]);
        assert.equal(first, second);
        assert.equal(await convert({path: input}), first);
        assert.ok(fs.statSync(fileURLToPath(first)).size > 0);
        execFileSync(require('ffmpeg-static'), ['-v', 'error', '-i', fileURLToPath(first), '-f', 'null', '-'], {windowsHide: true});
    } finally {
        assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

test('format permissions filter sources and ignore disabled 4K240 preference', () => {
    const settings = values => ({get: key => values[key]});
    assert.deepEqual(getVideoSources(video, settings({})), ['1080', 'hevc1080', '4k', '240']);
    assert.deepEqual(getVideoSources(video, settings({prefer4K240: true})), ['240', '4k', 'hevc1080', '1080']);
    assert.deepEqual(getVideoSources(video, settings({allowH265: false, prefer4K240: true})), ['1080']);
    assert.deepEqual(getVideoSources(video, settings({allow4K: false, prefer4K240: true})), ['1080', 'hevc1080']);
    const only240 = {src: {H2654k240: '240'}};
    assert.deepEqual(getVideoSources(only240, settings({allow4K: false})), []);
    assert.deepEqual(getVideoSources(only240, settings({allowH265: false})), []);
    assert.deepEqual(getVideoSources({path: '/custom.mp4'}, settings({allowH265: false})), ['/custom.mp4']);
});

test('disabled formats cannot be played from cache or converted', async () => {
    const result = renderer(['/cache/sample.mov'], ['sample'], async () => { throw Error('Should not convert'); }, {allow4K: false});
    await assert.rejects(result.playback.load(result.player, {id: 'sample', src: {H2654k240: '240'}}), /excluded/);
    assert.deepEqual(result.attempts, []);
});

test('4K240 preference keeps cached playback first', async () => {
    const result = renderer(['/cache/sample.mov'], ['sample'], undefined, {prefer4K240: true});
    await result.playback.load(result.player, video);
    assert.deepEqual(result.attempts, ['/cache/sample.mov']);
});


test('runtime recovery skips sources that loaded but did not play smoothly', async () => {
    const result = renderer(['240', '4k'], [], undefined, {prefer4K240: true});
    await result.playback.load(result.player, video, () => {}, {skipSources: ['240']});
    assert.deepEqual(result.attempts, ['4k']);
    assert.equal(result.player.playbackSource, '4k');
});

test('runtime recovery keeps cache preference unless the cache itself failed', async () => {
    const result = renderer(['1080'], ['sample']);
    await result.playback.load(result.player, video, () => {}, {skipSources: ['/cache/sample.mov']});
    assert.deepEqual(result.attempts, ['1080']);
});

test('an already failed compatibility output is not retried indefinitely', async () => {
    const result = renderer(['converted']);
    await assert.rejects(result.playback.load(result.player, video, () => {}, {
        skipSources: ['1080', 'hevc1080', '4k', '240', 'converted']
    }), /could not play smoothly/);
    assert.deepEqual(result.attempts, []);
});
