const {app, BrowserWindow, ipcMain, screen} = require('electron');

function createConfigWindow() {
    let win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true
        }
    });
    win.loadFile('web/config.html');
    win.on('closed', function () {
        win = null;
    });
}

function createSSWindow() {
    // Create the browser window.
    const {width, height} = screen.getPrimaryDisplay().workAreaSize;
    let win = new BrowserWindow({
        width: width,
        height: height,
        webPreferences: {
            nodeIntegration: true
        },
        x: 0,
        y: 0,
        fullscreen: true
    });
    win.setMenu(null);
    win.loadFile('web/screensaver.html');
    win.on('closed', function () {
        win = null;
    });
}

function createSSPWindow() {
    let win = new BrowserWindow({
        width: 1200,
        height: 720,
        webPreferences: {
            nodeIntegration: true
        }
    });
    win.loadFile('web/screensaver.html');
    win.on('closed', function () {
        win = null;
    });
}

app.whenReady().then(startUp);

function startUp() {
    if (process.argv.includes("/s")) {
        createSSWindow();
    } else if (process.argv.includes("/p")) {
        createSSPWindow();
    } else if (process.argv.includes("/c")) {
        createConfigWindow();
    } else {
        app.quit();
    }
}


ipcMain.on('quitApp', (event, arg) => {
    app.quit();
});