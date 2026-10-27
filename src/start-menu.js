const {execFile} = require('node:child_process');
const path = require('node:path');

const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class AerialStartMenu {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(IntPtr window, StringBuilder name, int count);
}
'@
$window = [AerialStartMenu]::GetForegroundWindow()
[uint32] $ownerId = 0
[void] [AerialStartMenu]::GetWindowThreadProcessId($window, [ref] $ownerId)
if ($ownerId -eq 0) {
    exit
}
$owner = Get-Process -Id $ownerId -ErrorAction SilentlyContinue
$className = New-Object System.Text.StringBuilder 256
[void] [AerialStartMenu]::GetClassName($window, $className, $className.Capacity)
$isStart = $owner.ProcessName -eq 'StartMenuExperienceHost' -or
    ($owner.ProcessName -eq 'SearchHost' -and $className.ToString() -eq 'Windows.UI.Core.CoreWindow') -or
    ($owner.ProcessName -eq 'explorer' -and $className.ToString() -eq 'DV2ControlHost')
if ($isStart) {
    $shell = New-Object -ComObject WScript.Shell
    if ([AerialStartMenu]::GetForegroundWindow() -eq $window) {
        $shell.SendKeys('{ESC}')
        Start-Sleep -Milliseconds 100
    }
}
`;

function dismissStartMenu({run = execFile, platform = process.platform} = {}) {
    if (platform !== 'win32') {
        return Promise.resolve();
    }
    const executable = path.win32.join(process.env.SystemRoot || 'C:\\Windows',
        'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    return new Promise((resolve, reject) => {
        run(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
            Buffer.from(script, 'utf16le').toString('base64')],
        {windowsHide: true, timeout: 4000, maxBuffer: 4096}, error => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}

module.exports = {dismissStartMenu};
