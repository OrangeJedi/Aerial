const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function parsePreviewArguments(argv) {
    const index = argv.findIndex(argument => /^\/p(?::|$)/i.test(argument));
    if (index === -1) {
        return {requested: false};
    }
    const value = argv[index].includes(':') ? argv[index].slice(3) : argv[index + 1];
    if (typeof value !== 'string' || !/^(?:[1-9]\d*|0x[0-9a-f]+)$/i.test(value)) {
        return {requested: true, handle: null};
    }
    const handle = BigInt(value);
    return {requested: true, handle: handle > 0n && handle <= 0x7fffffffffffffffn ? handle.toString() : null};
}

function startWindowsPreview({BrowserWindow, app, parentHandle, onWindow = () => {}, run = spawn, logger = console}) {
    if (process.platform !== 'win32' || !parentHandle) {
        app.quit();
        return;
    }
    const win = new BrowserWindow({
        width: 320,
        height: 180,
        frame: false,
        thickFrame: false,
        focusable: false,
        resizable: false,
        skipTaskbar: true,
        show: false,
        backgroundColor: '#000000',
        webPreferences: {
            backgroundThrottling: false,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            preload: path.join(__dirname, 'preload.mjs'),
            additionalArguments: ['--aerial-embedded-preview']
        }
    });
    onWindow(win);
    let helper;
    let finished = false;
    let startupTimer;
    function finish(error) {
        if (finished) {
            return;
        }
        finished = true;
        clearTimeout(startupTimer);
        if (error) {
            logger.error('Unable to display Windows screensaver preview', error);
        }
        helper?.kill();
        if (!win.isDestroyed()) {
            win.destroy();
        }
        app.quit();
    }
    win.on('closed', () => finish());
    win.webContents.on('render-process-gone', () => finish(new Error('Preview renderer stopped')));
    startupTimer = setTimeout(() => finish(new Error('Preview startup timed out')), 30000);
    win.once('ready-to-show', () => {
        if (finished) {
            return;
        }
        try {
            win.webContents.send('screenNumber', 0);
            const nativeHandle = win.getNativeWindowHandle();
            const childHandle = nativeHandle.length === 8 ? nativeHandle.readBigUInt64LE() : BigInt(nativeHandle.readUInt32LE());
            const script = fs.readFileSync(path.join(__dirname, 'windows-preview.ps1'), 'utf8');
            // Both handles are validated integers, never shell-supplied expressions.
            const command = `& {\n${script}\n} -ParentHandle ${parentHandle} -ChildHandle ${childHandle}`;
            const executable = path.win32.join(process.env.SystemRoot || 'C:\\Windows',
                'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
            helper = run(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
                Buffer.from(command, 'utf16le').toString('base64')], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
            let output = '';
            let errors = '';
            let shown = false;
            helper.stdout.on('data', chunk => {
                output = (output + chunk).slice(-1024);
                if (!shown && output.includes('READY')) {
                    shown = true;
                    clearTimeout(startupTimer);
                    // Native ShowWindow alone does not make Chromium present its surface.
                    win.showInactive();
                }
            });
            helper.stderr.on('data', chunk => { errors = (errors + chunk).slice(-4096); });
            helper.on('error', finish);
            helper.on('exit', code => finish(code ? new Error(errors || `Preview helper exited (${code})`) : undefined));
        } catch (error) {
            finish(error);
        }
    });
    win.loadFile(path.join(__dirname, '..', 'web', 'screensaver.html')).catch(finish);
    return win;
}

module.exports = {parsePreviewArguments, startWindowsPreview};
