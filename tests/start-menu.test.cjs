const assert = require('node:assert/strict');
const {test} = require('node:test');
const {dismissStartMenu} = require('../start-menu');

test('Start menu helper runs hidden with a bounded execution time', async () => {
    let complete;
    let finished = false;
    const pending = dismissStartMenu({platform: 'win32', run(executable, args, options, callback) {
        assert.ok(executable.endsWith('powershell.exe'));
        assert.equal(options.windowsHide, true);
        assert.equal(options.timeout, 4000);
        const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
        assert.match(script, /StartMenuExperienceHost/);
        assert.match(script, /\$owner\.ProcessName -eq 'SearchHost' -and \$className\.ToString\(\) -eq 'Windows\.UI\.Core\.CoreWindow'/);
        assert.match(script, /DV2ControlHost/);
        assert.match(script, /GetForegroundWindow\(\) -eq \$window/);
        assert.match(script, /SendKeys\('\{ESC\}'\)/);
        complete = callback;
    }}).then(() => { finished = true; });
    await Promise.resolve();
    assert.equal(finished, false);
    complete(null);
    await pending;
    assert.equal(finished, true);
});

test('Start menu helper reports failures so startup can recover', async () => {
    await assert.rejects(dismissStartMenu({platform: 'win32', run(executable, args, options, callback) {
        callback(new Error('timeout'));
    }}), /timeout/);
});

test('other platforms do not launch the Start menu helper', async () => {
    await dismissStartMenu({platform: 'linux', run() { assert.fail('unexpected command'); }});
});

