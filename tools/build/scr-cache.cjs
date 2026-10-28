const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

async function runtimeKey(directory) {
    const hash = createHash('sha256');
    async function visit(relative = '') {
        const entries = await fs.promises.readdir(path.join(directory, relative), {withFileTypes: true});
        entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
        for (const entry of entries) {
            const name = path.join(relative, entry.name);
            if (entry.isDirectory()) {
                await visit(name);
            } else {
                hash.update(name.replaceAll('\\', '/')).update('\0');
                for await (const chunk of fs.createReadStream(path.join(directory, name))) {
                    hash.update(chunk);
                }
                hash.update('\0');
            }
        }
    }
    await visit();
    return hash.digest('hex');
}

function cachedPortableScript(template, key) {
    if (!/^[a-f0-9]{64}$/.test(key)) {
        throw new Error('Invalid SCR runtime cache key');
    }
    let script = template.replace(/\r\n/g, '\n');
    function replaceOnce(before, after) {
        if (!script.includes(before) || script.indexOf(before) !== script.lastIndexOf(before)) {
            throw new Error('The electron-builder portable template changed; review the SCR cache integration.');
        }
        script = script.replace(before, after);
    }
    replaceOnce('Section\n', 'Var cacheMutex\n\nSection\n');
    replaceOnce('  StrCpy $INSTDIR "$PLUGINSDIR\\app"\n  !ifdef UNPACK_DIR_NAME\n    StrCpy $INSTDIR "$TEMP\\${UNPACK_DIR_NAME}"\n  !endif', `  SetShellVarContext current
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
  IfFileExists "$INSTDIR\\.complete" 0 extractRuntime
  IfFileExists "$INSTDIR\\\${APP_EXECUTABLE_FILENAME}" 0 extractRuntime
  IfFileExists "$INSTDIR\\resources\\app.asar" 0 extractRuntime
  Goto runtimeReady
extractRuntime:`);
    replaceOnce('  RMDir /r $INSTDIR\n  SetOutPath $INSTDIR', '  RMDir /r $INSTDIR\n  ClearErrors\n  SetOutPath $INSTDIR');
    replaceOnce("  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i (\"PORTABLE_EXECUTABLE_DIR\"", `  IfErrors extractionFailed
  FileOpen $R8 "$INSTDIR\\.complete" w
  IfErrors extractionFailed
  FileWrite $R8 "${key}"
  FileClose $R8
  IfErrors extractionFailed
  Goto runtimeReady
extractionFailed:
  Delete "$INSTDIR\\.complete"
  System::Call 'kernel32::ReleaseMutex(p $cacheMutex)'
  System::Call 'kernel32::CloseHandle(p $cacheMutex)'
cacheFailed:
  Abort
runtimeReady:
  System::Call 'kernel32::ReleaseMutex(p $cacheMutex)'
  System::Call 'kernel32::CloseHandle(p $cacheMutex)'

  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("PORTABLE_EXECUTABLE_DIR"`);
    replaceOnce('\tRMDir /r $INSTDIR\nSectionEnd', '  # Keep the runtime for the next preview, settings, or saver launch.\nSectionEnd');
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
            const key = await runtimeKey(architectures.values().next().value);
            return super.computeFinalScript(cachedPortableScript(original, key), isInstaller, architectures);
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

module.exports = {runtimeKey, cachedPortableScript, createScrPackager};
