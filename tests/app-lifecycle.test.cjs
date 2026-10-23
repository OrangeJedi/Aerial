const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');

function section(start, end, globals) {
    const first = source.indexOf(start);
    assert.ok(first >= 0 && source.indexOf(end, first) > first);
    const context = vm.createContext(globals);
    vm.runInContext(source.slice(first, source.indexOf(end, first)), context);
    return context;
}

test('secondary process quits before loading application services', () => {
    let quit = 0;
    const first = source.indexOf('if (!app.requestSingleInstanceLock())');
    const end = source.indexOf("const {exec}", first);
    vm.runInNewContext(`(function () { ${source.slice(first, end)} })()`, {
        app: {requestSingleInstanceLock: () => false, quit: () => { quit++; },
            on: () => assert.fail('secondary process must exit before registering handlers')}
    });
    assert.equal(quit, 1);
});

test('repeat launch waits for startup before opening config', async () => {
    let handler;
    let ready;
    const calls = [];
    section("app.on('second-instance'", 'const {exec}', {
        app: {on: (name, callback) => { assert.equal(name, 'second-instance'); handler = callback; }},
        startupReady: new Promise(resolve => { ready = resolve; }),
        createConfigWindow: argv => calls.push(argv)
    });
    handler({}, ['/c']);
    assert.equal(calls.length, 0);
    ready();
    await Promise.resolve();
    assert.deepEqual(calls, [['/c']]);
});

test('existing minimized config is restored, shown and focused without another window', () => {
    const calls = [];
    const context = section('function createConfigWindow(', 'function createSSWindow(', {
        configWindow: {isDestroyed: () => false, isMinimized: () => true,
            restore: () => calls.push('restore'), show: () => calls.push('show'),
            focus: () => calls.push('focus')},
        BrowserWindow: function () { assert.fail('must reuse config'); }
    });
    context.createConfigWindow();
    assert.deepEqual(calls, ['restore', 'show', 'focus']);
});

for (const flag of ['/c', '/p', '/s', '/t', '/j', undefined]) {
    test(`startup routes ${flag || 'default'} after preparing settings and cache`, async () => {
        const calls = [];
        const data = {configured: true, version: 'test', useTray: false};
        const context = section('async function startUp()', '//loads the config file', {
            store: {get: key => data[key], set: (key, value) => { data[key] = value; }},
            app: {getVersion: () => 'test', isPackaged: true, quit: () => calls.push('quit')},
            process: {argv: flag ? [flag] : []}, screen: {getAllDisplays: () => [1, 2]},
            autoLauncher: {disable: () => calls.push('disable')},
            calculateAstronomy() {}, checkForUpdate() {}, setupGlobalShortcut() {},
            clearCacheTemp: async () => calls.push('clear'), pruneVideoCache: () => calls.push('prune'),
            createConfigWindow: () => calls.push('config'), createSSWindow: () => calls.push('screensaver'),
            createSSPWindow: () => calls.push('preview'), createJSONConfigWindow: () => calls.push('json'),
            setTimeout: (callback, delay) => { assert.equal(delay, 1500); calls.push('schedule'); }, downloadVideos() {}
        });
        await context.startUp();
        const route = {'/c': 'config', '/p': 'quit', '/s': 'screensaver', '/t': 'preview', '/j': 'json'}[flag] || 'config';
        assert.deepEqual(calls, ['disable', 'clear', 'prune', route, 'schedule']);
        assert.equal(data.numDisplays, 2);
    });
}

