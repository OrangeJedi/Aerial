const assert = require('node:assert/strict');
const {test} = require('node:test');
const {isFullscreenAppActive} = require('../fullscreen-app');

for (const state of [1, 2, 3, 4, 5, 6, 7]) {
    test(`notification state ${state} blocks only fullscreen and presentation states`, async () => {
        const active = await isFullscreenAppActive({platform: 'win32', run(executable, args, options, callback) {
            assert.ok(executable.endsWith('powershell.exe'));
            assert.equal(options.windowsHide, true);
            const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
            assert.match(script, /SHQueryUserNotificationState\(\[ref\] \$state\)/);
            callback(null, `${state}\r\n`);
        }});
        assert.equal(active, [2, 3, 4].includes(state));
    });
}

test('notification query rejects errors and invalid states', async () => {
    for (const value of ['', 'garbage', '0', '-1', '8']) {
        await assert.rejects(isFullscreenAppActive({platform: 'win32', run(executable, args, options, callback) {
            callback(null, value);
        }}), /Invalid user notification state/);
    }
    await assert.rejects(isFullscreenAppActive({platform: 'win32', run(executable, args, options, callback) {
        callback(new Error('query failed'));
    }}), /query failed/);
});

test('other platforms skip the notification query', async () => {
    assert.equal(await isFullscreenAppActive({platform: 'linux', run() { assert.fail('unexpected query'); }}), false);
});
