const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function selector(settings = {}, state = {}) {
    const script = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
    const start = script.indexOf("ipcMain.handle('newVideoId'");
    const end = script.indexOf("ipcMain.on('newGlobalShortcut'", start);
    let select;
    let report;
    const senders = new Map();
    const context = vm.createContext({
        monitorPlayback: new Map(),
        screen: {getAllDisplays: () => Array.from({length: state.monitors || 1})},
        store: {get store() { state.snapshotReads = (state.snapshotReads || 0) + 1; return {allowedVideos: ['a', 'b'], preventSameVideoOnScreens: true, ...settings}; }},
        videos: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => ({id})),
        currentlyPlaying: state.currentlyPlaying || '',
        previouslyPlayed: state.previouslyPlayed || [],
        getVideoSources: video => (state.unplayable || []).includes(video.id) ? [] : ['source'],
        tod: {day: state.day || []}, getTimeOfDay: () => { state.timeReads = (state.timeReads || 0) + 1; return 'day'; },
        randomInt: () => 0, onFirstVideoPlayed() {},
        ipcMain: {handle: (channel, callback) => { select = callback; }, on: (channel, callback) => { report = callback; }}
    });
    vm.runInContext('const videosById = new Map(videos.map(video => [video.id, video]));\n' + script.slice(start, end), context);
    function sender(id) {
        if (!senders.has(id)) {
            senders.set(id, new (require('node:events').EventEmitter)());
            senders.get(id).id = id;
        }
        return senders.get(id);
    }
    const choose = (lastPlayed, monitorId = 1) => select({sender: sender(monitorId)}, lastPlayed);
    choose.report = (monitorId, playing, pending = null) => report({sender: sender(monitorId)}, {playing, pending});
    choose.close = monitorId => sender(monitorId).emit('destroyed');
    return choose;
}

test('two-video playlists alternate even with duplicate avoidance disabled', () => {
    const select = selector({avoidDuplicateVideos: false});
    let last = 'a';
    for (let i = 0; i < 10; i++) {
        const next = select(last);
        assert.notEqual(next, last);
        last = next;
    }
});

test('single playable video can repeat', () => {
    assert.equal(selector({allowedVideos: ['a']})('a'), 'a');
    assert.equal(selector({}, {unplayable: ['b']})('a'), 'a');
});

test('custom videos also avoid immediate repeats', () => {
    const select = selector({allowedVideos: ['_one', '_two'], customVideos: [{id: '_one'}, {id: '_two'}]});
    assert.equal(select('_one'), '_two');
});

test('time-of-day preference cannot force a repeat when another video is playable', () => {
    assert.equal(selector({timeOfDay: true}, {day: ['a']})('a'), 'b');
});

test('time-of-day preference still chooses matching alternatives', () => {
    assert.equal(selector({allowedVideos: ['a', 'b', 'c'], timeOfDay: true}, {day: ['a', 'c']})('a'), 'c');
});

test('history exhaustion does not reintroduce the current video', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    assert.equal(selector({allowedVideos: ids, avoidDuplicateVideos: true}, {previouslyPlayed: ids})('a'), 'b');
});

test('synchronized screens reuse the shared next video without repeating their own last video', () => {
    const select = selector({sameVideoOnScreens: true}, {currentlyPlaying: 'b'});
    assert.equal(select('a'), 'b');
    assert.equal(select('b'), 'a');
});

test('empty eligible playlists still report an error', () => {
    assert.throws(() => selector({allowedVideos: []})('a'), /No selected videos/);
});


test('selection reads settings once and calculates time of day once for the whole playlist', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const state = {day: ids};
    const select = selector({allowedVideos: ids, timeOfDay: true}, state);
    assert.equal(select('a'), 'b');
    assert.equal(state.snapshotReads, 1);
    assert.equal(state.timeReads, 1);
});

test('duplicate avoidance excludes recent history when at least seven candidates remain', () => {
    const allowedVideos = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const state = {previouslyPlayed: ['a', 'b']};
    assert.equal(selector({allowedVideos, avoidDuplicateVideos: true}, state)('h'), 'c');
    assert.equal(selector({allowedVideos, avoidDuplicateVideos: false}, state)('h'), 'a');
});

test('seven selected videos avoid recent history after excluding the last video', () => {
    const allowedVideos = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    assert.equal(selector({allowedVideos, avoidDuplicateVideos: true}, {
        previouslyPlayed: ['a', 'b']
    })('g'), 'c');
});

test('independent monitors share recent selection history for large playlists', () => {
    const select = selector({
        allowedVideos: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        avoidDuplicateVideos: true,
        sameVideoOnScreens: false
    });
    assert.equal(select('', 1), 'a');
    assert.equal(select('', 2), 'b');
    assert.equal(select('', 3), 'c');
});

test('independent monitors reserve different startup videos in small playlists', () => {
    const select = selector({avoidDuplicateVideos: true, sameVideoOnScreens: false});
    assert.equal(select('', 1), 'a');
    assert.equal(select('', 2), 'b');
});

