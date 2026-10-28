param([string] $EncodedRoot, [string] $CurrentKey)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($EncodedRoot)))
$expectedRoot = [IO.Path]::GetFullPath([IO.Path]::Combine([Environment]::GetFolderPath('LocalApplicationData'), 'Aerial', 'scr-runtime'))
if ($root -ne $expectedRoot -or $CurrentKey -cnotmatch '^[a-f0-9]{64}$') {
    throw 'Invalid SCR cache cleanup location.'
}
foreach ($directory in @([IO.Path]::GetDirectoryName($root), $root)) {
    if (([IO.File]::GetAttributes($directory) -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Redirected SCR cache directories cannot be cleaned.'
    }
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AerialRuntimeLease {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr CreateMutex(IntPtr attributes, bool owned, string name);
    [DllImport("kernel32.dll")]
    public static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll")]
    public static extern bool ReleaseMutex(IntPtr handle);
    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr attributes, uint creation, uint flags, IntPtr template);
}
'@

function Test-SafeTree([string] $Directory) {
    foreach ($entry in [IO.Directory]::EnumerateFileSystemEntries($Directory)) {
        $attributes = [IO.File]::GetAttributes($entry)
        if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            return $false
        }
        if (($attributes -band [IO.FileAttributes]::Directory) -ne 0 -and -not (Test-SafeTree $entry)) {
            return $false
        }
    }
    return $true
}

foreach ($directory in [IO.Directory]::EnumerateDirectories($root)) {
    $name = [IO.Path]::GetFileName($directory)
    if ($name -cnotmatch '^([a-f0-9]{64})(?:\.bad)?$' -or $name -eq $CurrentKey) {
        continue
    }
    $key = $Matches[1]
    $target = [IO.Path]::GetFullPath($directory)
    # Validate the absolute target before any recursive removal; never traverse links.
    if ([IO.Path]::GetDirectoryName($target) -ne $root -or
        ([IO.File]::GetAttributes($target) -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        continue
    }
    $mutex = [AerialRuntimeLease]::CreateMutex([IntPtr]::Zero, $false, "Local\AerialScrExtract-$key")
    if ($mutex -eq [IntPtr]::Zero) {
        continue
    }
    $owned = $false
    $lease = [IntPtr]::new(-1)
    $executable = [IntPtr]::new(-1)
    try {
        $status = [AerialRuntimeLease]::WaitForSingleObject($mutex, 0)
        $owned = $status -eq 0 -or $status -eq 128
        if (-not $owned) {
            continue
        }
        $leasePath = [IO.Path]::Combine($target, '.in-use')
        if ([IO.File]::Exists($leasePath) -and ([IO.File]::GetAttributes($leasePath) -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            continue
        }
        $lease = [AerialRuntimeLease]::CreateFile($leasePath, 3221225472, 0, [IntPtr]::Zero, 4, 128, [IntPtr]::Zero)
        if ($lease -eq [IntPtr]::new(-1)) {
            continue
        }
        # Also protect runtimes made before the launcher introduced leases.
        $executablePath = [IO.Path]::Combine($target, 'Aerial.exe')
        if ([IO.File]::Exists($executablePath)) {
            $executable = [AerialRuntimeLease]::CreateFile($executablePath, 3221225472, 0, [IntPtr]::Zero, 3, 128, [IntPtr]::Zero)
            if ($executable -eq [IntPtr]::new(-1)) {
                continue
            }
        }
        if (-not (Test-SafeTree $target)) {
            continue
        }
        if ($executable -ne [IntPtr]::new(-1)) {
            [void] [AerialRuntimeLease]::CloseHandle($executable)
            $executable = [IntPtr]::new(-1)
        }
        [void] [AerialRuntimeLease]::CloseHandle($lease)
        $lease = [IntPtr]::new(-1)
        [IO.Directory]::Delete($target, $true)
    } catch {
        # Locked files, access failures, and racing exits are safe to retry later.
    } finally {
        if ($executable -ne [IntPtr]::new(-1)) {
            [void] [AerialRuntimeLease]::CloseHandle($executable)
        }
        if ($lease -ne [IntPtr]::new(-1)) {
            [void] [AerialRuntimeLease]::CloseHandle($lease)
        }
        if ($owned) {
            [void] [AerialRuntimeLease]::ReleaseMutex($mutex)
        }
        [void] [AerialRuntimeLease]::CloseHandle($mutex)
    }
}
