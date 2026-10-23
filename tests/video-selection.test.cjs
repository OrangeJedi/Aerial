const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function selector(settings = {}, state = {}) {
    const script = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    const start = script.indexOf("ipcMain.handle('newVideoId'");
    const end = script.indexOf("ipcMain.on('newGlobalShortcut'", start);
    let select;
    const context = vm.createContext({
        store: {get store() { state.snapshotReads = (state.snapshotReads || 0) + 1; return {allowedVideos: ['a', 'b'], ...settings}; }},
        videos: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => ({id})),
        currentlyPlaying: state.currentlyPlaying || '',
        previouslyPlayed: state.previouslyPlayed || [],
        getVideoSources: video => (state.unplayable || []).includes(video.id) ? [] : ['source'],
        tod: {day: state.day || []}, getTimeOfDay: () => { state.timeReads = (state.timeReads || 0) + 1; return 'day'; },
        randomInt: () => 0, onFirstVideoPlayed() {},
        ipcMain: {handle: (channel, callback) => { select = callback; }}
    });
    vm.runInContext('const videosById = new Map(videos.map(video => [video.id, video]));\n' + script.slice(start, end), context);
    return lastPlayed => select({}, lastPlayed);
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
