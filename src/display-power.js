const {execFile} = require('node:child_process');
const path = require('node:path');

// Query only: SystemExecutionState does not require administrator privileges.
const query = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AerialPower {
    [DllImport("powrprof.dll")]
    public static extern uint CallNtPowerInformation(int level, IntPtr input, uint inputLength, out uint state, uint outputLength);
}
'@
[uint32] $state = 0
$status = [AerialPower]::CallNtPowerInformation(16, [IntPtr]::Zero, 0, [ref] $state, 4)
if ($status -ne 0) {
    throw "CallNtPowerInformation failed: $status"
}
[Console]::WriteLine($state)
`;

function isDisplayRequired({run = execFile, platform = process.platform} = {}) {
    if (platform !== 'win32') {
        return Promise.resolve(false);
    }
    const executable = path.win32.join(process.env.SystemRoot || 'C:\\Windows',
        'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    return new Promise((resolve, reject) => {
        run(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
            Buffer.from(query, 'utf16le').toString('base64')],
        {windowsHide: true, timeout: 15000, maxBuffer: 4096}, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            const value = stdout.trim();
            if (!/^\d+$/.test(value) || Number(value) > 0xffffffff) {
                reject(new Error('Invalid system execution state'));
                return;
            }
            // ES_DISPLAY_REQUIRED (0x2); system-only requests may be background work.
            resolve((Number(value) & 2) !== 0);
        });
    });
}

module.exports = {isDisplayRequired};
