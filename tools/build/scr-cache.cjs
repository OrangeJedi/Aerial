const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

async function runtimeManifest(directory) {
    const hash = createHash('sha256');
    const files = [];
    async function visit(relative = '') {
        const entries = await fs.promises.readdir(path.join(directory, relative), {withFileTypes: true});
        entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
        for (const entry of entries) {
            const name = path.join(relative, entry.name);
            if (entry.isDirectory()) {
                await visit(name);
            } else {
                hash.update(name.replaceAll('\\', '/')).update('\0');
                const fileHash = createHash('sha256');
                let size = 0;
                for await (const chunk of fs.createReadStream(path.join(directory, name))) {
                    hash.update(chunk);
                    fileHash.update(chunk);
                    size += chunk.length;
                }
                hash.update('\0');
                files.push({name: name.replaceAll('\\', '/'), hash: fileHash.digest('hex'), size});
            }
        }
    }
    await visit();
    return {key: hash.digest('hex'), files};
}

async function runtimeKey(directory) {
    return (await runtimeManifest(directory)).key;
}

function cachedPortableScript(template, key, files = []) {
    if (!/^[a-f0-9]{64}$/.test(key)) {
        throw new Error('Invalid SCR runtime cache key');
    }
    const checks = files.map((file, index) => {
        if (!/^[a-f0-9]{64}$/.test(file.hash) || /[":\r\n]/.test(file.name) ||
            !Number.isSafeInteger(file.size) || file.size < 0 || file.size > 0x7fffffff ||
            file.name.startsWith('/') || file.name.split(/[\\/]/).some(part => !part || part === '..' || part === '.')) {
            throw new Error('Invalid SCR runtime manifest');
        }
        const name = file.name.replaceAll('/', '\\').replaceAll('$', '$$');
        return `  ClearErrors
  FileOpen $R8 "$INSTDIR\\${name}" r
  IfErrors \${FAILURE}
  FileSeek $R8 0 END $R5
  FileClose $R8
  StrCmp $R5 "${file.size}" +2
  Goto \${FAILURE}
  ClearErrors
  GetFileTime "$INSTDIR\\${name}" $R5 $R6
  IfErrors \${FAILURE}
  StrCpy $R5 "$R5:$R6:$cacheDay"
  ClearErrors
  FileOpen $R8 "$INSTDIR\\.verified-${index}" r
  IfErrors \${PREFIX}_hash_${index}
  FileRead $R8 $R6
  FileClose $R8
  StrCmp $R5 $R6 \${PREFIX}_verified_${index}
\${PREFIX}_hash_${index}:
  \${StdUtils.HashFile} $R7 "SHA2-256" "$INSTDIR\\${name}"
  StrCmp $R7 "${file.hash}" +2
  Goto \${FAILURE}
  ClearErrors
  FileOpen $R8 "$INSTDIR\\.verified-${index}" w
  IfErrors \${FAILURE}
  FileWrite $R8 $R5
  FileClose $R8
  IfErrors \${FAILURE}
\${PREFIX}_verified_${index}:`;
    }).join('\n');
    let script = template.replace(/\r\n/g, '\n');
    function replaceOnce(before, after) {
        if (!script.includes(before) || script.indexOf(before) !== script.lastIndexOf(before)) {
            throw new Error('The electron-builder portable template changed; review the SCR cache integration.');
        }
        script = script.replace(before, after);
    }
    // The pinned portable template omits the ARM64-only useZip branch.
    // Embed its runtime directly, just as the x64-only branch does.
    replaceOnce('      !insertmacro extractEmbeddedAppPackage', `      !ifdef APP_DIR_ARM64
        File /r "\${APP_DIR_ARM64}\\*.*"
      !else
        !insertmacro extractEmbeddedAppPackage
      !endif`);
    replaceOnce('Section\n', `Var cacheMutex
Var runtimeLease
Var cacheDay

!macro verifyRuntime FAILURE PREFIX
${checks}
!macroend

Section
  StrCpy $runtimeLease 0
  \${StdUtils.GetDays} $cacheDay
`);
    replaceOnce('  StrCpy $INSTDIR "$PLUGINSDIR\\app"\n  !ifdef UNPACK_DIR_NAME\n    StrCpy $INSTDIR "$TEMP\\${UNPACK_DIR_NAME}"\n  !endif', `  SetShellVarContext current
  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("AERIAL_SCR_CACHE_ROOT", "$LOCALAPPDATA\\Aerial\\scr-runtime").r0'
  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("AERIAL_SCR_CACHE_KEY", "${key}").r0'
  StrCpy $INSTDIR "$LOCALAPPDATA\\Aerial\\scr-runtime\\${key}"
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\\AerialScrExtract-${key}") p.s'
  Pop $cacheMutex
  StrCmp $cacheMutex 0 cacheFailed
  System::Call 'kernel32::WaitForSingleObject(p $cacheMutex, i 30000) i.s'
  Pop $R9
  StrCmp $R9 0 cacheLocked
  StrCmp $R9 128 cacheLocked
  System::Call 'kernel32::CloseHandle(p $cacheMutex)'
  Abort
cacheLocked:
  System::Call 'kernel32::GetFileAttributesW(w "$LOCALAPPDATA\\Aerial") i.s'
  Pop $R7
  StrCmp $R7 -1 extractRuntime
  IntOp $R7 $R7 & 0x400
  StrCmp $R7 0 +2
  Goto isolatedRuntime
  System::Call 'kernel32::GetFileAttributesW(w "$LOCALAPPDATA\\Aerial\\scr-runtime") i.s'
  Pop $R7
  StrCmp $R7 -1 extractRuntime
  IntOp $R7 $R7 & 0x400
  StrCmp $R7 0 +2
  Goto isolatedRuntime
  System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR") i.s'
  Pop $R7
  StrCmp $R7 -1 extractRuntime
  IntOp $R7 $R7 & 0x400
  StrCmp $R7 0 +2
  Goto isolatedRuntime
  IfFileExists "$INSTDIR\\.complete" 0 extractRuntime
  FileOpen $R8 "$INSTDIR\\.complete" r
  IfErrors extractRuntime
  FileRead $R8 $R7
  FileClose $R8
  StrCmp $R7 "${key}" +2
  Goto extractRuntime
  !insertmacro verifyRuntime extractRuntime cached
  Goto runtimeReady
extractRuntime:
  IfFileExists "$INSTDIR\\." 0 freshRuntime
  # An exclusive lease prevents repairing a runtime that another launcher uses.
  System::Call 'kernel32::CreateFileW(w "$INSTDIR\\.in-use", i 0xC0000000, i 0, p 0, i 4, i 0x80, p 0) p.s'
  Pop $R8
  StrCmp $R8 -1 isolatedRuntime
  System::Call 'kernel32::CloseHandle(p $R8)'
  IfFileExists "$INSTDIR\\\${APP_EXECUTABLE_FILENAME}" 0 renameRuntime
  System::Call 'kernel32::CreateFileW(w "$INSTDIR\\\${APP_EXECUTABLE_FILENAME}", i 0xC0000000, i 0, p 0, i 3, i 0x80, p 0) p.s'
  Pop $R8
  StrCmp $R8 -1 isolatedRuntime
  System::Call 'kernel32::CloseHandle(p $R8)'
renameRuntime:
  IfFileExists "$INSTDIR.bad\\." isolatedRuntime
  ClearErrors
  Rename "$INSTDIR" "$INSTDIR.bad"
  IfErrors isolatedRuntime
  Goto freshRuntime
isolatedRuntime:
  # Leave an active, locked, or redirected cache alone and use private temp files.
  StrCpy $INSTDIR "$PLUGINSDIR\\app"
freshRuntime:`);
    replaceOnce('  RMDir /r $INSTDIR\n  SetOutPath $INSTDIR', '  ClearErrors\n  SetOutPath $INSTDIR');
    replaceOnce("  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i (\"PORTABLE_EXECUTABLE_DIR\"", `  IfErrors extractionFailed
  !insertmacro verifyRuntime extractionFailed extracted
  FileOpen $R8 "$INSTDIR\\.complete" w
  IfErrors extractionFailed
  FileWrite $R8 "${key}"
  FileClose $R8
  IfErrors extractionFailed
  Goto runtimeReady
extractionFailed:
  Delete "$INSTDIR\\.complete"
leaseFailed:
  System::Call 'kernel32::ReleaseMutex(p $cacheMutex)'
  System::Call 'kernel32::CloseHandle(p $cacheMutex)'
cacheFailed:
  Abort
runtimeReady:
  System::Call 'kernel32::CreateFileW(w "$INSTDIR\\.in-use", i 0xC0000000, i 3, p 0, i 4, i 0x80, p 0) p.s'
  Pop $runtimeLease
  StrCmp $runtimeLease -1 leaseFailed
  System::Call 'kernel32::ReleaseMutex(p $cacheMutex)'
  System::Call 'kernel32::CloseHandle(p $cacheMutex)'

  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("PORTABLE_EXECUTABLE_DIR"`);
    replaceOnce('\tRMDir /r $INSTDIR\nSectionEnd', "  System::Call 'kernel32::CloseHandle(p $runtimeLease)'\n  # Keep the runtime for the next preview, settings, or saver launch.\nSectionEnd");
    return script;
}

function createScrPackager(info) {
    // electron-builder is pinned; keep its signing and packaging pipeline and
    // override only the portable launch script through its packager factory.
    const {WinPackager} = require('app-builder-lib/out/winPackager');
    const {NsisTarget} = require('app-builder-lib/out/targets/nsis/NsisTarget');
    const {AppPackageHelper, CopyElevateHelper} = require('app-builder-lib/out/targets/nsis/nsisUtil');
    class ScrTarget extends NsisTarget {
        async computeFinalScript(original, isInstaller, architectures) {
            if (architectures.size !== 1) {
                throw new Error('Build each SCR architecture separately.');
            }
            const {key, files} = await runtimeManifest(architectures.values().next().value);
            return super.computeFinalScript(cachedPortableScript(original, key, files), isInstaller, architectures);
        }
    }
    class ScrPackager extends WinPackager {
        createTargets(targets, mapper) {
            if (targets.some(target => target !== 'portable')) {
                throw new Error('The SCR packager supports only the portable target.');
            }
            const helper = new AppPackageHelper(new CopyElevateHelper());
            mapper('portable', outDir => new ScrTarget(this, outDir, 'portable', helper));
        }
    }
    return new ScrPackager(info);
}

module.exports = {runtimeKey, runtimeManifest, cachedPortableScript, createScrPackager};
