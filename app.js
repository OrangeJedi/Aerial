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
    let displays = screen.getAllDisplays();
    for (let i = 0; i < screen.getAllDisplays().length; i++) {
        let xWin = new BrowserWindow({
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
        xWin.setMenu(null);
        xWin.loadFile('web/screensaver.html');
        xWin.on('closed', function () {
            xWin = null;
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