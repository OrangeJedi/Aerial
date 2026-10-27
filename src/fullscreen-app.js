const {execFile} = require('node:child_process');
const path = require('node:path');

const query = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class AerialFullscreen {
    [DllImport("shell32.dll")]
    public static extern int SHQueryUserNotificationState(out int state);
}
'@
[int] $state = 0
$status = [AerialFullscreen]::SHQueryUserNotificationState([ref] $state)
if ($status -ne 0) {
    throw "SHQueryUserNotificationState failed: $status"
}
[Console]::WriteLine($state)
`;

function isFullscreenAppActive({run = execFile, platform = process.platform} = {}) {
    if (platform !== 'win32') {
        return Promise.resolve(false);
    }
    const executable = path.win32.join(process.env.SystemRoot || 'C:\\Windows',
        'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    return new Promise((resolve, reject) => {
        run(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
            Buffer.from(query, 'utf16le').toString('base64')],
        {windowsHide: true, timeout: 4000, maxBuffer: 4096}, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            const value = stdout.trim();
            if (!/^[1-7]$/.test(value)) {
                reject(new Error('Invalid user notification state'));
                return;
            }
            // QUNS_BUSY, QUNS_RUNNING_D3D_FULL_SCREEN, QUNS_PRESENTATION_MODE.
            resolve([2, 3, 4].includes(Number(value)));
        });
    });
}

module.exports = {isFullscreenAppActive};