test('settings migration preserves explicit choices, fills defaults and upgrades legacy transitions', () => {
    const original = {startAfter: 0, useTray: false, allowedVideos: [], videoTransitionLength: 1000,
        prepareCompatibleVideos: false, wakeOnMouseClick: false, customVideos: [{id: '_local', path: 'local.mov'}]};
    let saved;
    const context = section('function setUpConfigFile()', '//setUpConfigFile();', {
        store: {get store() { return structuredClone(original); }, set: value => { saved = value; }},
        videos: [{id: 'a'}], astronomy: {}, cachePath: 'cache', app: {getVersion: () => 'new'}, updateVideoCache() {}
    });
    context.setUpConfigFile();
    assert.equal(saved.startAfter, 0);
    assert.equal(saved.useTray, false);
    assert.equal(saved.allowedVideos.length, 0);
    assert.equal(saved.customVideos[0].path, 'local.mov');
    assert.equal(saved.videoTransitionLength, 2000);
    assert.equal(saved.prepareCompatibleVideos, false);
    assert.equal(saved.wakeOnMouseClick, false);
    assert.equal(saved.wakeOnMouseMovement, true);
    assert.equal(saved.configured, true);
    assert.equal(saved.version, 'new');
    assert.equal(saved.displayText.positionList.length, 10);
    assert.equal(saved.displayText.topleft.length, 4);
});

for (const override of [{}, {screens: [{}]}, {suspend: true}, {isComputerSleeping: true},
    {isComputerSuspendedOrLocked: true}, {startAfter: 0}, {idle: 'active'}, {wake: false},
    {battery: true}, {battery: true, runOnBattery: true}]) {
    test(`idle launch respects system and battery gates ${JSON.stringify(override)}`, async () => {
        let launches = 0;
        const data = {startAfter: 10, runOnBattery: false, ...override};
        const context = section('let checkingDisplayPower = false;', 'setInterval(launchScreensaver', {
            screens: [], suspend: false, isComputerSleeping: false, isComputerSuspendedOrLocked: false, ...override,
            store: {get: key => data[key]}, isDisplayRequired: async () => override.wake === false,
            powerMonitor: {getSystemIdleState: seconds => { assert.equal(seconds, 600); return override.idle || 'idle'; },
                isOnBatteryPower: () => !!override.battery}, createSSWindow: () => { launches++; }
        });
        await context.launchScreensaver();
        assert.equal(launches, Object.keys(override).length === 0 || override.runOnBattery ? 1 : 0);
    });
}

test('idle launch serializes queries, rechecks activity and recovers after errors', async () => {
    let resolveQuery;
    let queries = 0;
    let launches = 0;
    let idle = true;
    let fail = false;
    const context = section('let checkingDisplayPower = false;', 'setInterval(launchScreensaver', {
        screens: [], suspend: false, isComputerSleeping: false, isComputerSuspendedOrLocked: false,
        store: {get: key => key === 'startAfter' ? 10 : false},
        console: {warn() {}},
        powerMonitor: {getSystemIdleState: () => idle ? 'idle' : 'active', isOnBatteryPower: () => false},
        isDisplayRequired: () => {
            queries++;
            return fail ? Promise.reject(new Error('query failed')) : new Promise(resolve => { resolveQuery = resolve; });
        },
        createSSWindow: () => { launches++; }
    });
    const pending = context.launchScreensaver();
    await context.launchScreensaver();
    assert.equal(queries, 1);
    idle = false;
    resolveQuery(false);
    await pending;
    assert.equal(launches, 0);
    idle = true;
    fail = true;
    await context.launchScreensaver();
    assert.equal(launches, 0);
    fail = false;
    const retry = context.launchScreensaver();
    resolveQuery(false);
    await retry;
    assert.equal(launches, 1);
});

for (const preview of [true, false]) {
    test(`sleep and lock protect preview mode: ${preview}`, () => {
        const commands = [];
        let closed = 0;
        const context = section('function sleepComputer()', '//idle startup timer', {
            preview, exec: command => commands.push(command), closeAllWindows: () => { closed++; }, isComputerSleeping: false
        });
        context.sleepComputer();
        context.lockComputer();
        assert.equal(commands.length, preview ? 0 : 2);
        assert.equal(closed, preview ? 0 : 1);
        assert.equal(context.isComputerSleeping, !preview);
    });
}

