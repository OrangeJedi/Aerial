const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function renderer(type = 'dissolve', direction = 'left', easierTransitions) {
    const players = [0, 1].map(() => ({
        style: {}, paused: true, currentTime: 0, duration: 60, playbackRate: 1,
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
    const chain = {css() { return chain; }, text() { return chain; }, html() { return chain; }};
    const settings = {easierTransitions, videoTransitionLength: 2000, playbackSpeed: 1, transitionType: type,
        transitionDirection: direction, displayText: {positionList: [], random: []}};
    const context = vm.createContext({
        console, performance: {now: () => now}, innerWidth: 1920, innerHeight: 1080,
        setTimeout(callback, delay) { const id = ++sequence; timers.set(id, {callback, delay}); return id; },
        clearTimeout(id) { timers.delete(id); },
        setInterval(callback) { intervals.push(callback); },
        requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
        cancelAnimationFrame(id) { frames.delete(id); },
        document: {getElementById: id => id === 'video' ? players[0] : id === 'video2' ? players[1] : {style: {}}, addEventListener() {}},
        $: () => chain,
        electron: {videos: [{id: 'sample'}], store: {get: key => settings[key]},
            ipcRenderer: {invoke: async () => 'sample', send() {}, on: (name, callback) => { events[name] = callback; }}},
        videoPlayback: {cancel() {}, async load(player, video, status, options) {
            loads.push(options);
            player.playbackSource = options.skipSources.length ? 'fallback' : 'primary';
            player.src = player.playbackSource;
        }}
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/screensaver.js'), 'utf8'), context);
    return {players, loads, events, intervals, timers, frames, context,
        async tick(time) {
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


for (const type of ['dissolve', 'dipToBlack', 'fade', 'wipe', 'circle', 'fadeCircle']) {
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
