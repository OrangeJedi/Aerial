const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');

function fixture(options = {}) {
    const data = {updateAvailable: '1.3.0'};
    const notifications = [];
    let respond;
    let requestOptions;
    let refreshes = 0;
    const context = vm.createContext({
        semver: require('semver'),
        app: {isPackaged: options.packaged !== false, getVersion: () => options.version || '1.3.0'},
        store: {set: (key, value) => { data[key] = value; }},
        configWindow: {isDestroyed: () => false, webContents: {send: channel => {
            assert.equal(channel, 'displaySettings');
            refreshes++;
        }}},
        AbortSignal,
        fetch: (url, settings) => {
            requestOptions = {url, ...settings};
            return new Promise((resolve, reject) => {
                respond = (release, status = 200, error = null) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve({ok: status === 200, status, json: async () => release});
                    }
                };
            });
        },
        console: {log() {}},
        Notification: function (settings) { this.show = () => notifications.push(settings); }
    });
    vm.runInContext(source.slice(source.indexOf('function availableUpdate('),
        source.indexOf('//events from browser windows')), context);
    return {context, data, notifications, refreshes: () => refreshes, options: () => requestOptions,
        respond: (...args) => respond(...args)};
}

for (const [current, latest, expected] of [
    ['1.3.0', 'v1.3.0', false], ['1.3.0', '1.2.9', false],
    ['2.0.0', '1.9.9', false], ['1.10.0', '1.9.0', false],
    ['1.3.0', 'v1.10.0', '1.10.0'], ['1.3.0', '1.3.10', '1.3.10'],
    ['1.3.0', '2.0.0', '2.0.0'], ['1.3.0-beta.1', 'v1.3.0', '1.3.0'],
    ['1.3.0+build.1', 'v1.3.0', false]
]) {
    test(`update check compares ${current} with ${latest}`, async () => {
        const f = fixture({version: current});
        const pending = f.context.checkForUpdate();
        assert.equal(f.data.updateAvailable, false);
        f.respond({tag_name: latest});
        await pending;
        assert.equal(f.data.updateAvailable, expected);
        assert.equal(f.notifications.length, expected ? 1 : 0);
        assert.equal(f.refreshes(), 2);
    });
}

for (const release of [null, {}, 'not json', {tag_name: 130}, {tag_name: 'invalid'},
    {tag_name: 'v1.4.0-beta.1'}, {tag_name: 'v1.4.0', prerelease: true},
    {tag_name: 'v1.4.0', draft: true}]) {
    test(`invalid or unpublished release is ignored: ${JSON.stringify(release)}`, async () => {
        const f = fixture();
        const pending = f.context.checkForUpdate();
        f.respond(release);
        await pending;
        assert.equal(f.data.updateAvailable, false);
        assert.equal(f.notifications.length, 0);
    });
}

test('failed requests clear stale updates and development copies do not check for releases', async () => {
    for (const status of [403, 404, 500]) {
        const f = fixture();
        const pending = f.context.checkForUpdate();
        assert.ok(f.options().url.endsWith('/releases/latest'));
        assert.ok(f.options().signal instanceof AbortSignal);
        f.respond({tag_name: 'v9.0.0'}, status);
        await pending;
        assert.equal(f.data.updateAvailable, false);
        assert.equal(f.notifications.length, 0);
    }
    const failed = fixture();
    const pending = failed.context.checkForUpdate();
    failed.respond(null, 200, new Error('offline'));
    await pending;
    assert.equal(failed.data.updateAvailable, false);
    const dev = fixture({packaged: false});
    await dev.context.checkForUpdate();
    assert.equal(dev.options(), undefined);
    assert.equal(dev.data.updateAvailable, false);
});

test('settings hide both update indicators when an available update is cleared', () => {
    let available = '1.4.0';
    const elements = {aboutUpdate: {style: {}}, updateBadge: {style: {}}};
    const renderer = fs.readFileSync(require.resolve('../web/config.js'), 'utf8');
    const start = renderer.indexOf('function displayAvailableUpdate()');
    const context = vm.createContext({electron: {store: {get: () => available}},
        document: {getElementById: id => elements[id]}});
    vm.runInContext(renderer.slice(start, renderer.indexOf('\ndisplaySettings();', start)), context);
    context.displayAvailableUpdate();
    assert.equal(elements.aboutUpdate.style.display, '');
    available = false;
    context.displayAvailableUpdate();
    for (const element of Object.values(elements)) {
        assert.equal(element.style.display, 'none');
    }
});
