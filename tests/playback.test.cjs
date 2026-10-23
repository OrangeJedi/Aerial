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

function renderer(successfulSources, downloaded = [], convert = async () => 'converted', settings = {}, clock = Date) {
    const attempts = [];
    class Player extends EventTarget {
        constructor() {
            super();
            this.readyState = 4;
            this.currentTime = 0;
            this.duration = 60;
            this.playbackRate = 1;
            this.buffered = {length: 1, start: () => 0, end: () => 60};
        }
        pause() { this.paused = true; }
        removeAttribute(name) { delete this[name]; }
        load() {
            if (!this.src) {
                return;
            }
            const source = this.src;
            attempts.push(source);
            queueMicrotask(() => {
                if (this.src === source) {
                    this.dispatchEvent(new Event(successfulSources.includes(source) ? 'loadeddata' : 'error'));
                }
            });
        }
    }
    const context = vm.createContext({
        setTimeout, clearTimeout, WeakMap, Set, Date: clock,
        electron: {
            videoSources: video => getVideoSources(video, {get: key => settings[key]}),
            store: {get: key => ({downloadedVideos: downloaded, cachePath: '/cache', prepareCompatibleVideos: true, ...settings})[key]},
            ipcRenderer: {invoke: convert}
        }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/playback.js'), 'utf8') + '\nglobalThis.playback = videoPlayback;', context);
    return {playback: context.playback, player: new Player(), attempts, Player, context, electron: context.electron};
}

const video = {id: 'sample', src: {H2641080p: '1080', H2651080p: 'hevc1080', H2654k: '4k', H2654k240: '240'}};

test('missing video metadata rejects cleanly and leaves playback usable', async () => {
    const result = renderer(['1080']);
    for (const missing of [undefined, null, {}, {id: ''}]) {
        await assert.rejects(result.playback.load(result.player, missing), /Video metadata is missing or invalid/);
    }
    assert.deepEqual(result.attempts, []);
    await result.playback.load(result.player, video);
    assert.equal(result.player.src, '1080');
});

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
        const convertedDirectory = path.join(directory, 'converted');
        fs.mkdirSync(convertedDirectory);
        const output = require('../playback').convertedPath(convertedDirectory, {path: input});
        const interrupted = `${output}.partial.mp4`;
        const interruptedAttempt = `${output}.old-attempt.partial.mp4`;
        fs.writeFileSync(interrupted, 'incomplete video');
        fs.writeFileSync(interruptedAttempt, 'incomplete video');
        const convert = createCompatibilityPlayer(convertedDirectory);
        const [first, second] = await Promise.all([convert({path: input}), convert({path: input})]);
        assert.equal(first, second);
        assert.equal(fs.existsSync(interrupted), false);
        assert.equal(fs.existsSync(interruptedAttempt), false);
        assert.deepEqual(fs.readdirSync(convertedDirectory), [path.basename(output)]);
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

test('failed sources are remembered per video and retried after the cooldown', async () => {
    let now = 1000;
    const sources = ['4k'];
    const result = renderer(sources, [], undefined, {prefer4K240: true}, {now: () => now});
    await result.playback.load(result.player, video);
    assert.deepEqual(result.attempts, ['240', '4k']);
    sources.push('240');
    result.attempts.length = 0;
    await result.playback.load(result.player, video);
    assert.deepEqual(result.attempts, ['4k']);
    now += 5 * 60 * 1000;
    result.attempts.length = 0;
    await result.playback.load(result.player, video);
    assert.deepEqual(result.attempts, ['240']);
});

test('runtime failures affect subsequent visits without changing source preference', async () => {
    const result = renderer(['240', '4k'], [], undefined, {prefer4K240: true});
    result.playback.markFailed(video.id, '240');
    await result.playback.load(result.player, video);
    assert.deepEqual(result.attempts, ['4k']);
    await result.playback.load(result.player, {...video, id: 'different'});
    assert.equal(result.attempts.at(-1), '240');
});

test('known failed compatibility output is skipped before another IPC request', async () => {
    let conversions = 0;
    const result = renderer(['converted'], [], async () => { conversions++; return 'converted'; });
    await result.playback.load(result.player, video);
    result.playback.markFailed(video.id, 'converted');
    result.attempts.length = 0;
    await assert.rejects(result.playback.load(result.player, video), /could not play smoothly/);
    assert.equal(conversions, 1);
    assert.deepEqual(result.attempts, []);
});

test('cancelling an unfinished load releases its source without marking it as failed', async () => {
    const result = renderer(['1080']);
    result.player.load = () => {};
    const pending = result.playback.load(result.player, video);
    assert.equal(result.player.src, '1080');
    result.playback.cancel(result.player);
    await assert.rejects(pending, /Playback cancelled/);
    assert.equal(result.player.src, undefined);
    result.player.load = result.Player.prototype.load;
    await result.playback.load(result.player, video);
    assert.deepEqual(result.attempts, ['1080']);
});

test('cancel preserves a loaded frozen frame until explicit release', async () => {
    const result = renderer(['1080']);
    await result.playback.load(result.player, video);
    result.playback.cancel(result.player);
    assert.equal(result.player.src, '1080');
    result.playback.release(result.player);
    assert.equal(result.player.src, undefined);
    assert.equal(result.player.paused, true);
});

test('cancelling a conversion wait rejects immediately and ignores its eventual result', async () => {
    let complete;
    const result = renderer(['1080'], [], () => new Promise(resolve => { complete = resolve; }));
    const pending = result.playback.load(result.player, {id: 'old', src: {H2654k240: 'unsupported'}});
    while (!complete) {
        await new Promise(resolve => setImmediate(resolve));
    }
    result.playback.cancel(result.player);
    await assert.rejects(pending, /Playback cancelled/);
    await result.playback.load(result.player, video);
    complete('converted');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(result.player.src, '1080');
});

test('expired compatibility failures revalidate the existing fallback URL', async () => {
    let now = 0;
    let conversions = 0;
    const result = renderer(['converted'], [], async () => { conversions++; return 'converted'; }, {}, {now: () => now});
    await result.playback.load(result.player, video);
    result.playback.markFailed(video.id, 'converted');
    now += 5 * 60 * 1000;
    await result.playback.load(result.player, video);
    assert.equal(conversions, 2);
    assert.equal(result.attempts.at(-1), 'converted');
});


test('disabled compatibility preparation never invokes conversion', async () => {
    let called = false;
    const result = renderer([], [], async () => { called = true; }, {prepareCompatibleVideos: false});
    await assert.rejects(result.playback.load(result.player, video), /preparation is disabled/);
    assert.equal(called, false);
});
const {deleteConvertedOriginal, convertedPath} = require('../playback');

test('finished conversions delete originals, while incomplete conversions preserve them', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aerial-delete-'));
    try {
        const original = path.join(directory, 'original.mov');
        const output = path.join(directory, 'converted.mp4');
        const source = require('node:url').pathToFileURL(output).href;
        fs.writeFileSync(original, 'original');
        await assert.rejects(deleteConvertedOriginal(source, original));
        assert.ok(fs.existsSync(original));
        fs.writeFileSync(output, '');
        await assert.rejects(deleteConvertedOriginal(source, original));
        assert.ok(fs.existsSync(original));
        fs.writeFileSync(output, 'finished');
        await deleteConvertedOriginal(source, original);
        assert.equal(fs.existsSync(original), false);
        assert.ok(fs.existsSync(output));
        await deleteConvertedOriginal(source, original);
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

test('conversion identity survives removal of the original and cache location changes', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aerial-reuse-'));
    try {
        const video = {id: 'sample', path: 'deleted-original.mov'};
        const output = convertedPath(directory, video);
        fs.writeFileSync(output, 'finished');
        const convert = createCompatibilityPlayer(() => directory);
        assert.equal(fileURLToPath(await convert(video)), output);
        assert.equal(fileURLToPath(await convert({...video, path: 'remote-source'})), output);
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});


test('unset compatibility flag disables conversion by default', async () => {
    const result = renderer([], [], async () => { throw Error('Must not convert'); }, {prepareCompatibleVideos: undefined});
    await assert.rejects(result.playback.load(result.player, video), /preparation is disabled/);
});

test('completed conversions are preferred and reused without preparation status', async () => {
    const result = renderer(['converted'], [], async () => 'converted');
    result.electron.convertedVideo = () => 'converted';
    const messages = [];
    await result.playback.load(result.player, video, status => messages.push(status));
    assert.deepEqual(result.attempts, ['converted']);
    assert.equal(messages.some(status => status.includes('Preparing')), false);
});


test('failed conversion removes partial output and preserves the original for retry', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aerial-interrupted-'));
    try {
        const input = path.join(directory, 'input.mov');
        fs.writeFileSync(input, 'invalid video');
        const convertedDirectory = path.join(directory, 'converted');
        const convert = createCompatibilityPlayer(convertedDirectory);
        await assert.rejects(convert({path: input}));
        assert.equal(fs.readFileSync(input, 'utf8'), 'invalid video');
        assert.deepEqual(fs.readdirSync(convertedDirectory), []);
        execFileSync(require('ffmpeg-static'), ['-y', '-v', 'error', '-f', 'lavfi', '-i',
            'color=size=32x32:duration=0.1', '-c:v', 'libx264', input], {windowsHide: true});
        const source = await convert({path: input});
        assert.ok(fs.statSync(fileURLToPath(source)).size > 0);
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

test('first frame alone does not bypass buffer readiness', async () => {
    const result = renderer(['1080']);
    let end = 0.2;
    result.player.buffered = {length: 1, start: () => 0, end: () => end};
    let ready = false;
    const loading = result.playback.load(result.player, video).then(() => { ready = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ready, false);
    end = 2;
    result.player.dispatchEvent(new Event('progress'));
    await loading;
    assert.equal(ready, true);
});

test('paused buffering wait is bounded and cleans up both timers', async () => {
    const result = renderer(['1080']);
    const timers = new Map();
    let id = 0;
    result.context.setTimeout = (callback, delay) => { timers.set(++id, {callback, delay}); return id; };
    result.context.clearTimeout = timer => timers.delete(timer);
    result.player.buffered = {length: 0};
    const loading = result.playback.load(result.player, video);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(timers.size, 2);
    [...timers.values()].find(timer => timer.delay === 3000).callback();
    await loading;
    assert.equal(timers.size, 0);
});

test('short clips need only their remaining buffered duration', async () => {
    const result = renderer(['1080']);
    result.player.duration = 0.4;
    result.player.buffered = {length: 1, start: () => 0, end: () => 0.4};
    await result.playback.load(result.player, video);
    assert.deepEqual(result.attempts, ['1080']);
});

test('cancelling during buffer readiness stops the wait and preserves source eligibility', async () => {
    const result = renderer(['1080']);
    result.player.buffered = {length: 0};
    const loading = result.playback.load(result.player, video);
    await new Promise(resolve => setImmediate(resolve));
    result.playback.cancel(result.player);
    await assert.rejects(loading, /Playback cancelled/);
    result.player.buffered = {length: 1, start: () => 0, end: () => 60};
    await result.playback.load(result.player, video);
    assert.deepEqual(result.attempts, ['1080', '1080']);
});

test('buffered ranges beyond a gap do not count as available playback', () => {
    const result = renderer(['1080']);
    result.player.currentTime = 5;
    result.player.buffered = {length: 2, start: index => [0, 10][index], end: index => [1, 20][index]};
    assert.equal(result.playback.bufferedAhead(result.player), 0);
    result.player.currentTime = 15;
    assert.equal(result.playback.bufferedAhead(result.player), 5);
});
