const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createScrUpdater} = require('../src/scr-updates');

function fixture(tag = 'v2.1.0', metadata = 'version: 2.1.0', releaseOptions = {}) {
    const requests = [];
    const notifications = [];
    const opened = [];
    const errors = [];
    const updater = createScrUpdater({
        app: {isPackaged: true, getVersion: () => '2.0.1'},
        Notification: class {
            constructor(options) {
                notifications.push(this);
                this.options = options;
            }
            on(event, callback) {
                this.click = callback;
            }
            show() {}
        },
        openExternal: url => opened.push(url),
        logger: {error: error => errors.push(error)},
        fetchRelease: async url => {
            requests.push(url);
            return {ok: true, json: async () => ({tag_name: tag, ...releaseOptions}), text: async () => metadata};
        }
    });
    return {updater, requests, notifications, opened, errors};
}

test('SCR updates verify release metadata and notify once without installing', async () => {
    const f = fixture();
    await f.updater.check();
    await f.updater.check();
    assert.equal(f.notifications.length, 1);
    assert.equal(f.updater.getState().status, 'available');
    assert.match(f.requests[1], /download\/v2.1.0\/latest.yml$/);
    assert.deepEqual(f.opened, []);
    f.notifications[0].click();
    assert.deepEqual(f.opened, ['https://github.com/AerialWindows/Aerial/releases']);
});

for (const [tag, metadata, options] of [
    ['v2.0.1', 'version: 2.0.1'],
    ['v2.0.0', 'version: 2.0.0'],
    ['v2.1.0-beta.1', 'version: 2.1.0-beta.1'],
    ['v2.1.0', 'version: 2.1.0-beta.1'],
    ['v2.1.0', 'version: 2.2.0'],
    ['v2.1.0', 'version: invalid'],
    ['v2.1.0', 'version: 2.1.0', {prerelease: true}],
    ['v2.1.0', 'version: 2.1.0', {draft: true}]
]) {
    test(`SCR ignores unsuitable release ${tag}, ${metadata}, ${JSON.stringify(options)}`, async () => {
        const f = fixture(tag, metadata, options);
        await f.updater.check();
        assert.equal(f.notifications.length, 0);
    });
}

test('SCR settings hide disabled features without changing the original definition', () => {
    const module = {exports: {}};
    vm.runInNewContext(fs.readFileSync(require.resolve('../src/build-mode'), 'utf8'), {
        module, require: () => ({aerialScr: true})
    });
    const definition = require('../web/config/settings.json');
    const original = JSON.stringify(definition);
    const entries = module.exports.settingsDefinition(definition).flatMap(group => group.entries);
    for (const id of ['useTray', 'startAfter', 'sleepAfterBlank', 'lockAfterRun', 'QUNS_BUSY', 'restartForUpdate',
        'enableGlobalShortcut', 'globalShortcutModifier1', 'globalShortcutModifier2', 'globalShortcutKey']) {
        assert.equal(entries.some(entry => entry.id === id), false);
    }
    assert.equal(entries.some(entry => entry.id === 'blankAfter'), true);
    assert.equal(entries.find(entry => entry.id === 'manualUpdate').name, 'Download new version from GitHub');
    assert.deepEqual(Array.from(entries.find(entry => entry.id === 'manualUpdate').visibleWhen.in), ['available', 'error']);
    assert.deepEqual(Array.from(entries.find(entry => entry.id === 'updateStatus').visibleWhen.in), ['checking', 'current']);
    assert.equal(JSON.stringify(definition), original);
});

test('SCR update status reports current only after checking and reports errors honestly', async () => {
    const current = fixture('v2.0.1', 'version: 2.0.1');
    assert.equal(current.updater.getState().status, 'checking');
    await current.updater.check();
    assert.equal(current.updater.getState().status, 'current');
    const invalid = fixture('v2.1.0', 'version: invalid');
    await invalid.updater.check();
    assert.equal(invalid.updater.getState().status, 'error');
});

test('SCR startup skips login registration and tray without changing saved settings', async () => {
    const source = fs.readFileSync(require.resolve('../src/app.js'), 'utf8');
    const config = [];
    const writes = [];
    const context = vm.createContext({
        require: require('node:module').createRequire(require.resolve('../src/app.js')),
        isScr: true, process: {argv: []}, app: {isPackaged: true, getVersion: () => '2.0.1'},
        store: {get: key => ({configured: true, version: '2.0.1', useTray: true})[key], set: (...args) => writes.push(args)},
        autoLauncher: {enable: () => assert.fail('login startup'), disable: () => assert.fail('login registration change')},
        calculateAstronomy() {}, checkForUpdate() {}, setupGlobalShortcut() {},
        screen: {getAllDisplays: () => []}, clearCacheTemp: async () => {}, pruneVideoCache() {},
        createTrayWindow: () => assert.fail('tray'), createConfigWindow: args => config.push(args),
        setTimeout() {}, downloadVideos() {}
    });
    vm.runInContext(source.slice(source.indexOf('async function startUp()'), source.indexOf('//loads the config file')), context);
    await context.startUp();
    assert.equal(config.length, 1);
    assert.equal(writes.some(([key]) => key === 'useTray'), false);
});