for (const [hour, minute, expected] of [[5, 29, 'night'], [5, 30, 'twilight'], [5, 59, 'twilight'],
    [6, 0, 'twilight'], [6, 30, 'twilight'], [6, 31, 'day'], [12, 0, 'day'],
    [17, 29, 'day'], [17, 30, 'twilight'], [18, 0, 'twilight'], [18, 30, 'twilight'], [18, 31, 'night']]) {
    test(`time of day classifies ${hour}:${minute} as ${expected}`, () => {
        const context = section('function getTimeOfDay(', '//astronomy code', {
            Date: class { getHours() { return hour; } getMinutes() { return minute; } },
            store: {get: key => key === 'sunrise' ? '06:00' : '18:00'}
        });
        assert.equal(context.getTimeOfDay(), expected);
    });
}

test('time-of-day lists include twilight and rebuild without accumulating duplicates', () => {
    const context = section('function setTimeOfDayList()', 'function getTimeOfDay(', {
        store: {get: () => true},
        allowedVideos: ['a', 'b', 'c', 'd'],
        videos: [{id: 'a', timeOfDay: 'day'}, {id: 'b', timeOfDay: 'night'},
            {id: 'c', timeOfDay: 'twilight'}, {id: 'd'}],
        tod: {}
    });
    for (let i = 0; i < 2; i++) {
        context.setTimeOfDayList();
        assert.deepEqual(Array.from(context.tod.day), ['a', 'd']);
        assert.deepEqual(Array.from(context.tod.night), ['b', 'd']);
        assert.deepEqual(Array.from(context.tod.twilight), ['c', 'd']);
    }
});

for (const [primaryOnly, noQuit, taskbarEdge] of [true, false].flatMap(primaryOnly =>
    [true, false].flatMap(noQuit => ['bottom', 'top', 'left', 'right'].map(edge => [primaryOnly, noQuit, edge])))) {
    test(`screensaver covers monitor bounds, primary only: ${primaryOnly}, no quit: ${noQuit}, taskbar: ${taskbarEdge}`, () => {
        const windows = [];
        const displays = [
            {id: 1, size: {width: 1920, height: 1080}, bounds: {x: 0, y: 0, width: 1920, height: 1080},
                workArea: {x: 0, y: 0, width: 1920, height: 1032}},
            {id: 2, size: {width: 1280, height: 720}, bounds: {x: -1280, y: -100, width: 1280, height: 720},
                workArea: {x: -1280, y: -100, width: 1280, height: 672}}
        ];
        for (const display of displays) {
            display.workArea = {...display.bounds};
            const vertical = taskbarEdge === 'top' || taskbarEdge === 'bottom';
            display.workArea[vertical ? 'height' : 'width'] -= 48;
            if (taskbarEdge === 'top' || taskbarEdge === 'left') {
                display.workArea[vertical ? 'y' : 'x'] += 48;
            }
        }
        class Window {
            constructor(options) {
                this.options = options;
                this.events = {};
                this.messages = [];
                this.calls = [];
                this.webContents = {send: (...args) => this.messages.push(args)};
                windows.push(this);
            }
            loadFile(file) { this.file = file; }
            on(name, callback) { this.events[name] = callback; }
            once(name, callback) { this.events[name] = callback; }
            setMenu(value) { assert.equal(value, null); }
            setAlwaysOnTop(value, level) {
                assert.equal(value, true);
                assert.equal(level, 'screen-saver');
                this.calls.push('topmost');
            }
            show() {
                this.shown = true;
                // Simulate Windows shifting the window upward and reserving taskbar space.
                this.bounds = {...displays[windows.indexOf(this)].workArea};
                this.bounds.y -= 8;
                this.calls.push('show');
            }
            setBounds(bounds) {
                assert.equal(this.shown, true);
                assert.deepEqual(bounds, displays[windows.indexOf(this)].bounds);
                this.bounds = {...bounds};
                this.calls.push('bounds');
            }
            focus() {
                assert.equal(this.shown, true, 'focus only after the window is visible');
                this.focused = true;
                this.calls.push('focus');
            }
            isDestroyed() { return false; }
        }
        const context = section('function createSSWindow(', 'function createSSPWindow(', {
            BrowserWindow: Window, path: require('node:path'), __dirname: require('node:path').resolve(__dirname, '..'),
            nq: noQuit, screens: [], screenIds: [], calculateAstronomy() {},
            store: {get: key => key === 'onlyShowVideoOnPrimaryMonitor' ? primaryOnly : ['a'], set() {}},
            screen: {getAllDisplays: () => displays, getPrimaryDisplay: () => displays[0],
                getCursorScreenPoint: () => ({x: -100, y: 200}), getDisplayNearestPoint: () => displays[1]}
        });
        context.createSSWindow();
        assert.equal(windows.length, 2);
        windows.forEach((win, i) => {
            assert.equal(win.options.width, displays[i].size.width);
            assert.equal(win.options.height, displays[i].size.height);
            assert.equal(win.options.x, displays[i].bounds.x);
            assert.equal(win.options.y, displays[i].bounds.y);
            assert.equal(win.options.webPreferences.contextIsolation, true);
            assert.equal(win.options.webPreferences.nodeIntegration, false);
            assert.equal(win.options.webPreferences.backgroundThrottling, false);
            assert.equal(win.options.fullscreen, false);
            assert.equal(win.options.thickFrame, noQuit);
            assert.equal(win.options.skipTaskbar, !noQuit);
            assert.equal(win.options.frame, noQuit);
            assert.equal(win.options.resizable, noQuit);
            assert.equal(win.shown, undefined);
            win.events['ready-to-show']();
            assert.deepEqual(win.messages, [['screenNumber', i]]);
            assert.equal(win.shown, true);
            if (!noQuit) {
                assert.deepEqual(win.bounds, displays[i].bounds,
                    'restore every monitor edge after native placement, including the taskbar area');
                assert.notDeepEqual(win.bounds, displays[i].workArea);
            }
            assert.deepEqual(win.calls, [
                ...(noQuit ? [] : ['topmost']), 'show',
                ...(noQuit ? [] : ['bounds', 'topmost']), ...(i === 1 ? ['focus'] : [])
            ]);
        });
        assert.equal(windows[0].file, 'web/screensaver.html');
        assert.equal(windows[1].file, primaryOnly ? 'web/black.html' : 'web/screensaver.html');
        assert.equal(windows[1].focused, true);
    });
}

