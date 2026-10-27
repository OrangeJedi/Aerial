const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');

for (const outcome of ['load failure', 'renderer crash', 'timeout', 'ready', 'closed']) {
    test(`preview startup handles ${outcome}`, async () => {
        const {EventEmitter} = require('node:events');
        const config = {};
        const errors = [];
        let window;
        let timeout;
        let cleared = 0;
        class PreviewWindow extends EventEmitter {
            constructor() {
                super();
                window = this;
                this.webContents = new EventEmitter();
                this.webContents.send = () => {};
            }
            isDestroyed() {
                return !!this.destroyed;
            }
            destroy() {
                this.destroyed = true;
                this.emit('closed');
            }
            show() {
                this.shown = true;
            }
            loadFile() {
                return outcome === 'load failure' ? Promise.reject(new Error('Missing preview page')) : Promise.resolve();
            }
        }
        const context = section('function createSSPWindow(', 'function createEditWindow(', {
            BrowserWindow: PreviewWindow, screen: {getAllDisplays: () => []},
            store: {get: () => []}, path: require('node:path'), __dirname: 'test',
            screens: [config], nq: false, preview: false,
            setTimeout: callback => { timeout = callback; return 1; },
            clearTimeout: () => { cleared++; },
            console: {error() {}}, dialog: {showErrorBox: (title, message) => errors.push(message)}
        });
        context.createSSPWindow();
        if (outcome === 'renderer crash') {
            window.webContents.emit('render-process-gone', {}, {reason: 'crashed'});
        } else if (outcome === 'timeout') {
            timeout();
        } else if (outcome === 'ready') {
            window.emit('ready-to-show');
            timeout();
        } else if (outcome === 'closed') {
            window.destroy();
            timeout();
        }
        await Promise.resolve();
        const failed = ['load failure', 'renderer crash', 'timeout'].includes(outcome);
        assert.equal(errors.length, failed ? 1 : 0);
        assert.ok(cleared > 0);
        assert.equal(!!window.shown, outcome === 'ready');
        assert.equal(context.preview, outcome === 'ready');
        assert.equal(context.screens[0], config);
        assert.equal(context.screens.length, outcome === 'ready' ? 2 : 1);
    });
}

function section(start, end, globals) {
    const first = source.indexOf(start);
    assert.ok(first >= 0 && source.indexOf(end, first) > first);
    const context = vm.createContext({monitorPlayback: new Map(), ...globals});
    vm.runInContext(source.slice(first, source.indexOf(end, first)), context);
    return context;
}

for (const hours of [1, 3]) {
    test(`tray suspension lasts ${hours} hours and restores the menu`, () => {
        let callback;
        let delay;
        let menu;
        const cleared = [];
        const context = section('    function newMenu(isSuspendChecked)', '    trayWin.tray = new Tray', {
            Menu: {buildFromTemplate: items => items},
            trayWin: {tray: {setContextMenu: items => { menu = items; }}},
            suspend: false,
            suspendCountdown: 42,
            clearTimeout: timer => cleared.push(timer),
            setTimeout: (fn, milliseconds) => {
                callback = fn;
                delay = milliseconds;
                return 43;
            }
        });
        const items = context.newMenu(false);
        items.find(item => item.label === `Suspend for ${hours} ${hours === 1 ? 'hour' : 'hours'}`).click();
        assert.equal(delay, hours * 60 * 60 * 1000);
        assert.deepEqual(cleared, [42]);
        assert.equal(context.suspend, true);
        assert.equal(menu.find(item => item.label === 'Suspend Aerial').checked, true);
        callback();
        assert.equal(context.suspend, false);
        assert.equal(menu.find(item => item.label === 'Suspend Aerial').checked, false);
    });
}

