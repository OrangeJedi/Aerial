const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function renderer(type = 'dissolve', direction = 'left', easierTransitions, overrides = {}) {
    const control = {holdLoads: false, pendingLoads: [], selections: 0, failures: [], statuses: [], htmlWrites: []};
    const players = [0, 1].map(() => ({
        style: {}, paused: true, currentTime: 0, duration: 60, playbackRate: 1, readyState: 4,
        listeners: {}, quality: {totalVideoFrames: 0, droppedVideoFrames: 0},
        pause() { this.paused = true; },
        play() { this.paused = false; return Promise.resolve(); },
        addEventListener(name, callback) { this.listeners[name] = callback; },
        removeAttribute() {}, load() {},
        getVideoPlaybackQuality() { return this.quality; }
    }));
    const frames = new Map();
    const timers = new Map();
    const events = {};
    const loads = [];
    const intervals = [];
    let sequence = 0;
    let now = 0;
    const chain = {css() { return chain; }, text(value) { control.statuses.push(value); return chain; }, html() { return chain; }};
    function schedule(callback, delay, ...args) {
        const id = ++sequence;
        timers.set(id, {callback: () => callback(...args), delay, due: now + Math.max(0, delay)});
        return id;
    }
    for (const player of players) {
        player.animate = (keyframes, options) => {
            let rejectAnimation;
            let timer;
            const finished = new Promise((resolve, reject) => {
                rejectAnimation = reject;
                timer = schedule(resolve, options.duration);
            });
            return {finished, cancel() {
                timers.delete(timer);
                rejectAnimation(new Error('Animation cancelled'));
            }};
        };
    }
    const settings = {easierTransitions, videoTransitionLength: 2000, playbackSpeed: 1, transitionType: type,
        transitionDirection: direction, displayText: {positionList: [], random: []}, ...overrides};
    const context = vm.createContext({
        console, performance: {now: () => now}, innerWidth: 1920, innerHeight: 1080,
        setTimeout: schedule,
        clearTimeout(id) { timers.delete(id); },
        setInterval(callback) { intervals.push(callback); return intervals.length; },
        clearInterval(id) { if (id) { intervals[id - 1] = () => {}; } },
        Date: class extends Date { getMilliseconds() { return 0; } },
        localizedDateTime: () => ({format: () => "12:34"}),
        requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
        cancelAnimationFrame(id) { frames.delete(id); },
        document: {getElementById: id => id === 'video' ? players[0] : id === 'video2' ? players[1] : {style: {}}, addEventListener() {}},
        $: selector => ({...chain, html(value) { control.htmlWrites.push({selector, value}); return chain; }}),
        electron: {videos: [{id: 'sample'}], store: {get: key => settings[key]},
            ipcRenderer: {invoke: async () => { control.selections++; return 'sample'; }, send() {}, on: (name, callback) => { events[name] = callback; }}},
        videoPlayback: {cancel() {}, bufferedAhead: player => player.bufferedSeconds ?? 60,
            release(player) { player.pause(); player.src = ''; player.playbackSource = null; },
            markFailed(id, source) { control.failures.push({id, source}); },
            async load(player, video, status, options) {
            status('Preparing a compatible video. This may take a few minutes the first time.');
            loads.push(options);
            player.pause();
            player.playbackSource = options.skipSources.length ? 'fallback' : 'primary';
            player.src = player.playbackSource;
            if (control.holdLoads) {
                await new Promise(resolve => control.pendingLoads.push(resolve));
            }
        }}
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/screensaver.js'), 'utf8'), context);
    return {players, loads, events, intervals, timers, frames, context, control, settings,
        async tick(time) {
            while (true) {
                const next = [...timers.entries()].filter(([, timer]) => timer.due <= time)
                    .sort((a, b) => a[1].due - b[1].due)[0];
                if (!next) {
                    break;
                }
                timers.delete(next[0]);
                now = next[1].due;
                next[1].callback();
                await flush();
            }
            now = time;
            const pending = [...frames.values()];
            frames.clear();
            pending.forEach(callback => callback(time));
            await flush();
        }};
}

async function flush() {
    for (let i = 0; i < 12; i++) {
        await Promise.resolve();
    }
}

test('previous video ignores preloads and keeps history local to each screen', async () => {
    const first = renderer('none');
    const second = renderer('none');
    await flush();
    first.events.previousVideo();
    await flush();
    assert.equal(first.control.selections, 1);
    first.events.newVideo();
    await flush();
    vm.runInContext('prepareNext()', first.context);
    await flush();
    assert.equal(first.control.selections, 3);
    first.events.previousVideo();
    await flush();
    assert.equal(first.control.selections, 3);
    assert.equal(vm.runInContext('historyIndex', first.context), 0);
    assert.equal(vm.runInContext('videoHistory.length', first.context), 2);
    assert.equal(vm.runInContext('videoHistory.length', second.context), 1);
    first.events.newVideo();
    await flush();
    assert.equal(vm.runInContext('videoHistory.length', first.context), 2);
    assert.equal(vm.runInContext('historyIndex', first.context), 1);
});

for (const type of ['dissolve', 'dipToBlack', 'fade', 'wipe', 'circle', 'fadeCircle']) {
    test(`${type} freezes incoming until midpoint and outgoing after midpoint`, async () => {
        const result = renderer(type, 'left', true);
        await flush();
        await result.tick(2000);
        result.events.newVideo();
        await flush();
        assert.equal(result.players[1].paused, false);
        assert.equal(result.players[0].paused, true);
        await result.tick(2999);
        assert.equal(result.players[1].paused, false);
        assert.equal(result.players[0].paused, true);
        await result.tick(3000);
        assert.equal(result.players[1].paused, true);
        assert.equal(result.players[0].paused, false);
        await result.tick(5500);
        assert.equal(result.players[1].style.visibility, 'hidden');
        assert.equal(result.players[0].style.visibility, 'visible');
        assert.equal(result.players[0].style.clipPath, 'none');
        assert.equal(result.frames.size, 0);
    });
}

test('sustained stalls retry the same video excluding its failed source', async () => {
    const result = renderer();
    await flush();
    await result.tick(2000);
    result.intervals[0]();
    result.intervals[0]();
    result.intervals[0]();
    await flush();
    assert.deepEqual(Array.from(result.loads.at(-1).skipSources), ['primary']);
    await result.tick(4000);
    assert.equal(result.players[0].src, 'fallback');
});

test('isolated frame drops recover without changing source', async () => {
    const result = renderer();
    await flush();
    await result.tick(2000);
    const player = result.players[1];
    result.intervals[0]();
    player.currentTime += 3;
    player.quality = {totalVideoFrames: 100, droppedVideoFrames: 50};
    result.intervals[0]();
    player.currentTime += 3;
    player.quality = {totalVideoFrames: 200, droppedVideoFrames: 50};
    result.intervals[0]();
    assert.equal(result.loads.length, 1);
});

test('blanking cancels a transition and pauses both videos', async () => {
    const result = renderer();
    await flush();
    result.events.blankTheScreen();
    await flush();
    assert.ok(result.players.every(player => player.paused));
    assert.equal(result.frames.size, 0);
    result.events.newVideo();
    await flush();
    assert.equal(result.loads.length, 1);
});

test('metadata updates once even when the transition takes many frames', async () => {
    const result = renderer();
    await flush();
    vm.runInContext('globalThis.updates = 0; drawDynamicText = () => { updates++; };', result.context);
    await result.tick(700);
    await result.tick(1000);
    await result.tick(1500);
    await result.tick(2000);
    assert.equal(result.context.updates, 1);
});


test('a rejected play promise advances to another source for the same video', async () => {
    const result = renderer('dissolve', 'left', true);
    result.players[1].play = () => Promise.reject(new Error('Decoder failed'));
    await flush();
    await result.tick(1000);
    assert.deepEqual(Array.from(result.loads.at(-1).skipSources), ['primary']);
    assert.equal(result.players[1].src, 'fallback');
});

test('sustained dropped frames trigger fallback but paused frames do not', async () => {
    const result = renderer();
    await flush();
    await result.tick(2000);
    const player = result.players[1];
    result.intervals[0]();
    for (let i = 1; i <= 2; i++) {
        player.currentTime += 3;
        player.quality = {totalVideoFrames: i * 100, droppedVideoFrames: i * 50};
        result.intervals[0]();
    }
    await flush();
    assert.equal(result.loads.length, 2);
    assert.deepEqual(Array.from(result.loads[1].skipSources), ['primary']);
    result.intervals[0]();
    result.intervals[0]();
    result.intervals[0]();
    assert.equal(result.loads.length, 2);
});


for (const type of ['dissolve', 'fade', 'wipe', 'circle', 'fadeCircle']) {
    for (const easierTransitions of [undefined, false]) {
        test(type + ' plays both videos throughout with Easier Transitions ' + easierTransitions, async () => {
            const result = renderer(type, 'left', easierTransitions);
            await flush();
            await result.tick(2000);
            result.events.newVideo();
            await flush();
            assert.ok(result.players.every(player => !player.paused));
            await result.tick(2999);
            assert.ok(result.players.every(player => !player.paused));
            await result.tick(3000);
            assert.ok(result.players.every(player => !player.paused));
            await result.tick(3999);
            assert.ok(result.players.every(player => !player.paused));
            await result.tick(4000);
            assert.equal(result.players[1].paused, true);
            assert.equal(result.players[0].paused, false);
            assert.equal(result.frames.size, 0);
        });
    }
}

test('prepares the spare ten seconds before the transition without starting playback', async () => {
    const result = renderer();
    await flush();
    await result.tick(2000);
    const next = [...result.timers.values()].find(timer => timer.delay === 57500);
    const preparation = [...result.timers.values()].find(timer => timer.delay === 47500);
    assert.equal(next.due - preparation.due, 10000);
    await result.tick(preparation.due);
    assert.equal(result.loads.length, 2);
    assert.equal(result.control.selections, 2);
    assert.equal(result.players[0].paused, true);
    assert.equal(result.players[0].style.visibility, 'hidden');
    assert.equal(result.players[1].paused, false);
    await result.tick(next.due);
    assert.equal(result.loads.length, 2);
    assert.equal(result.control.selections, 2);
    assert.equal(result.players[0].paused, false);
    assert.equal(result.players[1].paused, false);
});

test('a manual skip consumes an already prepared video instead of loading again', async () => {
    const result = renderer();
    await flush();
    await result.tick(2000);
    await result.tick(49500);
    result.events.newVideo();
    await flush();
    assert.equal(result.loads.length, 2);
    assert.equal(result.control.selections, 2);
    assert.ok(result.players.every(player => !player.paused));
});

test('late preparation keeps the outgoing video visible and waits before transitioning', async () => {
    const result = renderer();
    await flush();
    await result.tick(2000);
    result.control.holdLoads = true;
    await result.tick(49500);
    await result.tick(59500);
    assert.equal(result.players[1].paused, false);
    assert.equal(result.players[1].style.visibility, 'visible');
    assert.equal(result.players[0].paused, true);
    result.control.pendingLoads.shift()();
    await flush();
    assert.ok(result.players.every(player => !player.paused));
    assert.equal(result.loads.length, 2);
});

test('blanking releases a pending preload and prevents its late result from starting', async () => {
    const result = renderer();
    await flush();
    await result.tick(2000);
    result.control.holdLoads = true;
    await result.tick(49500);
    result.events.blankTheScreen();
    result.control.pendingLoads.shift()();
    await flush();
    await result.tick(62000);
    assert.ok(result.players.every(player => player.paused));
    assert.equal(result.loads.length, 2);
    assert.equal(result.frames.size, 0);
});

test('preloading does not disable health monitoring of the active video', async () => {
    const result = renderer();
    await flush();
    await result.tick(2000);
    result.control.holdLoads = true;
    await result.tick(49500);
    result.intervals[0]();
    result.intervals[0]();
    result.intervals[0]();
    await flush();
    assert.deepEqual(result.control.failures, [{id: 'sample', source: 'primary'}]);
    assert.equal(result.loads.length, 3);
    result.control.pendingLoads.forEach(resolve => resolve());
    await flush();
});

for (const type of ['dissolve', 'dipToBlack']) {
    test(type + ' uses browser animations with no per-frame JavaScript loop', async () => {
        const result = renderer(type);
        await flush();
        assert.equal(result.frames.size, 0);
        await result.tick(2000);
        assert.equal(result.players[1].paused, false);
        assert.equal(result.frames.size, 0);
    });
}


test('screensaver keeps conversion preparation status off screen', async () => {
    const result = renderer();
    await flush();
    await result.tick(2000);
    assert.ok(result.loads.length > 0);
    assert.equal(result.control.statuses.some(value => typeof value === 'string' && value.includes('Preparing a compatible')), false);
});

function frameCallbacks(result) {
    const callbacks = new Map();
    let id = 0;
    for (const player of result.players) {
        player.requestVideoFrameCallback = callback => { callbacks.set(++id, callback); return id; };
        player.cancelVideoFrameCallback = request => callbacks.delete(request);
    }
    return callbacks;
}

test('numeric string defaults leave filters completely disabled', async () => {
    const result = renderer('dissolve', 'left', false, {videoFilters: [
        {name: 'blur', value: '0', defaultValue: 0, suffix: 'px'},
        {name: 'brightness', value: '100', defaultValue: 100, suffix: '%'},
        {name: 'saturate', value: '100', defaultValue: 100, suffix: '%'}
    ]});
    await flush();
    await result.tick(2000);
    for (const player of result.players) {
        assert.equal(player.style.filter, 'none');
        assert.equal(player.style.clipPath, 'none');
        assert.equal(player.style.webkitMaskImage, 'none');
    }
    assert.equal(result.frames.size, 0);
});

test('only filters with changed finite values enter the CSS chain', () => {
    const result = renderer('dissolve', 'left', false, {videoFilters: [
        {name: 'blur', value: '5', defaultValue: 0, suffix: 'px'},
        {name: 'brightness', value: '100', defaultValue: 100, suffix: '%'},
        {name: 'sepia', value: 'invalid', defaultValue: 0, suffix: '%'}
    ]});
    assert.equal(result.players[0].style.filter, 'blur(5px)');
});

test('normal transition waits for playback to start before advancing visuals', async () => {
    const result = renderer();
    let start;
    result.players[1].play = () => new Promise(resolve => {
        result.players[1].paused = false;
        start = resolve;
    });
    await flush();
    await result.tick(1000);
    assert.equal(result.frames.size, 0);
    assert.equal(result.players[1].style.opacity, '0');
    start();
    await flush();
    await result.tick(2000);
    assert.notEqual(result.players[0].style.visibility, 'hidden');
    await result.tick(3000);
    assert.equal(result.players[0].style.visibility, 'hidden');
});

test('first presented frame starts the normal transition, with a bounded fallback', async () => {
    const result = renderer();
    const callbacks = frameCallbacks(result);
    await flush();
    assert.equal(callbacks.size, 1);
    await result.tick(300);
    assert.equal(result.players[1].style.opacity, '0');
    const [id, callback] = [...callbacks.entries()][0];
    callbacks.delete(id);
    callback(300, {presentedFrames: 1});
    await flush();
    await result.tick(2300);
    assert.equal(result.players[0].style.visibility, 'hidden');
    assert.equal(callbacks.size, 0);

    const fallback = renderer();
    const delayed = frameCallbacks(fallback);
    await flush();
    await fallback.tick(500);
    assert.equal(delayed.size, 0);
    await fallback.tick(2500);
    assert.equal(fallback.players[0].style.visibility, 'hidden');
});

test('temporary buffering does not blacklist or restart the current source', async () => {
    const result = renderer();
    await flush();
    await result.tick(2000);
    const player = result.players[1];
    result.intervals[0]();
    player.readyState = 2;
    player.bufferedSeconds = 0;
    player.listeners.waiting();
    await result.tick(5000);
    result.intervals[0]();
    await result.tick(11000);
    result.intervals[0]();
    assert.equal(result.control.failures.length, 0);
    assert.equal(result.loads.length, 1);
    player.readyState = 4;
    player.bufferedSeconds = 20;
    player.currentTime += 3;
    player.listeners.playing();
    result.intervals[0]();
    assert.equal(player.playbackStats.buffering, false);
    assert.equal(result.loads.length, 1);
});

test('persistent buffering still recovers after the grace period', async () => {
    const result = renderer();
    await flush();
    await result.tick(2000);
    result.intervals[0]();
    result.players[1].readyState = 2;
    result.players[1].bufferedSeconds = 0;
    await result.tick(5000);
    result.intervals[0]();
    await result.tick(20000);
    result.intervals[0]();
    await flush();
    assert.equal(result.loads.length, 2);
});

test('frame diagnostics sample once per health check without a per-frame loop', async () => {
    const result = renderer();
    await flush();
    await result.tick(2000);
    const callbacks = frameCallbacks(result);
    const player = result.players[1];
    result.intervals[0]();
    player.currentTime += 3;
    result.intervals[0]();
    assert.equal(callbacks.size, 1);
    let [id, callback] = [...callbacks.entries()][0];
    callbacks.delete(id);
    callback(3000, {presentedFrames: 10, processingDuration: 0.002});
    assert.equal(callbacks.size, 0);
    player.currentTime += 3;
    result.intervals[0]();
    [id, callback] = [...callbacks.entries()][0];
    callbacks.delete(id);
    callback(6000, {presentedFrames: 100, processingDuration: 0.003});
    assert.equal(player.playbackStats.presentedFps, 30);
    assert.equal(player.playbackStats.decodeMs, 3);
    assert.equal(callbacks.size, 0);
    assert.equal(result.frames.size, 0);
});

test('moving and blanking clock text clears the old per-line timers', async () => {
    const displayText = {positionList: ['left', 'right', 'random'], left: [{type: 'none'}],
        right: [{type: 'none'}], random: [{type: 'time', timeString: 'HH:mm', defaultFont: true}]};
    const result = renderer('dissolve', 'left', false, {displayText});
    await flush();
    await result.tick(800);
    for (let i = 0; i < 10; i++) {
        const previous = displayText.random[0].clockTimeout;
        vm.runInContext('switchRandomText();', result.context);
        assert.equal(result.timers.has(previous), false);
        assert.ok(result.timers.has(displayText.random[0].clockTimeout));
    }
    const last = displayText.random[0].clockTimeout;
    result.events.blankTheScreen();
    assert.equal(result.timers.has(last), false);
    assert.equal(displayText.random[0].clockTimeout, undefined);
});

test('rendering overlay containers commits their HTML only once', async () => {
    const displayText = {positionList: ['left', 'right', 'random'], left: [{type: 'none'}],
        right: [{type: 'none'}], random: []};
    const result = renderer('dissolve', 'left', false, {displayText});
    await flush();
    result.events.screenNumber(0);
    assert.equal(result.control.htmlWrites.filter(write => write.selector === '#textDisplayArea').length, 1);
});

for (const easierTransitions of [undefined, false]) {
    test('dip to black always switches playback at midpoint: ' + easierTransitions, async () => {
        const result = renderer('dipToBlack', 'left', easierTransitions);
        await flush();
        await result.tick(2000);
        result.events.newVideo();
        await flush();
        await result.tick(2999);
        assert.equal(result.players[1].paused, false);
        assert.equal(result.players[0].paused, true);
        await result.tick(3000);
        assert.equal(result.players[1].paused, true);
        assert.equal(result.players[0].paused, false);
        await result.tick(4000);
        assert.equal(result.players[1].style.visibility, 'hidden');
    });
}

for (const easierTransitions of [true, false]) {
    test('none cuts immediately without animations: ' + easierTransitions, async () => {
        const result = renderer('none', 'left', easierTransitions);
        for (const player of result.players) {
            player.animate = () => { throw new Error('Unexpected animation'); };
            const play = player.play;
            player.play = () => {
                assert.ok(result.players.every(other => other === player || other.paused));
                return play.call(player);
            };
        }
        await flush();
        assert.equal(result.players[1].paused, false);
        result.events.newVideo();
        await flush();
        assert.equal(result.players[1].paused, true);
        assert.equal(result.players[1].style.visibility, 'hidden');
        assert.equal(result.players[0].paused, false);
        assert.equal(result.players[0].style.opacity, '1');
        assert.equal(result.frames.size, 0);
        assert.ok([...result.timers.values()].some(timer => timer.delay === 59500));
    });
}
