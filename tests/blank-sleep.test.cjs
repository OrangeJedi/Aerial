const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');

function fixture(settings = {}, preview = false) {
    const data = {blankScreen: true, blankAfter: 10, sleepAfterBlank: true,
        sleepAfterBlankDelay: 15, videoTransitionLength: 2000, ...settings};
    const intervals = new Map();
    const timeouts = new Map();
    const messages = [[], []];
    let id = 0;
    let now = 0;
    let slept = 0;
    const context = vm.createContext({
        monitorPlayback: new Map(),
        preview, store: {get: key => data[key]}, Date: {now: () => now}, setTimeOfDayList() {},
        screens: messages.map(sent => ({isDestroyed: () => false, close() {},
            webContents: {send: message => sent.push(message)}})),
        setInterval: (callback, delay) => { intervals.set(++id, {callback, delay}); return id; },
        clearInterval: timer => intervals.delete(timer),
        setTimeout: (callback, delay) => { timeouts.set(++id, {callback, delay}); return id; },
        clearTimeout: timer => timeouts.delete(timer), sleepComputer: () => { slept++; }
    });
    vm.runInContext(source.slice(source.indexOf('let blankInterval;'), source.indexOf('//Time of day code')), context);
    vm.runInContext(source.slice(source.indexOf('function closeAllWindows('),
        source.indexOf('function sleepComputer()')), context);
    return {context, data, intervals, timeouts, messages, slept: () => slept,
        advance: milliseconds => { now += milliseconds; for (const timer of [...intervals.values()]) timer.callback(); }};
}

test('multiple monitors blank once and share one sleep delay after the blank transition', () => {
    const f = fixture({sleepAfterBlankDelay: 15});
    f.context.onFirstVideoPlayed();
    f.context.onFirstVideoPlayed();
    assert.equal(f.intervals.size, 1);
    f.advance(9 * 60000);
    assert.equal(f.timeouts.size, 0);
    f.advance(60000);
    assert.equal(f.intervals.size, 0);
    assert.deepEqual(f.messages, [['blankTheScreen'], ['blankTheScreen']]);
    assert.equal(f.timeouts.size, 1);
    const timer = [...f.timeouts.values()][0];
    assert.equal(timer.delay, 15 * 60000 + 6000);
    f.context.blankScreensaver();
    f.context.onFirstVideoPlayed();
    assert.equal(f.timeouts.size, 1);
    assert.equal(f.intervals.size, 0);
    timer.callback();
    assert.equal(f.slept(), 1);
});

for (const delay of [undefined, 0, '0']) {
    test(`zero or default delay sleeps immediately after the blank transition: ${delay}`, () => {
        const f = fixture({sleepAfterBlankDelay: delay});
        f.context.blankScreensaver();
        assert.equal(f.timeouts.size, 1);
        const timer = [...f.timeouts.values()][0];
        assert.equal(timer.delay, 6000);
        assert.equal(f.slept(), 0);
        timer.callback();
        assert.equal(f.slept(), 1);
    });
}

for (const delay of [-2, 'invalid', Infinity]) {
    test(`invalid sleep delay disables sleep: ${delay}`, () => {
        const f = fixture({sleepAfterBlankDelay: delay});
        f.context.blankScreensaver();
        assert.equal(f.timeouts.size, 0);
    });
}

test('dismissal cancels old timers and the next screensaver gets a fresh delay', () => {
    const f = fixture({sleepAfterBlankDelay: 15});
    f.context.blankScreensaver();
    const stale = [...f.timeouts.values()][0];
    f.context.closeAllWindows();
    assert.equal(f.timeouts.size, 0);
    stale.callback();
    assert.equal(f.slept(), 0);
    f.context.screens = [{webContents: {send() {}}}];
    f.context.onFirstVideoPlayed();
    assert.equal(f.intervals.size, 1);
    f.advance(10 * 60000);
    assert.equal(f.timeouts.size, 1);
});

test('closing before blanking cancels the blank timer', () => {
    const f = fixture();
    f.context.onFirstVideoPlayed();
    f.context.closeAllWindows();
    assert.equal(f.intervals.size, 0);
    assert.equal(f.timeouts.size, 0);
});

test('preview never blanks or sleeps and disabling sleep cancels its effect', () => {
    const preview = fixture({}, true);
    preview.context.onFirstVideoPlayed();
    preview.context.blankScreensaver();
    assert.equal(preview.intervals.size, 0);
    assert.equal(preview.timeouts.size, 0);
    const disabled = fixture({sleepAfterBlank: false});
    disabled.context.blankScreensaver();
    assert.equal(disabled.timeouts.size, 0);
    const f = fixture();
    f.context.blankScreensaver();
    f.data.sleepAfterBlank = false;
    [...f.timeouts.values()][0].callback();
    assert.equal(f.slept(), 0);
});

test('zero blank delay keeps playing videos', () => {
    const f = fixture({blankAfter: 0});
    f.context.onFirstVideoPlayed();
    f.advance(60 * 60000);
    assert.equal(f.intervals.size, 0);
    assert.deepEqual(f.messages, [[], []]);
});