for (const channel of ['selectCustomLocation', 'selectCacheLocation', 'selectFile']) {
    for (const failure of ['cancel', 'dialog', 'filesystem', 'closed renderer']) {
        test(`${channel} handles ${failure}`, async () => {
            let handler;
            let errors = 0;
            let writes = 0;
            let reads = 0;
            const nextChannel = {selectCustomLocation: 'selectCacheLocation', selectCacheLocation: 'refreshCache', selectFile: 'openPreview'}[channel];
            const context = section(`ipcMain.on('${channel}'`, `ipcMain.on('${nextChannel}'`, {
                ipcMain: {on: (name, callback) => { handler = callback; }},
                screens: [], cachePath: 'original', path: require('node:path'),
                console: {error: () => { errors++; }},
                dialog: {showOpenDialog: async () => {
                    if (failure === 'dialog') {
                        throw new Error('dialog failed');
                    }
                    return {canceled: failure === 'cancel', filePaths: failure === 'cancel' ? [] : ['selected']};
                }},
                fs: {promises: {
                    readdir: async () => {
                        reads++;
                        if (failure === 'filesystem') {
                            throw new Error('access denied');
                        }
                        return ['video.mp4'];
                    },
                    mkdir: async () => {
                        if (failure === 'filesystem') {
                            throw new Error('access denied');
                        }
                    }
                }},
                store: {get: () => [[{}]], set: () => { writes++; }},
                updateVideoCache: async callback => callback()
            });
            await handler({reply: () => {
                if (failure === 'closed renderer') {
                    throw new Error('renderer destroyed');
                }
            }}, ['image', 0, 0]);
            if (failure === 'cancel' || failure === 'dialog') {
                assert.equal(writes, 0);
                assert.equal(reads, 0);
            }
            if (channel === 'selectCacheLocation' && failure === 'filesystem') {
                assert.equal(context.cachePath, 'original');
                assert.equal(writes, 0);
            }
            assert.equal(errors, failure === 'cancel' || (channel === 'selectFile' && failure === 'filesystem') ? 0 : 1);
        });
    }
}

test('tray exit closes the hidden window without requiring a sender on the close event', () => {
    let window;
    let menu;
    let quits = 0;
    class Window {
        constructor() {
            this.events = {};
            window = this;
        }
        on(name, callback) {
            this.events[name] = callback;
        }
        close() {
            const event = {preventDefault: () => assert.fail('exit must allow the window to close')};
            this.events.close?.(event);
            this.closed = true;
        }
    }
    class Tray {
        setContextMenu(value) {
            menu = value;
        }
        setToolTip() {}
    }
    const context = section('function createTrayWindow()', 'function createJSONConfigWindow()', {
        BrowserWindow: Window, Tray, Menu: {buildFromTemplate: template => template},
        path: require('node:path'), __dirname,
        app: {quit: () => { quits++; window.close(); }}
    });
    context.createTrayWindow();
    menu.find(item => item.label === 'Exit Aerial').click();
    assert.equal(quits, 1);
    assert.equal(window.closed, true);
});

test('arrow keys cycle screens while other keys retain skip and quit behavior', () => {
    let handler;
    let quits = 0;
    const sent = [[], []];
    section("ipcMain.on('keyPress'", "ipcMain.on('updateCache'", {
        ipcMain: {on: (name, callback) => { handler = callback; }},
        store: {get: key => ({skipKey: 'Space', skipVideosWithKey: true})[key]},
        screens: sent.map(messages => ({webContents: {send: channel => messages.push(channel)}})),
        quitApp: () => { quits++; }
    });
    for (const key of ['ArrowRight', 'ArrowLeft', 'Space', 'Escape']) {
        handler({}, key);
    }
    for (const messages of sent) {
        assert.deepEqual(messages, ['newVideo', 'previousVideo', 'newVideo']);
    }
    assert.equal(quits, 1);
});

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

