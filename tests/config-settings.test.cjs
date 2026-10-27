const assert = require('node:assert/strict');
const {test} = require('node:test');
const definition = require('../web/config/settings.json');
const entries = definition.flatMap(section => section.entries);
const entry = id => entries.find(entry => entry.id === id);

test('settings references are valid and About is last', () => {
    const ids = new Set(entries.map(entry => entry.id));
    const keys = new Set(entries.map(entry => entry.key).filter(Boolean));
    assert.equal(ids.size, entries.length);
    assert.equal(definition.at(-1).id, 'about');
    function condition(value) {
        if (!value) {
            return;
        }
        if (value.all) {
            value.all.forEach(condition);
        } else if (value.key) {
            assert(keys.has(value.key), value.key);
        } else {
            assert.equal(value.source, 'updateStatus');
        }
    }
    for (const section of definition) {
        for (const setting of section.entries) {
            assert.equal(setting.section, section.id);
            assert(setting.name && setting.type);
            condition(setting.visibleWhen);
            condition(setting.enabledWhen);
            condition(setting.requiresWhenTrue);
            setting.optionSets?.forEach(set => condition(set.when));
            for (const other of setting.exclusiveWith || []) {
                assert(entry(other).exclusiveWith.includes(setting.id));
            }
        }
    }
});

test('checkbox exclusions persist together only when enabling a conflicting option', async () => {
    const {entryChanges} = await import('../web/config/settings-model.js');
    assert.deepEqual(entryChanges(entry('sameVideoOnScreens'), true, () => true, entries), {sameVideoOnScreens: true, preventSameVideoOnScreens: false});
    assert.deepEqual(entryChanges(entry('preventSameVideoOnScreens'), true, () => true, entries), {preventSameVideoOnScreens: true, sameVideoOnScreens: false});
    assert.deepEqual(entryChanges(entry('sameVideoOnScreens'), false, () => true, entries), {sameVideoOnScreens: false});
});

test('dependent controls and sunrise prerequisites follow checkbox states', async () => {
    const {matches} = await import('../web/config/settings-model.js');
    const values = {blankScreen: true, sleepAfterBlank: false, allow4K: true, allowH265: false, useLocationForSunrise: true, latitude: '', longitude: '0'};
    const read = key => values[key];
    assert.equal(matches(entry('sleepAfterBlankDelay').enabledWhen, read), false);
    values.sleepAfterBlank = true;
    assert.equal(matches(entry('sleepAfterBlankDelay').enabledWhen, read), true);
    assert.equal(matches(entry('prefer4K240').enabledWhen, read), false);
    assert.equal(matches(entry('sunrise').enabledWhen, read), false);
    assert.equal(matches(entry('useLocationForSunrise').requiresWhenTrue, read), false);
    values.latitude = '0';
    assert.equal(matches(entry('useLocationForSunrise').requiresWhenTrue, read), true);
});

test('transition option sets and visibility change with transition type', async () => {
    const {matches, optionsFor} = await import('../web/config/settings-model.js');
    const direction = entry('transitionDirection');
    for (const [type, visible, count] of [['dissolve', false, 0], ['fade', true, 9], ['wipe', true, 5], ['circle', true, 3]]) {
        assert.equal(matches(direction.visibleWhen, () => type), visible);
        assert.equal(optionsFor(direction, () => type).length, count);
    }
});

test('filter writes update only the matching item and preserve numeric storage', async () => {
    const {entryChanges, readEntry} = await import('../web/config/settings-model.js');
    const filters = [{name: 'blur', value: 2, suffix: 'px'}, {name: 'brightness', value: 100}];
    const setting = entry('videoFilters.blur');
    const changes = entryChanges(setting, '15', () => filters, entries);
    assert.equal(changes.videoFilters[0].value, 15);
    assert.equal(changes.videoFilters[0].suffix, 'px');
    assert.equal(changes.videoFilters[1].value, 100);
    assert.equal(filters[0].value, 2);
    assert.equal(readEntry(setting, () => changes.videoFilters), 15);
});

test('updater controls follow runtime status without stale actions', async () => {
    const {matches, updateMessage} = await import('../web/config/settings-model.js');
    for (const status of ['downloading', 'ready', 'installing', 'error', 'current', 'unsupported']) {
        const state = {status, version: '1.5.0', percent: 42};
        const sources = {updateStatus: state};
        assert.equal(matches(entry('restartForUpdate').visibleWhen, () => {}, sources), status === 'ready');
        assert.equal(matches(entry('manualUpdate').visibleWhen, () => {}, sources), status === 'error');
        assert.equal(matches(entry('checkForUpdates').visibleWhen, () => {}, sources), ['idle', 'current', 'error'].includes(status));
        if (status === 'downloading') {
            assert.match(updateMessage(state), /42%/);
        }
    }
});

test('system accent is available only to the config window', () => {
    const fs = require('node:fs');
    const vm = require('node:vm');
    const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
    const start = source.indexOf("ipcMain.handle('getConfigAccent'");
    let handler;
    let reads = 0;
    const contents = {};
    vm.runInNewContext(source.slice(start, source.indexOf('let applicationUpdater;', start)), {
        ipcMain: {handle: (channel, callback) => { assert.equal(channel, 'getConfigAccent'); handler = callback; }},
        configWindow: {webContents: contents},
        systemPreferences: {getAccentColor: () => { reads++; return '0078D4FF'; }}
    });
    assert.equal(handler({sender: {}}), null);
    assert.equal(reads, 0);
    assert.equal(handler({sender: contents}), '0078D4FF');
    assert.equal(reads, 1);
});
