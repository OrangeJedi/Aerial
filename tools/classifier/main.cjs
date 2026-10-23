const {app, BrowserWindow, ipcMain} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const {readCatalog, saveTag} = require('./catalog.cjs');
const {createFrameQueue} = require('./frame-queue.cjs');
const root = path.resolve(__dirname, '../..');
const catalog = path.join(root, 'videos.json');
const frames = path.join(root, '.classifier-frames');
const children = new Set();
const frameQueue = createFrameQueue(loadFrame);
let closing = false;

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.whenReady().then(() => {
        fs.mkdirSync(frames, {recursive: true});
        ipcMain.handle('classifier:list', () => readCatalog(catalog));
        ipcMain.handle('classifier:save', (_event, id, tag) => saveTag(catalog, id, tag));
        ipcMain.handle('classifier:frame', (_event, id, background) => frameQueue.request(id, background));
        const window = new BrowserWindow({
            width: 1200, height: 900, minWidth: 720, minHeight: 650,
            backgroundColor: '#13181e',
            webPreferences: {preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false}
        });
        window.setMenu(null);
        window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
        window.loadFile(path.join(__dirname, 'index.html'));
    });
}

async function loadFrame(id) {
    const video = readCatalog(catalog).find(item => item.id === id);
    if (!video) {
        throw new Error('Unknown video');
    }
    const target = path.join(frames, encodeURIComponent(video.id) + '.jpg');
    if (fs.existsSync(target)) {
        return pathToFileURL(target).href;
    }
    const sources = [...new Set(Object.values(video.src || {}).filter(Boolean))];
    if (video.src?.H2641080p) {
        sources.unshift(video.src.H2641080p);
    }
    let lastError = 'No video sources available';
    for (const source of [...new Set(sources)]) {
        try {
            await extractFrame(source, target);
            return pathToFileURL(target).href;
        } catch (error) {
            lastError = error.message;
        }
    }
    throw new Error(lastError);
}

function extractFrame(source, target) {
    if (closing) {
        return Promise.reject(new Error('Classifier is closing'));
    }
    return new Promise((resolve, reject) => {
        const temporary = target + '.tmp.jpg';
        const child = spawn(require('ffmpeg-static'), [
            '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
            '-rw_timeout', '20000000', '-i', source, '-frames:v', '1',
            '-vf', 'scale=1280:-2', '-q:v', '3', temporary
        ], {windowsHide: true});
        children.add(child);
        let errors = '';
        const timer = setTimeout(() => child.kill(), 60000);
        child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-2000); });
        child.once('error', reject);
        child.once('close', code => {
            clearTimeout(timer);
            children.delete(child);
            if (code === 0 && fs.existsSync(temporary)) {
                fs.renameSync(temporary, target);
                resolve();
            } else {
                fs.rmSync(temporary, {force: true});
                reject(new Error(errors || 'Frame extraction failed or timed out. Retry or skip this video.'));
            }
        });
    });
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
    closing = true;
    frameQueue.stop();
    for (const child of children) {
        child.kill();
    }
});