test('all new web contents mute audio output without touching player controls', () => {
    let handler;
    section("app.on('web-contents-created'", "app.on('second-instance'", {
        app: {on: (name, callback) => {
            assert.equal(name, 'web-contents-created');
            handler = callback;
        }}
    });
    const calls = [];
    for (let index = 0; index < 3; index++) {
        handler({}, {setAudioMuted: muted => calls.push([index, muted])});
    }
    assert.deepEqual(calls, [[0, true], [1, true], [2, true]]);
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

test('closing config before the welcome timer fires does not access a destroyed window', () => {
    const systemPreferences = new (require('node:events').EventEmitter)();
    let welcome;
    let closed;
    class Window {
        constructor() {
            this.webContents = {
                send: () => assert.fail('closed config must not receive welcome'),
                setWindowOpenHandler() {}
            };
        }
        loadFile() {}
        on(name, callback) {
            if (name === 'closed') {
                closed = callback;
            }
        }
    }
    const context = section('function createConfigWindow(', 'function createSSWindow(', {
        systemPreferences,
        configWindow: null, BrowserWindow: Window, screens: [],
        path: require('node:path'), __dirname,
        setTimeout: callback => { welcome = callback; }
    });
    context.createConfigWindow(['/w']);
    assert.equal(systemPreferences.listenerCount('accent-color-changed'), 1);
    closed();
    assert.equal(systemPreferences.listenerCount('accent-color-changed'), 0);
    assert.doesNotThrow(() => welcome());
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
    assert.equal(saved.preventActivationDuringFullscreen, true);
    assert.equal(saved.sleepAfterBlankDelay, 0);
    assert.equal(saved.configured, true);
    assert.equal(saved.preventSameVideoOnScreens, true);
    assert.equal(saved.version, 'new');
    assert.equal(saved.displayText.positionList.length, 10);
    assert.equal(saved.displayText.topleft.length, 4);
});

for (const initial of [{}, {preventSameVideoOnScreens: false}, {sameVideoOnScreens: true}, {sameVideoOnScreens: true, preventSameVideoOnScreens: true}]) {
    test(`multiscreen settings default and migrate without contradictory options: ${JSON.stringify(initial)}`, () => {
        let saved;
        const context = section('function setUpConfigFile()', '//setUpConfigFile();', {
            store: {get store() { return {...initial}; }, set: value => { saved = value; }},
            videos: [], astronomy: {}, cachePath: 'cache', app: {getVersion: () => 'test'}, updateVideoCache() {}
        });
        context.setUpConfigFile();
        assert.equal(saved.preventSameVideoOnScreens, initial.sameVideoOnScreens ? false : (initial.preventSameVideoOnScreens ?? true));
        assert.equal(saved.sameVideoOnScreens, initial.sameVideoOnScreens ?? false);
    });
}

test('default text positions and their lines can be edited independently', () => {
    let saved;
    const context = section('function setUpConfigFile()', '//setUpConfigFile();', {
        store: {get store() { return {}; }, set: value => { saved = value; }},
        videos: [], astronomy: {}, cachePath: 'cache', app: {getVersion: () => 'test'}, updateVideoCache() {}
    });
    context.setUpConfigFile();
    const text = saved.displayText;
    text.topleft[0].type = 'custom';
    text.topleft[0].text = 'Top left only';
    for (const position of text.positionList.filter(position => position !== 'topleft')) {
        assert.equal(text[position][0].type, 'none', `${position} must remain independent`);
        assert.equal(text[position][0].text, undefined);
        text[position][0].type = 'none';
        assert.equal(text.topleft[0].type, 'custom');
    }
    text.topleft[1].defaultFont = false;
    assert.equal(text.topleft[0].defaultFont, true);
    assert.equal(text.topleft[2].defaultFont, true);
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

for (const enabled of [true, false]) {
    for (const result of ['fullscreen', 'desktop', 'error']) {
        test(`fullscreen guard enabled ${enabled} with ${result}`, async () => {
            let launches = 0;
            let queries = 0;
            const context = section('let checkingDisplayPower = false;', 'setInterval(launchScreensaver', {
                screens: [], suspend: false, isComputerSleeping: false, isComputerSuspendedOrLocked: false,
                store: {get: key => ({startAfter: 10, preventActivationDuringFullscreen: enabled})[key]},
                console: {warn() {}},
                powerMonitor: {getSystemIdleState: () => 'idle', isOnBatteryPower: () => false},
                isDisplayRequired: async () => false,
                isFullscreenAppActive: async () => {
                    queries++;
                    if (result === 'error') {
                        throw new Error('query failed');
                    }
                    return result === 'fullscreen';
                },
                createSSWindow: () => { launches++; }
            });
            await context.launchScreensaver();
            assert.equal(queries, enabled ? 1 : 0);
            assert.equal(launches, !enabled || result === 'desktop' ? 1 : 0);
        });
    }
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
            preview, lockRequested: false, exec: command => commands.push(command), closeAllWindows: () => { closed++; }, isComputerSleeping: false
        });
        context.sleepComputer();
        context.lockComputer();
        assert.equal(commands.length, preview ? 0 : 2);
        assert.equal(closed, preview ? 0 : 1);
        assert.equal(context.isComputerSleeping, !preview);
    });
}

function dismissalContext(overrides = {}) {
    const closed = [];
    const commands = [];
    const context = section('function quitApp()', '//idle startup timer', {
        nq: false, preview: false, lockRequested: false, clearScreensaverTimers() {},
        startTime: new Date(Date.now() - 60000), currentlyPlaying: 'video',
        store: {get: key => ({lockAfterRun: true, lockAfterRunAfter: 5})[key]},
        screens: [0, 1].map(id => ({isDestroyed: () => false, close: () => closed.push(id)})),
        exec: (command, callback) => commands.push({command, callback}),
        console: {error() {}}, ...overrides
    });
    return {context, closed, commands};
}