test('suspend, lock, unlock and resume close windows and update launch gates', () => {
    const handlers = {};
    let closed = 0;
    const context = section("powerMonitor.on('resume'", '//let Aerial load', {
        isComputerSleeping: true, isComputerSuspendedOrLocked: false,
        powerMonitor: {on: (name, callback) => { handlers[name] = callback; }},
        closeAllWindows: () => { closed++; }
    });
    for (const event of ['suspend', 'unlock-screen', 'lock-screen', 'resume']) {
        handlers[event]();
        assert.equal(context.isComputerSuspendedOrLocked, event === 'suspend' || event === 'lock-screen');
    }
    assert.equal(context.isComputerSleeping, false);
    assert.equal(closed, 4);
});

test('skip key advances all displays while other keys dismiss the screensaver', () => {
    let quit = 0;
    const messages = [];
    let handle;
    const data = {skipKey: 'ArrowRight', skipVideosWithKey: true};
    section("ipcMain.on('keyPress'", "ipcMain.on('updateCache'", {
        ipcMain: {on: (name, callback) => { handle = callback; }},
        store: {get: key => data[key]}, quitApp: () => { quit++; },
        screens: [0, 1].map(id => ({webContents: {send: message => messages.push([id, message])}}))
    });
    handle({}, 'ArrowRight');
    assert.deepEqual(messages, [[0, 'newVideo'], [1, 'newVideo']]);
    handle({}, 'Escape');
    data.skipVideosWithKey = false;
    handle({}, 'ArrowRight');
    assert.equal(quit, 2);
});
