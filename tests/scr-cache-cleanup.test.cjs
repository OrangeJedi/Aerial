const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');

test('runtime cleanup preserves current, active, unrelated, and redirected folders', {skip: process.platform !== 'win32'}, async t => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'aerial-cleanup-'));
    t.after(async () => {
        assert.equal(path.dirname(temporary), os.tmpdir());
        await fs.rm(temporary, {recursive: true, force: true});
    });
    const root = path.join(temporary, 'Aerial', 'scr-runtime');
    const current = 'a'.repeat(64);
    const active = 'b'.repeat(64);
    const idle = 'c'.repeat(64);
    const bad = 'd'.repeat(64) + '.bad';
    const outside = path.join(temporary, 'outside');
    for (const directory of [current, active, idle, bad, 'videos']) {
        await fs.mkdir(path.join(root, directory), {recursive: true});
        await fs.writeFile(path.join(root, directory, '.in-use'), '');
        await fs.writeFile(path.join(root, directory, 'Aerial.exe'), 'fixture');
    }
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'preserve.txt'), 'outside');
    await fs.symlink(outside, path.join(root, 'e'.repeat(64)), 'junction');
    let script = await fs.readFile(require.resolve('../src/scr-runtime-cache.ps1'), 'utf8');
    script = script.replace("[Environment]::GetFolderPath('LocalApplicationData')", `'${temporary.replaceAll("'", "''")}'`);
    const activeLease = path.join(root, active, '.in-use').replaceAll("'", "''");
    const command = `$lease = [IO.File]::Open('${activeLease}', 'Open', 'ReadWrite', 'ReadWrite')
try {
    & {\n${script}\n} -EncodedRoot '${Buffer.from(root).toString('base64')}' -CurrentKey '${current}'
} finally {
    $lease.Dispose()
}`;
    await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], {windowsHide: true, timeout: 30000});
    const remaining = await fs.readdir(root);
    assert.ok(remaining.includes(current));
    assert.ok(remaining.includes(active));
    assert.ok(remaining.includes('videos'));
    assert.ok(remaining.includes('e'.repeat(64)));
    assert.ok(!remaining.includes(idle));
    assert.ok(!remaining.includes(bad));
    assert.equal(await fs.readFile(path.join(outside, 'preserve.txt'), 'utf8'), 'outside');
});