test('dismissal keeps all displays covered until Windows confirms the lock', () => {
    const {context, closed, commands} = dismissalContext();
    context.quitApp();
    context.quitApp();
    assert.equal(commands.length, 1);
    assert.match(commands[0].command, /LockWorkStation/);
    commands[0].callback(null);
    assert.deepEqual(closed, []);
    assert.equal(context.currentlyPlaying, 'video');
    const handlers = {};
    section("powerMonitor.on('resume'", '//let Aerial load', {
        powerMonitor: {on: (name, callback) => { handlers[name] = callback; }},
        closeAllWindows: context.closeAllWindows
    });
    handlers['lock-screen']();
    assert.deepEqual(closed, [0, 1]);
    assert.equal(context.screens.length, 0);
    assert.equal(context.lockRequested, false);
    assert.equal(context.currentlyPlaying, '');
});

for (const synchronous of [false, true]) {
    test(`failed lock keeps windows covered and allows retry, synchronous: ${synchronous}`, () => {
        const {context, closed, commands} = dismissalContext();
        if (synchronous) {
            context.exec = () => { throw new Error('launch failed'); };
        }
        context.quitApp();
        if (!synchronous) {
            commands[0].callback(new Error('launch failed'));
        }
        assert.deepEqual(closed, []);
        assert.equal(context.lockRequested, false);
        context.exec = (command, callback) => commands.push({command, callback});
        context.quitApp();
        assert.equal(context.lockRequested, true);
        assert.deepEqual(closed, []);
    });
}

for (const overrides of [
    {preview: true},
    {store: {get: () => false}},
    {startTime: new Date(Date.now() + 60000)}
]) {
    test(`dismissal closes immediately when locking is not required: ${Object.keys(overrides)[0]}`, () => {
        const {context, closed, commands} = dismissalContext(overrides);
        context.quitApp();
        assert.deepEqual(closed, [0, 1]);
        assert.equal(commands.length, 0);
    });
}

test('no-quit mode ignores dismissal', () => {
    const {context, closed, commands} = dismissalContext({nq: true});
    context.quitApp();
    assert.deepEqual(closed, []);
    assert.equal(commands.length, 0);
});

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
    test(`screensaver covers monitor bounds, primary only: ${primaryOnly}, no quit: ${noQuit}, taskbar: ${taskbarEdge}`, async () => {
        const windows = [];
        let finishDismissal;
        let dismissals = 0;
        const dismissal = new Promise(resolve => { finishDismissal = resolve; });
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
            dismissStartMenu: () => { dismissals++; return dismissal; },
            store: {get: key => key === 'onlyShowVideoOnPrimaryMonitor' ? primaryOnly : ['a'], set() {}},
            screen: {getAllDisplays: () => displays, getPrimaryDisplay: () => displays[0],
                getCursorScreenPoint: () => ({x: -100, y: 200}), getDisplayNearestPoint: () => displays[1]}
        });
        context.createSSWindow();
        assert.equal(dismissals, noQuit ? 0 : 1);
        assert.equal(windows.length, 2);
        for (const [i, win] of windows.entries()) {
            assert.equal(win.options.width, displays[i].size.width);
            assert.equal(win.options.height, displays[i].size.height);
            assert.equal(win.options.x, displays[i].bounds.x);
            assert.equal(win.options.y, displays[i].bounds.y);
            assert.equal(win.options.webPreferences.contextIsolation, true);
            assert.equal(win.options.webPreferences.nodeIntegration, false);
            assert.equal(win.options.webPreferences.backgroundThrottling, false);
            assert.equal(win.options.fullscreen, false);
            const showVideo = !primaryOnly || i === 0;
            assert.equal(win.options.transparent, showVideo);
            assert.equal(win.options.backgroundColor, showVideo ? '#00000000' : '#000000');
            assert.equal(win.options.thickFrame, noQuit);
            assert.equal(win.options.skipTaskbar, !noQuit);
            assert.equal(win.options.frame, noQuit);
            assert.equal(win.options.resizable, noQuit);
            assert.equal(win.shown, undefined);
            const ready = win.events['ready-to-show']();
            assert.equal(win.shown, undefined, 'wait for Start menu dismissal before showing');
            finishDismissal();
            await ready;
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
        }
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
    const data = {skipKey: 'Space', skipVideosWithKey: true};
    section("ipcMain.on('keyPress'", "ipcMain.on('updateCache'", {
        ipcMain: {on: (name, callback) => { handle = callback; }},
        store: {get: key => data[key]}, quitApp: () => { quit++; },
        screens: [0, 1].map(id => ({webContents: {send: message => messages.push([id, message])}}))
    });
    handle({}, 'Space');
    assert.deepEqual(messages, [[0, 'newVideo'], [1, 'newVideo']]);
    handle({}, 'Escape');
    data.skipVideosWithKey = false;
    handle({}, 'Space');
    assert.equal(quit, 2);
});
