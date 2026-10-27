const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('restart and retry IPC only accept requests from the config window', () => {
    const source = fs.readFileSync(require.resolve('../src/app.js'), 'utf8');
    const start = source.indexOf("ipcMain.on('checkForUpdates'");
    const end = source.indexOf('//events from browser windows', start);
    const handlers = {};
    let checks = 0;
    let restarts = 0;
    const contents = {};
    vm.runInNewContext(source.slice(start, end), {
        ipcMain: {on: (channel, callback) => { handlers[channel] = callback; }},
        configWindow: {webContents: contents},
        checkForUpdate: () => { checks++; },
        applicationUpdater: {restart: () => { restarts++; }}
    });
    for (const handler of Object.values(handlers)) {
        handler({sender: {}});
    }
    assert.equal(checks, 0);
    assert.equal(restarts, 0);
    for (const handler of Object.values(handlers)) {
        handler({sender: contents});
    }
    assert.equal(checks, 1);
    assert.equal(restarts, 1);
});

test('installer quit bypass is enabled only after settings flush and is reset on failure', async () => {
    const source = fs.readFileSync(require.resolve('../src/app.js'), 'utf8');
    let options;
    let saved = false;
    const context = vm.createContext({
        require: name => name === './updates' ? {createAppUpdater: settings => {
            options = settings;
            return {check() {}};
        }} : {autoUpdater: {}},
        app: {}, Notification: class {}, shell: {}, configWindow: null,
        store: {flush: async () => saved}, settingsQuitReady: false,
        setTimeout, clearTimeout, setInterval: () => ({unref() {}})
    });
    vm.runInContext(source.slice(source.indexOf('let applicationUpdater;'),
        source.indexOf("ipcMain.handle('getUpdateStatus'")), context);
    context.checkForUpdate();
    await assert.rejects(options.beforeInstall(), /could not be saved/);
    assert.equal(context.settingsQuitReady, false);
    saved = true;
    await options.beforeInstall();
    assert.equal(context.settingsQuitReady, true);
    options.cancelInstall();
    assert.equal(context.settingsQuitReady, false);
});