test('a busy monitor cannot reuse a video still playing on another monitor', () => {
    const select = selector({
        allowedVideos: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        avoidDuplicateVideos: true,
        sameVideoOnScreens: false
    });
    const firstMonitor = select('', 1);
    select.report(1, [firstMonitor]);
    const secondMonitor = select('', 2);
    assert.equal(select('', 3), 'c');
    // Monitor 1 is still playing its first video when monitor 2 advances.
    assert.notEqual(select(secondMonitor, 2), firstMonitor);
});

test('synchronized monitors intentionally share a video with duplicate avoidance enabled', () => {
    const select = selector({
        allowedVideos: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        avoidDuplicateVideos: true,
        sameVideoOnScreens: true
    });
    const firstMonitor = select('', 1);
    assert.equal(select('', 2), firstMonitor);
    const next = select(firstMonitor, 1);
    assert.notEqual(next, firstMonitor);
    assert.equal(select(firstMonitor, 2), next);
});

for (const monitors of [1, 2, 3]) {
    test(`recent history holds exactly twice the monitor count: ${monitors}`, () => {
        const select = selector({
            allowedVideos: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], avoidDuplicateVideos: true
        }, {monitors});
        let last = '';
        const seen = [];
        for (let i = 0; i <= monitors * 2; i++) {
            last = select(last);
            assert.ok(!seen.includes(last));
            seen.push(last);
        }
        assert.equal(select(last), 'a');
    });
}

test('a long-running video stays excluded after falling out of recent history', () => {
    const select = selector({
        allowedVideos: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], avoidDuplicateVideos: true
    }, {monitors: 2});
    const held = select('', 1);
    select.report(1, [held]);
    let last = '';
    for (let i = 0; i < 25; i++) {
        const next = select(last, 2);
        assert.notEqual(next, held);
        assert.notEqual(next, last);
        select.report(2, [next]);
        last = next;
    }
});

test('transition videos and pending preloads remain occupied until released', () => {
    const select = selector({allowedVideos: ['a', 'b', 'c', 'd'], avoidDuplicateVideos: true});
    select('', 1);
    select.report(1, ['a', 'b'], 'c');
    assert.equal(select('', 2), 'd');
    select.report(1, ['b']);
    assert.equal(select('d', 2), 'c');
});

test('destroying or blanking a monitor releases its occupied videos', () => {
    for (const close of [true, false]) {
        const select = selector({allowedVideos: ['a', 'b', 'c'], avoidDuplicateVideos: true});
        select('', 1);
        select.report(1, ['a', 'b']);
        assert.equal(select('', 2), 'c');
        if (close) {
            select.close(1);
        } else {
            select.report(1, []);
        }
        assert.equal(select('c', 2), 'b');
    }
});

test('time-of-day preference does not reintroduce another monitor\'s occupied video', () => {
    const select = selector({
        allowedVideos: ['a', 'b', 'c'], avoidDuplicateVideos: true, timeOfDay: true
    }, {day: ['a']});
    assert.equal(select('', 1), 'a');
    assert.equal(select('', 2), 'b');
});

test('insufficient playlists relax recent history without repeating the same monitor', () => {
    const select = selector({avoidDuplicateVideos: true}, {monitors: 3});
    let last = '';
    for (let i = 0; i < 20; i++) {
        const next = select(last);
        assert.notEqual(next, last);
        last = next;
    }
});

test('strict multiscreen protection works independently of recent-video avoidance', () => {
    const select = selector({avoidDuplicateVideos: false}, {monitors: 2});
    assert.equal(select('', 1), 'a');
    assert.equal(select('', 2), 'b');
    // With exactly one video per screen, retaining this screen's video is necessary.
    assert.equal(select('a', 1), 'a');
    assert.equal(select('b', 2), 'b');
});

test('strict protection permits duplicates only when fewer playable videos than monitors exist', () => {
    const select = selector({allowedVideos: ['a']}, {monitors: 2});
    assert.equal(select('', 1), 'a');
    assert.equal(select('', 2), 'a');
    const filtered = selector({}, {monitors: 2, unplayable: ['b']});
    assert.equal(filtered('', 1), 'a');
    assert.equal(filtered('', 2), 'a');
});

test('strict protection waits when every video is occupied by another screen transition', () => {
    const select = selector({}, {monitors: 2});
    select('', 1);
    select.report(1, ['a', 'b']);
    assert.throws(() => select('', 2), /currently available/);
    select.report(1, ['b']);
    assert.equal(select('', 2), 'a');
});

test('history navigation and recovery cannot force another monitor\'s reserved video', () => {
    const select = selector({allowedVideos: ['a', 'b', 'c'], avoidDuplicateVideos: false}, {monitors: 2});
    assert.equal(select('', 1), 'a');
    assert.equal(select({lastPlayed: 'c', requestedId: 'a'}, 2), 'b');
    assert.equal(select({lastPlayed: 'b', requestedId: 'b'}, 2), 'b');
});

test('disabling both avoidance settings allows duplicate startup videos', () => {
    const select = selector({preventSameVideoOnScreens: false, avoidDuplicateVideos: false}, {monitors: 2});
    assert.equal(select('', 1), 'a');
    assert.equal(select('', 2), 'a');
});
