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
        fullscreen: true,
        backgroundColor: "#000000"
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
        },
        backgroundColor: "#000000"
    });
    win.loadFile('web/screensaver.html');
    win.on('closed', function () {
        win = null;
    });
}

app.whenReady().then(startUp);

function startUp() {
    if (process.argv.includes("/c")) {
        createConfigWindow();
    } else if (process.argv.includes("/p")) {
        //createSSPWindow();
        app.quit();
    } else if (process.argv.includes("/s")) {
        createSSWindow();
    } else if (process.argv.includes("/t")) {
        createSSPWindow();
    } else {
        createConfigWindow();
    }
}


ipcMain.on('quitApp', (event, arg) => {
    app.quit();
});