const path = require('node:path');
const fs = require('node:fs');
const {execFile} = require('node:child_process');

function scheduleRuntimeCleanup() {
    const runtime = path.dirname(process.execPath);
    const key = process.env.AERIAL_SCR_CACHE_KEY || path.basename(runtime);
    const root = process.env.AERIAL_SCR_CACHE_ROOT || path.dirname(runtime);
    if (!/^[a-f0-9]{64}$/.test(key) || path.basename(root) !== 'scr-runtime' || path.basename(path.dirname(root)) !== 'Aerial') {
        return;
    }
    const timer = setTimeout(() => {
        try {
            const script = fs.readFileSync(path.join(__dirname, 'scr-runtime-cache.ps1'), 'utf8');
            // Encoded arguments avoid interpolating filesystem paths into PowerShell code.
            const encodedRoot = Buffer.from(root, 'utf8').toString('base64');
            const command = `& {\n${script}\n} -EncodedRoot '${encodedRoot}' -CurrentKey '${key}'`;
            execFile(path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
                ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')],
                {windowsHide: true, timeout: 60000}, error => {
                    if (error) {
                        console.warn('Unable to clean unused SCR runtimes:', error.message);
                    }
                });
        } catch (error) {
            console.warn('Unable to clean unused SCR runtimes:', error.message);
        }
    }, 10000);
    timer.unref();
}

module.exports = {scheduleRuntimeCleanup};
