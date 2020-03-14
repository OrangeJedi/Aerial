const {app, BrowserWindow, ipcMain, screen} = require('electron');
const videos = require("./videos.json");
const Store = require('electron-store');
const store = new Store();

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
        win.webContents.on('dom-ready', (event)=> {
            let css = '* { cursor: none !important; }';
            win.webContents.insertCSS(css);
        });
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
    if(!store.get("configured")){
        let allowedVideos = [];
        for(let i = 0; i < videos.length;i++){
            allowedVideos.push(videos[i].id);
        }
        store.set('allowedVideos', allowedVideos);
        store.set('clock', false);
        store.set("configured", true);
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
    } else if(process.argv.includes("/j")){
        createJSONConfigWindow();
    } else {
        createConfigWindow();
    }
}


ipcMain.on('quitApp', (event, arg) => {
    app.quit();
});