const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {normalizeLaunchArguments} = require('../src/launch-arguments');

test('launch flags are case insensitive and colon arguments preserve their values', () => {
    assert.deepEqual(normalizeLaunchArguments(['C:/My App/Aerial.scr', '/S', '/C:123', '/P:0xABC', '/NQ', '/DT', 'C:/VIDEO.MP4']),
        ['C:/My App/Aerial.scr', '/s', '/c', '123', '/p', '0xABC', '/nq', '/dt', 'C:/VIDEO.MP4']);
    assert.deepEqual(normalizeLaunchArguments(['/c:', '/p', '123', '--user-data-dir=C:/MixedCase']),
        ['/c', '/p', '123', '--user-data-dir=C:/MixedCase']);
});

for (const isScr of [false, true]) {
    test(`global shortcut registration respects SCR mode: ${isScr}`, () => {
        const source = fs.readFileSync(require.resolve('../src/app.js'), 'utf8');
        const calls = [];
        const context = vm.createContext({
            isScr, store: {get: key => ({enableGlobalShortcut: true, globalShortcutModifier1: 'Super', globalShortcutModifier2: '+Control', globalShortcutKey: 'A'})[key]},
            globalShortcut: {unregisterAll: () => calls.push('unregister'), register: key => calls.push(key)}, createSSWindow() {}
        });
        vm.runInContext(source.slice(source.indexOf('function setupGlobalShortcut()'), source.indexOf('//video functions')), context);
        context.setupGlobalShortcut();
        assert.deepEqual(calls, isScr ? [] : ['unregister', 'Super+Control+A']);
    });
}
