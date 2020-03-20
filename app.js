const {app, BrowserWindow, ipcMain, screen} = require('electron');
const videos = require("./videos.json");
const Store = require('electron-store');
const store = new Store();
let screens = [];

global.shared = {
    currentlyPlaying: ''
};

function createConfigWindow() {
    let win = new BrowserWindow({
        width: 1000,
        height: 750,
        webPreferences: {
            nodeIntegration: true
        }
    });
    win.loadFile('web/config.html');
    win.on('closed', function () {
        win = null;
    });
}

function createJSONConfigWindow() {
    let win = new BrowserWindow({
        width: 1920,
        height: 1080,
        webPreferences: {
            nodeIntegration: true
        }
    });
    win.loadFile('json-editor/index.html');
    win.on('closed', function () {
        win = null;
    });
}

function createSSWindow() {
    let displays = screen.getAllDisplays();
    for (let i = 0; i < screen.getAllDisplays().length; i++) {
        let win = new BrowserWindow({
            width: displays[i].size.width,
            height: displays[i].size.height,
            webPreferences: {
                nodeIntegration: true
            },
            x: displays[i].bounds.x,
            y: displays[i].bounds.y,
            fullscreen: true,
            transparent: true,
            frame: false
        });
        win.setMenu(null);
        win.loadFile('web/screensaver.html');
        win.on('closed', function () {
            xWin = null;
        });
        win.webContents.on('dom-ready', (event) => {
            let css = '* { cursor: none !important; }';
            win.webContents.insertCSS(css);
        });
        screens.push(win);
    }
}

function createSSPWindow() {
    let win = new BrowserWindow({
        width: 1280,
        height: 720,
        webPreferences: {
            nodeIntegration: true
        },
        transparent: true,
        frame: false
    });
    win.loadFile('web/screensaver.html');
    win.on('closed', function () {
        win = null;
    });
}

app.whenReady().then(startUp);

function startUp() {
    if (!store.get("configured")) {
        let allowedVideos = [];
        for (let i = 0; i < videos.length; i++) {
            allowedVideos.push(videos[i].id);
        }
        store.set('allowedVideos', allowedVideos);
        store.set('clock', false);
        store.set('timeOfDay', false);
        store.set('sunrise', "06:00");
        store.set('sunset', "18:00");
        store.set('playbackSpeed', 1);
        store.set('skipVideosWithKey', true);
        store.set("configured", true);
        store.set('videoFilters', [
            {name: 'blur', value: 0, min: 0, max: 100, suffix: "px", defaultValue: 0},
            {name: 'brightness', value: 100, min: 0, max: 100, suffix: "%", defaultValue: 100},
            {name: 'grayscale', value: 0, min: 0, max: 100, suffix: "%", defaultValue: 0},
            {name: 'hue-rotate', value: 0, min: 0, max: 360, suffix: "deg", defaultValue: 0},
            {name: 'invert', value: 0, min: 0, max: 100, suffix: "%", defaultValue: 0},
            {name: 'saturate', value: 100, min: 0, max: 256, suffix: "%", defaultValue: 100},
            {name: 'sepia', value: 0, min: 0, max: 100, suffix: "%", defaultValue: 0},
        ]);
        store.set('sameVideoOnScreens', false);
        store.set('timeString', "dddd, MMMM Do YYYY, h:mm:ss a");
        store.set('textFont', "Segoe UI");
        store.set('textSize', "2");
        store.set('displayText', {
            'positionList': ["topleft", "topright", "bottomleft", "bottomright", "left", "right", "middle", "topmiddle", "bottommiddle"],
            'topleft': {'type': "none"},
            'topright': {'type': "none"},
            'bottomleft': {'type': "none"},
            'bottomright': {'type': "none"},
            'left': {'type': "none"},
            'right': {'type': "none"},
            'middle': {'type': "none"},
            'topmiddle': {'type': "none"},
            'bottommiddle': {'type': "none"}})
    }
    if (process.argv.includes("/c")) {
        createConfigWindow();
    } else if (process.argv.includes("/p")) {
        //createSSPWindow();
        app.quit();
    } else if (process.argv.includes("/s")) {
        createSSWindow();
    } else if (process.argv.includes("/t")) {
        createSSPWindow();
    } else if (process.argv.includes("/j")) {
        createJSONConfigWindow();
    } else {
        createConfigWindow();
    }
}

ipcMain.on('quitApp', (event, arg) => {
    app.quit();
});

ipcMain.on('keyPress', (event, key) => {
    if (key === "ArrowRight" && store.get('skipVideosWithKey')) {
        for (let i = 0; i < screens.length; i++) {
            screens[i].webContents.send('newVideo');
        }
    } else {
        app.quit();
    }
});