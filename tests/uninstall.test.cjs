const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

test('uninstall removes owned cache files and preserves moved caches in silent mode', {skip: process.platform !== 'win32'}, () => {
    const root = fs.mkdtempSync(path.join(__dirname, '../.test-tmp-uninstall-'));
    try {
        const script = `
            . './build/cleanup.ps1' -LibraryOnly
            $root = $env:AERIAL_TEST_ROOT
            $cache = Join-Path $root 'cache'
            New-Item -ItemType Directory -Path $cache, "$cache/temp", "$cache/converted" | Out-Null
            $hash = 'a' * 64
            foreach ($name in @('known.mov', 'unrelated.mov', 'notes.txt', 'temp/known.mov', "converted/$hash.mp4", 'converted/family.mp4')) {
                Set-Content -LiteralPath (Join-Path $cache $name) -Value 'fixture'
            }
            $ids = [Collections.Generic.HashSet[string]]::new()
            [void]$ids.Add('known')
            Remove-AerialCacheFiles $cache $ids
            foreach ($name in @('known.mov', 'temp/known.mov', "converted/$hash.mp4")) {
                if (Test-Path -LiteralPath (Join-Path $cache $name)) { throw "Not removed: $name" }
            }
            foreach ($name in @('unrelated.mov', 'notes.txt', 'converted/family.mp4')) {
                if (-not (Test-Path -LiteralPath (Join-Path $cache $name))) { throw "Not preserved: $name" }
            }
            $DataDirectory = Join-Path $root 'data'
            New-Item -ItemType Directory -Path "$DataDirectory/moved" | Out-Null
            Set-Content -LiteralPath "$DataDirectory/moved/known.mov" -Value 'fixture'
            @{cachePath = "$DataDirectory/moved"} | ConvertTo-Json | Set-Content "$DataDirectory/config.json"
            $Silent = $true
            Invoke-AerialCacheCleanup
            if (-not (Test-Path "$DataDirectory/moved/known.mov")) { throw 'Silent uninstall deleted moved videos' }
            if (Test-Path "$DataDirectory/config.json") { throw 'Settings left behind' }
            $DataDirectory = Join-Path $root 'default'
            New-Item -ItemType Directory -Path "$DataDirectory/videos" | Out-Null
            @{cachePath = "$DataDirectory/videos"} | ConvertTo-Json | Set-Content "$DataDirectory/config.json"
            Set-Content "$DataDirectory/videos/known.mov" 'fixture'
            Invoke-AerialCacheCleanup
            if (Test-Path $DataDirectory) { throw 'Default data left behind' }
        `;
        const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
            cwd: path.join(__dirname, '..'), encoding: 'utf8', env: {...process.env, AERIAL_TEST_ROOT: root}
        });
        assert.equal(result.status, 0, result.stdout + result.stderr);
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
});
