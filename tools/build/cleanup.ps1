param(
    [string]$DataDirectory,
    [string]$Catalog,
    [switch]$Silent,
    [switch]$LibraryOnly
)

$ErrorActionPreference = 'Stop'

function Get-NormalizedPath([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value) -or -not [IO.Path]::IsPathRooted($Value)) {
        throw 'Cache paths must be absolute.'
    }
    return [IO.Path]::GetFullPath($Value).TrimEnd('\', '/')
}

function Assert-NoReparsePoint([string]$Directory) {
    $current = [IO.DirectoryInfo]::new($Directory)
    while ($null -ne $current) {
        if ($current.Exists -and ($current.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Refusing to clean a linked directory: $Directory"
        }
        $current = $current.Parent
    }
}

function Remove-AerialCacheFiles([string]$Directory, $Ids) {
    $root = Get-NormalizedPath $Directory
    Assert-NoReparsePoint $root
    # Only known downloads and Aerial's hash-named conversions belong to us.
    # Never recursively remove a user-selected folder, including temp/converted.
    foreach ($folder in @($root, (Join-Path $root 'temp'), (Join-Path $root 'converted'))) {
        if (-not (Test-Path -LiteralPath $folder -PathType Container)) {
            continue
        }
        Assert-NoReparsePoint $folder
        foreach ($file in Get-ChildItem -LiteralPath $folder -File -Force) {
            $owned = if ($folder -eq (Join-Path $root 'converted')) {
                $file.Name -match '^[a-f0-9]{64}(\.[a-f0-9-]{36}\.partial)?\.mp4$'
            } else {
                $file.Extension -eq '.mov' -and $Ids.Contains($file.BaseName)
            }
            if ($owned -and -not ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                Remove-Item -LiteralPath $file.FullName -Force
            }
        }
        if ($folder -ne $root -and @(Get-ChildItem -LiteralPath $folder -Force).Count -eq 0) {
            Remove-Item -LiteralPath $folder
        }
    }
}

function Remove-AerialData([string]$Directory, [string]$Preserve) {
    $root = Get-NormalizedPath $Directory
    if ($root -eq $Preserve -or ($Preserve -and $root.StartsWith($Preserve + '\', [StringComparison]::OrdinalIgnoreCase)) -or -not (Test-Path -LiteralPath $root)) {
        return
    }
    Assert-NoReparsePoint $root
    foreach ($item in Get-ChildItem -LiteralPath $root -Force) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            # Remove the link itself; never follow it into another directory.
            $item.Delete()
        } elseif ($item.PSIsContainer) {
            Remove-AerialData $item.FullName $Preserve
        } else {
            Remove-Item -LiteralPath $item.FullName -Force
        }
    }
    if (@(Get-ChildItem -LiteralPath $root -Force).Count -eq 0) {
        Remove-Item -LiteralPath $root
    }
}

function Invoke-AerialCacheCleanup {
    $data = Get-NormalizedPath $DataDirectory
    Assert-NoReparsePoint $data
    $config = Join-Path $data 'config.json'
    if (-not (Test-Path -LiteralPath $config)) {
        Remove-AerialData $data ''
        return
    }
    $settings = Get-Content -LiteralPath $config -Raw | ConvertFrom-Json
    if ([string]::IsNullOrWhiteSpace($settings.cachePath)) {
        Remove-AerialData $data ''
        return
    }
    $cache = Get-NormalizedPath $settings.cachePath
    # Aerial owns its data folder, including the default cache.
    if ($cache -eq (Join-Path $data 'videos') -or -not (Test-Path -LiteralPath $cache -PathType Container)) {
        Remove-AerialData $data ''
        return
    }
    # Unattended uninstall must never opt in to deleting a moved cache.
    if ($Silent) {
        Remove-AerialData $data $cache
        return
    }
    Add-Type -AssemblyName System.Windows.Forms
    $answer = [System.Windows.Forms.MessageBox]::Show(
        "Delete Aerial's downloaded videos from this cache location?`n`n$cache`n`nUnrelated files will be kept.",
        'Uninstall Aerial', 'YesNo', 'Question', 'Button2')
    if ($answer -ne 'Yes') {
        Remove-AerialData $data $cache
        return
    }
    $ids = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($video in (Get-Content -LiteralPath $Catalog -Raw | ConvertFrom-Json)) {
        [void]$ids.Add($video.id)
    }
    foreach ($id in $settings.downloadedVideos) {
        [void]$ids.Add([string]$id)
    }
    Remove-AerialCacheFiles $cache $ids
    # Preserve any unrelated files, even in a moved cache inside the data folder.
    Remove-AerialData $data $cache
}

if (-not $LibraryOnly) {
    try {
        Invoke-AerialCacheCleanup
    } catch {
        Write-Error $_ -ErrorAction Continue
        exit 1
    }
}
