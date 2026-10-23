const assert = require('node:assert/strict');
const {test} = require('node:test');
const {isDisplayRequired} = require('../display-power');

for (const state of [0, 1, 2, 3, 7, 0x80000002]) {
    test(`execution state ${state} only blocks for a display request`, async () => {
        const required = await isDisplayRequired({platform: 'win32', run(executable, args, options, callback) {
            assert.ok(executable.endsWith('powershell.exe'));
            assert.equal(options.windowsHide, true);
            assert.equal(options.timeout, 4000);
            const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
            assert.match(script, /CallNtPowerInformation\(16,/);
            callback(null, `${state}\r\n`);
        }});
        assert.equal(required, (state & 2) !== 0);
    });
}

test('failed and malformed queries reject instead of allowing startup', async () => {
    for (const value of ['', 'garbage', '-1', '4294967296']) {
        await assert.rejects(isDisplayRequired({platform: 'win32', run(executable, args, options, callback) {
            callback(null, value);
        }}), /Invalid system execution state/);
    }
    await assert.rejects(isDisplayRequired({platform: 'win32', run(executable, args, options, callback) {
        callback(new Error('timeout'));
    }}), /timeout/);
});

test('other platforms do not spawn Windows commands', async () => {
    assert.equal(await isDisplayRequired({platform: 'linux', run() { assert.fail('unexpected command'); }}), false);
});
