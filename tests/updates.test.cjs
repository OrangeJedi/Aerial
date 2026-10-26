const assert = require('node:assert/strict');
const {test} = require('node:test');
const {EventEmitter} = require('node:events');
const {createAppUpdater} = require('../updates');

function fixture(options = {}) {
    const updater = new EventEmitter();
    const states = [];
    const notifications = [];
    const opened = [];
    const installs = [];
    let checks = 0;
    let flushes = 0;
    let cancelled = 0;
    updater.checkForUpdates = async () => {
        checks++;
        updater.emit('checking-for-update');
        return options.check?.(updater);
    };
    updater.quitAndInstall = (...args) => {
        installs.push(args);
        options.install?.(updater);
    };
    class Notification extends EventEmitter {
        constructor(settings) {
            super();
            this.settings = settings;
        }
        show() {
            notifications.push(this);
        }
    }
    const controller = createAppUpdater({
        updater, app: {isPackaged: options.packaged !== false}, Notification,
        onState: state => states.push(state),
        beforeInstall: async () => { flushes++; await options.flush?.(); },
        cancelInstall: () => { cancelled++; },
        openExternal: async url => opened.push(url), logger: {error() {}}
    });
    return {updater, controller, states, notifications, opened, installs,
        checks: () => checks, flushes: () => flushes, cancelled: () => cancelled};
}

test('updates download automatically, report progress, and notify only when ready', async () => {
    const f = fixture({check: updater => {
        updater.emit('update-available', {version: '1.4.0'});
        updater.emit('download-progress', {percent: 24.9});
        updater.emit('download-progress', {percent: 24.95});
    }});
    await f.controller.check();
    assert.equal(f.updater.autoDownload, true);
    assert.equal(f.updater.autoInstallOnAppQuit, false);
    assert.equal(f.updater.allowPrerelease, false);
    assert.equal(f.updater.allowDowngrade, false);
    assert.deepEqual(f.controller.getState(), {status: 'downloading', version: '1.4.0', percent: 24});
    assert.equal(f.states.length, 3);
    assert.equal(f.notifications.length, 0);
    f.updater.emit('update-downloaded', {version: '1.4.0'});
    f.updater.emit('update-downloaded', {version: '1.4.0'});
    assert.equal(f.notifications.length, 1);
    assert.match(f.notifications[0].settings.body, /restart Aerial/);
    assert.deepEqual(f.installs, []);
    await f.controller.check();
    assert.equal(f.checks(), 1);
});

test('notification click flushes settings before restarting and ignores repeated requests', async () => {
    let saved;
    const f = fixture({flush: () => new Promise(resolve => { saved = resolve; })});
    f.updater.emit('update-downloaded', {version: '1.4.0'});
    f.notifications[0].emit('click');
    await f.controller.restart();
    assert.equal(f.flushes(), 1);
    assert.deepEqual(f.installs, []);
    saved();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.installs, [[false, true]]);
});

test('config restart uses the same guarded installation path', async () => {
    const f = fixture();
    await f.controller.restart();
    assert.equal(f.flushes(), 0);
    f.updater.emit('update-downloaded', {version: '1.4.0'});
    await f.controller.restart();
    assert.equal(f.flushes(), 1);
    assert.deepEqual(f.installs, [[false, true]]);
});

for (const failure of ['check', 'download', 'flush', 'install']) {
    test(`${failure} failures expose a manual GitHub fallback`, async () => {
        const error = new Error('test failure');
        const f = fixture({
            check: updater => {
                if (failure === 'check') {
                    updater.emit('error', error);
                    throw error;
                }
                updater.emit('update-available', {version: '1.4.0'});
                return {downloadPromise: Promise.reject(error)};
            },
            flush: () => {
                if (failure === 'flush') {
                    throw error;
                }
            },
            install: updater => updater.emit('error', error)
        });
        if (['check', 'download'].includes(failure)) {
            await f.controller.check();
        } else {
            f.updater.emit('update-downloaded', {version: '1.4.0'});
            await f.controller.restart();
            assert.equal(f.cancelled(), 1);
        }
        assert.deepEqual(f.controller.getState(), {status: 'error'});
        f.notifications.at(-1).emit('click');
        assert.deepEqual(f.opened, ['https://github.com/AerialWindows/Aerial/releases']);
        if (failure === 'check') {
            assert.equal(f.notifications.length, 1);
        }
    });
}

test('checks are serialized, development builds are skipped, and errors can be retried', async () => {
    let done;
    const f = fixture({check: () => new Promise(resolve => { done = resolve; })});
    const pending = f.controller.check();
    await f.controller.check();
    assert.equal(f.checks(), 1);
    done();
    await pending;
    f.updater.emit('error', new Error('offline'));
    const retry = f.controller.check();
    f.updater.emit('update-not-available');
    done();
    await retry;
    assert.deepEqual(f.controller.getState(), {status: 'current'});
    const dev = fixture({packaged: false});
    await dev.controller.check();
    assert.equal(dev.checks(), 0);
    assert.deepEqual(dev.controller.getState(), {status: 'unsupported'});
});
