//load libraries
const {
    app,
    BrowserWindow,
    ipcMain,
    screen,
    shell,
    dialog,
    Tray,
    Menu,
    powerMonitor,
    Notification,
    globalShortcut
} = require('electron');
const {exec} = require('child_process');
const videos = require("./videos.json");
const Store = require('electron-store');
const store = new Store();
const request = require('request');
const https = require('https');
const fs = require('fs');
const path = require("path");
const AutoLaunch = require('auto-launch');
let autoLauncher = new AutoLaunch({
    name: 'Aerial',
});
const SunCalc = require('suncalc');

//initialize variables
let screens = [];
let screenIds = [];
let nq = false;
let cachePath = store.get('cachePath') ?? path.join(app.getPath('userData'), "videos");
let downloading = false;
let allowedVideos = store.get("allowedVideos");
let previouslyPlayed = [];
let currentlyPlaying = '';
let preview = false;
let suspend = false;
let suspendCountdown;
let isComputerSleeping = false;
let isComputerSuspendedOrLocked = false;
let tod = {"day": [], "night": [], "none": []};
let astronomy = {
    "sunrise": undefined,
    "sunset": undefined,
    "moonrise": undefined,
    "moonset": undefined,
    "calculated": false
};

//window creation code
function createConfigWindow(argv) {
    let win = new BrowserWindow({
        width: 1000,
        height: 750,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: false,
            preload: path.join(__dirname, "preload.js")
        },
        resizable: false,
        icon: path.join(__dirname, 'icon.ico')
    });
    win.loadFile('web/config.html');
    win.on('closed', function () {
        win = null;
        screens = [];
    });
    if (argv) {
        if (argv.includes("/dt")) {
            win.webContents.openDevTools();
        }
    }
    if (argv) {
        if (argv.includes("/w")) {
            setTimeout(() => {
                win.webContents.send('showWelcome')
            }, 1500);
        }
    }
    win.webContents.setWindowOpenHandler(({url}) => {
        shell.openExternal(url);
        return {action: 'deny'};
    });
    screens.push(win);
}

function createSSWindow(argv) {
    switch (argv) {
        case undefined:
            break
        default: {
            if (!argv.includes("/nq")) {
                nq = false;
            }
        }
    }
    allowedVideos = store.get("allowedVideos");
    calculateAstronomy();
    previouslyPlayed = [];
    let displays = screen.getAllDisplays();
    for (let i = 0; i < screen.getAllDisplays().length; i++) {
        let win = new BrowserWindow({
            width: displays[i].size.width,
            height: displays[i].size.height,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                sandbox: false,
                preload: path.join(__dirname, "preload.js")
            },
            x: displays[i].bounds.x,
            y: displays[i].bounds.y,
            //sets the screensaver to run as windows if the 'no-quit' mode had been set
            fullscreen: !nq,
            transparent: true,
            frame: nq,
            icon: path.join(__dirname, 'icon.ico')
        })

        if (store.get("onlyShowVideoOnPrimaryMonitor") && displays[i].id !== screen.getPrimaryDisplay().id) {
            win.loadFile('web/black.html');
        } else {
            win.loadFile('web/screensaver.html');
        }
        win.on('closed', function () {
            win = null;
        });
        if (!nq) {
            win.setMenu(null);
            win.setAlwaysOnTop(true, "screen-saver");
        } else {
            win.frame = true;
        }
        screens.push(win);
        screenIds.push(displays[i].id)
    }
    //find the screen the cursor is on and focus it so the cursor will hide
    let mainScreen = screens[screenIds.indexOf(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id)];
    if (mainScreen) {
        if (!mainScreen.isDestroyed()) {
            mainScreen.focus();
        }
    }
}

function createSSPWindow(argv) {
    nq = true;
    allowedVideos = store.get("allowedVideos");
    previouslyPlayed = [];
    let displays = screen.getAllDisplays();
    let win = new BrowserWindow({
        width: 1280,
        height: 720,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: false,
            preload: path.join(__dirname, "preload.js"),
        },
        frame: true,
        transparent: true,
        icon: path.join(__dirname, 'icon.ico')
    });
    win.loadFile('web/screensaver.html');
    win.on('closed', function () {
        screens.pop(screens.indexOf(win));
        nq = false;
        win = null;
        preview = false;
    });
    if (argv) {
        if (argv.includes("/dt")) {
            win.webContents.openDevTools();

        }
    }
    screens.push(win);
    preview = true;
}

function createEditWindow(argv) {
    let win = new BrowserWindow({
        width: 1000,
        height: 750,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: false,
            preload: path.join(__dirname, "preload.js")
        },
        icon: path.join(__dirname, 'icon.ico')
    });
    win.loadFile('web/video-info.html');
    win.on('closed', function () {
        win = null;
    });
    if (argv) {
        if (argv.includes("/dt")) {
            win.webContents.openDevTools();
        }
    }
    win.webContents.setWindowOpenHandler(({url}) => {
        shell.openExternal(url);
        return {action: 'deny'};
    });
    screens.push(win);
}

function createTrayWindow() {
    let trayWin = new BrowserWindow({
        width: 800, height: 600, center: true, minimizable: false, show: false,
        webPreferences: {
            nodeIntegration: false,
            webSecurity: true,
            sandbox: true,
        },
        icon: path.join(__dirname, 'icon.ico')
    });
    //trayWin.loadURL("https://google.com/");
    trayWin.on("close", ev => {
        //console.log(ev);
        ev.sender.hide();
        //ev.preventDefault(); // prevent quit process
    });

    function newMenu(isSuspendChecked) {
        return Menu.buildFromTemplate([
            {
                label: "Open Config", click: (item, window, event) => {
                    createConfigWindow();
                }
            },
            {type: "separator"},
            {
                label: "Start Aerial", click: (item, window, event) => {
                    createSSWindow();
                }
            },
            {
                label: 'Suspend Aerial',
                type: "checkbox",
                checked: isSuspendChecked,
                click: (e) => {
                    suspend = e.checked;
                    clearTimeout(suspendCountdown);
                }
            },
            {
                label: 'Suspend for 1 hour',
                click: (e) => {
                    suspend = true;
                    clearTimeout(suspendCountdown);
                    trayWin.tray.setContextMenu(newMenu(true));
                    suspendCountdown = setTimeout(() => {
                        suspend = false
                    }, (1000 * 60) + (store.get('startAfter') * 60));
                }
            },
            {
                label: 'Suspend for 3 hours',
                click: (e) => {
                    suspend = true;
                    clearTimeout(suspendCountdown);
                    suspendCountdown = setTimeout(() => {
                        suspend = false
                    }, (1000 * 60 * 3) + (store.get('startAfter') * 60));
                }
            },
            {type: "separator"},
            {
                label: "Exit Aerial", click: (item, window, event) => {
                    app.quit();
                }
            },
        ]);
    }

    trayWin.tray = new Tray(path.join(__dirname, 'icon.ico'));
    trayWin.tray.setContextMenu(newMenu(false));
    trayWin.tray.setToolTip("Aerial");
}

function createJSONConfigWindow() {
    let win = new BrowserWindow({
        width: 1920,
        height: 1080,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: false,
            preload: path.join(__dirname, "json-editor", "preload.js")
        },
        icon: path.join(__dirname, 'icon.ico')
    });
    win.loadFile('json-editor/index.html');
    win.on('closed', function () {
        win = null;
    });
}

//start up code
app.allowRendererProcessReuse = true
app.whenReady().then(startUp);

function startUp() {
    let firstTime = false;
    if (!store.get("configured") || store.get("version") !== app.getVersion()) {
        firstTime = true;
        //make video cache directory
        if (!fs.existsSync(path.join(app.getPath('userData'), "videos"))) {
            fs.mkdirSync(path.join(app.getPath('userData'), "videos"));
        }
        if (!fs.existsSync(path.join(app.getPath('userData'), "videos", "temp"))) {
            fs.mkdirSync(path.join(app.getPath('userData'), "videos", "temp"));
        }
        setUpConfigFile();
    }
    calculateAstronomy();
    checkForUpdate();
    setupGlobalShortcut();
    //configures Aerial to launch on startup
    if (store.get('useTray') && app.isPackaged) {
        autoLauncher.enable();
    } else {
        autoLauncher.disable();
    }
    //prevents quiting the app if wanted
    if (process.argv.includes("/nq")) {
        nq = true;
    }
    clearCacheTemp();
    if (store.get('videoCacheRemoveUnallowed')) {
        removeAllUnallowedVideosInCache();
    }
    removeAllNeverAllowedVideosInCache();
    if (process.argv.includes("/c")) {
        createConfigWindow(process.argv);
    } else if (process.argv.includes("/p")) {
        //createSSPWindow();
        app.quit();
    } else if (process.argv.includes("/s")) {
        createSSWindow(process.argv);
    } else if (process.argv.includes("/t")) {
        createSSPWindow(process.argv);
    } else if (process.argv.includes("/j")) {
        createJSONConfigWindow();
    } else {
        if (store.get('useTray')) {
            createTrayWindow();
            if (firstTime) {
                createConfigWindow(["/w"]);
            }
        } else {
            createConfigWindow();
        }
    }
    setTimeout(downloadVideos, 1500);
}

//loads the config file with the default setting if not set up already
function setUpConfigFile() {
    //update video info
    if (!store.get('allowedVideos')) {
        let allowedVideos = [];
        for (let i = 0; i < videos.length; i++) {
            allowedVideos.push(videos[i].id);
        }
        store.set('allowedVideos', allowedVideos);
    }
    store.set('downloadedVideos', store.get('downloadedVideos') ?? []);
    store.set('alwaysDownloadVideos', store.get('alwaysDownloadVideos') ?? []);
    store.set('neverDownloadVideos', store.get('neverDownloadVideos') ?? []);
    store.set('videoProfiles', store.get('videoProfiles') ?? []);
    store.set('customVideos', store.get('customVideos') ?? []);

    //start up settings
    store.set('useTray', store.get('useTray') ?? true);
    store.set('startAfter', store.get('startAfter') ?? 10);
    store.set('blankScreen', store.get('blankScreen') ?? true);
    store.set('blankAfter', store.get('blankAfter') ?? 30);
    store.set('sleepAfterBlank', store.get('sleepAfterBlank') ?? true);
    store.set('lockAfterRun', store.get('lockAfterRun') ?? false);
    store.set('runOnBattery', store.get('runOnBattery') ?? true);
    store.set('updateAvailable', false);
    store.set('enableGlobalShortcut', store.get('enableGlobalShortcut') ?? true);
    store.set('globalShortcutModifier', store.get('globalShortcutModifier') ?? "Super+Control");
    store.set('globalShortcutKey', store.get('globalShortcutKey') ?? "A");
    //playback settings
    store.set('playbackSpeed', store.get('playbackSpeed') ?? 1);
    store.set('skipVideosWithKey', store.get('skipVideosWithKey') ?? true);
    store.set('skipKey', store.get('skipKey') ?? "ArrowRight");
    store.set('avoidDuplicateVideos', store.get('avoidDuplicateVideos') ?? true);
    store.set('videoFilters', store.get('videoFilters') ?? [{
        name: 'blur',
        value: 0,
        min: 0,
        max: 100,
        suffix: "px",
        defaultValue: 0
    }, {name: 'brightness', value: 100, min: 0, max: 100, suffix: "%", defaultValue: 100}, {
        name: 'grayscale',
        value: 0,
        min: 0,
        max: 100,
        suffix: "%",
        defaultValue: 0
    }, {name: 'hue-rotate', value: 0, min: 0, max: 360, suffix: "deg", defaultValue: 0}, {
        name: 'invert',
        value: 0,
        min: 0,
        max: 100,
        suffix: "%",
        defaultValue: 0
    }, {name: 'saturate', value: 100, min: 0, max: 256, suffix: "%", defaultValue: 100}, {
        name: 'sepia',
        value: 0,
        min: 0,
        max: 100,
        suffix: "%",
        defaultValue: 0
    },]);
    store.set('alternateRenderMethod', store.get("alternateRenderMethod") ?? false);
    store.set('transitionType', store.get("transitionType") ?? "dissolve");
    store.set('videoTransitionLength', store.get('videoTransitionLength') ?? 2000);
    store.set('fillMode', store.get('fillMode') ?? "stretch");
    //1.2.0 changes the default transition length because of internal changes
    if (store.get('videoTransitionLength') === 1000) {
        store.set('videoTransitionLength', 2000);
    }
    //time & location settings
    store.set('timeOfDay', store.get('timeOfDay') ?? false);
    store.set('sunrise', store.get('sunrise') ?? "06:00");
    store.set('sunset', store.get('sunset') ?? "18:00");
    store.set('useLocationForSunrise', store.get('useLocationForSunrise') ?? false);
    store.set('latitude', store.get('latitude') ?? "");
    store.set('longitude', store.get('longitude') ?? "");
    store.set('astronomy', store.get('astronomy') ?? astronomy)
    //multiscreen settings
    store.set('sameVideoOnScreens', store.get('sameVideoOnScreens') ?? false);
    store.set('onlyShowVideoOnPrimaryMonitor', store.get('onlyShowVideoOnPrimaryMonitor') ?? false);
    //cache settings
    store.set('videoCache', store.get('videoCache') ?? false);
    store.set('videoCacheProfiles', store.get('videoCacheProfiles') ?? false);
    store.set('videoCacheSize', getCacheSize());
    store.set('videoCacheRemoveUnallowed', store.get('videoCacheRemoveUnallowed') ?? false);
    store.set('cachePath', store.get('cachePath') ?? cachePath);
    store.set('immediatelyUpdateVideoCache', store.get('immediatelyUpdateVideoCache') ?? true);
    //check for downloaded videos
    updateVideoCache();
    //text settings
    store.set('textFont', store.get('textFont') ?? "Segoe UI");
    store.set('textSize', store.get('textSize') ?? "2");
    store.set('textColor', store.get('textColor') ?? "#FFFFFF");
    let displayText = store.get('displayText');
    if (displayText) {
        if (!displayText.topleft[0]) {
            displayText = undefined;
        }
    }
    if (!displayText) {
        displayText = {
            'positionList': ["topleft", "topright", "bottomleft", "bottomright", "left", "right", "middle", "topmiddle", "bottommiddle", "random"]
        };
        let temp = [];
        for (let i = 0; i < 4; i++) {
            temp.push({'type': "none", "defaultFont": true});
        }
        displayText.positionList.forEach((v) => {
            displayText[v] = temp;
        });
        store.set('displayText', displayText);
    }
    store.set('randomSpeed', store.get('randomSpeed') ?? 30);
    store.set('videoQuality', store.get('videoQuality') ?? false);
    store.set('fps', store.get('fps') ?? 60);

    //config
    store.set('version', app.getVersion());
    store.set("configured", true);
}

//setUpConfigFile();

//check for update on GitHub
function checkForUpdate() {
    request('https://raw.githubusercontent.com/OrangeJedi/Aerial/master/package.json', function (error, response, body) {
        if (error) {
            console.log("Error checking for updates: ", error);
            return;
        }
        store.set('updateAvailable', false);
        const onlinePackage = JSON.parse(body);
        if (onlinePackage.version && app.isPackaged) {
            if (onlinePackage.version[0] > app.getVersion()[0] || onlinePackage.version[2] > app.getVersion()[2] || onlinePackage.version[4] > app.getVersion()[4]) {
                store.set('updateAvailable', onlinePackage.version);
                new Notification({
                    title: "An update for Aerial is available",
                    body: `Version ${onlinePackage.version} is available for download. Visit https://github.com/OrangeJedi/Aerial/releases to update Aerial.`
                }).show()
            }
        }
    });
}

//events from browser windows
ipcMain.on('quitApp', (event, arg) => {
    quitApp();
});

ipcMain.on('keyPress', (event, key) => {
    if (key === store.get('skipKey') && store.get('skipVideosWithKey')) {
        for (let i = 0; i < screens.length; i++) {
            screens[i].webContents.send('newVideo');
        }
    } else {
        quitApp();
    }
});

ipcMain.on('updateCache', (event) => {
    const path = cachePath;
    let videoList = [];
    fs.readdir(path, (err, files) => {
        files.forEach(file => {
            if (file.includes('.mov')) {
                videoList.push(file.slice(0, file.length - 4));
            }
        });
        if (!downloading) {
            store.set('downloadedVideos', videoList);
        }
        store.set('videoCacheSize', getCacheSize());
        event.reply('displaySettings');
    });
    updateCustomVideos();
});

ipcMain.on('deleteCache', (event) => {
    removeAllVideosInCache();
    event.reply('displaySettings');
});

ipcMain.on('openCache', (event) => {
    shell.openExternal(cachePath);
});

ipcMain.on('openConfigFolder', (event) => {
    shell.openExternal(app.getPath('userData'));
});

ipcMain.on('selectCustomLocation', async (event, arg) => {
    const result = await dialog.showOpenDialog(screens[0], {
        properties: ['openDirectory']
    });
    const path = result.filePaths[0];
    let videoList = [];
    videoList.path = path;
    fs.readdir(path, (err, files) => {
        files.forEach(file => {
            if (file.includes('.mp4') || file.includes('.webm') || file.includes('.ogv')) {
                videoList.push(file);
            }
        });
        event.reply('newCustomVideos', videoList, path);
    });
    //event.reply('filePath', result.filePaths);
});

ipcMain.on('selectCacheLocation', async (event, arg) => {
    const result = await dialog.showOpenDialog(screens[0], {
        properties: ['openDirectory']
    });
    const newPath = result.filePaths[0];
    //removeAllVideosInCache();
    if (newPath != undefined) {
        cachePath = newPath;
        store.set('cachePath', newPath);
        fs.mkdirSync(path.join(store.get('cachePath'), "temp"));
        updateVideoCache(() => {
            event.reply('displaySettings');
        });
    }
});

ipcMain.on('refreshCache', (event) => {
    if (store.get('immediatelyUpdateVideoCache')) {
        if (!downloading) {
            downloadVideos();
        }
        if (store.get('videoCacheRemoveUnallowed')) {
            removeAllUnallowedVideosInCache();
            removeAllNeverAllowedVideosInCache();
        }
    }
});

ipcMain.on('selectFile', async (event, args) => {
    let type = args[0];
    let position = args[1];
    let line = args[2];
    const filters = {
        'image': {name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'gif']}
    };
    dialog.showOpenDialog(screens[0], {
        properties: ['openFile'],
        filters: [filters[type]]
    }).then(result => {
        if (!result.canceled) {
            let displayText = store.get('displayText');
            displayText[position][line].imagePath = result.filePaths[0];
            store.set('displayText', displayText);
            event.reply('updateAttribute', ['imageFileName', result.filePaths[0]]);
        }
    });
});

ipcMain.on('openPreview', (event) => {
    createSSPWindow(process.argv);
});

ipcMain.on('openInfoEditor', (event) => {
    createEditWindow(process.argv);
});

ipcMain.on('refreshConfig', (event) => {
    setUpConfigFile();
    closeAllWindows();
    createConfigWindow();
});

ipcMain.on('resetConfig', (event) => {
    fs.unlink(`${app.getPath('userData')}/config.json`, err => {
    });
    setUpConfigFile();
    closeAllWindows();
    createConfigWindow();
    //app.quit();
});

ipcMain.on('updateLocation', (event) => {
    calculateAstronomy();
    if (astronomy.calculated) {
        store.set('sunrise', (astronomy.sunrise.getHours() < 10 ? '0' : "") + astronomy.sunrise.getHours() + ':' + (astronomy.sunrise.getMinutes() < 10 ? '0' : "") + astronomy.sunrise.getMinutes());
        store.set('sunset', (astronomy.sunset.getHours() < 10 ? '0' : "") + astronomy.sunset.getHours() + ':' + (astronomy.sunset.getMinutes() < 10 ? '0' : "") + astronomy.sunset.getMinutes());
        event.reply('displaySettings');
    }
});

ipcMain.handle('newVideoId', (event, lastPlayed) => {
    if (currentlyPlaying === '') {
        onFirstVideoPlayed();
    }

    function newId() {
        let id = "";
        if (store.get('timeOfDay')) {
            let time = getTimeOfDay();
            id = tod[time][randomInt(0, tod[time].length)];
        } else {
            id = allowedVideos[randomInt(0, allowedVideos.length)];
        }
        if (store.get('avoidDuplicateVideos') && allowedVideos.length > 6) {
            if (previouslyPlayed.includes(id)) {
                return newId();
            } else {
                previouslyPlayed.push(id);
                if (previouslyPlayed.length > (allowedVideos.length * .3)) {
                    previouslyPlayed.shift();
                }
            }
        }
        return id;
    }

    if (store.get('sameVideoOnScreens')) {
        if (currentlyPlaying !== lastPlayed) {
            return currentlyPlaying
        }
    }
    currentlyPlaying = newId();
    return currentlyPlaying;
})

ipcMain.on('newGlobalShortcut', (event) => {
    setupGlobalShortcut();
});

//events from the system
powerMonitor.on('resume', () => {
    //let Aerial know that the system has been woken up so it can run again
    isComputerSleeping = false;
    isComputerSuspendedOrLocked = false;
    closeAllWindows();
});

powerMonitor.on('suspend', () => {
    isComputerSuspendedOrLocked = true;
    closeAllWindows();
});

powerMonitor.on('lock-screen', () => {
    isComputerSuspendedOrLocked = true;
    closeAllWindows();
});

powerMonitor.on('unlock-screen', () => {
    isComputerSuspendedOrLocked = false;
    closeAllWindows();
});

//let Aerial load the video with Apple's self-signed cert
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    if (url.match(/^https:\/\/sylvan.apple.com/) !== null) {
        event.preventDefault();
        callback(true)
    } else {
        callback(false)
    }
});

function setupGlobalShortcut() {
    globalShortcut.unregisterAll();
    if(store.get("enableGlobalShortcut")){
        globalShortcut.register(`${store.get("globalShortcutModifier")}+${store.get("globalShortcutKey")}`, () => {
            createSSWindow();
        })
    }
}

//video functions
function updateCustomVideos() {
    let allowedVideos = store.get('allowedVideos');
    let customVideos = store.get('customVideos');
    for (let i = 0; i < allowedVideos.length; i++) {
        if (allowedVideos[i][0] === "_") {
            let index = customVideos.findIndex((e) => {
                if (allowedVideos[i] === e.id) {
                    return true;
                }
            });
            if (index === -1) {
                allowedVideos.splice(index, 1);
                i--;
            }
        }
    }
    store.set('allowedVideos', allowedVideos);
}

function downloadFile(file_url, targetPath, callback) {
    // Save variable to know progress
    var received_bytes = 0;
    var total_bytes = 0;

    agentOptions = {
        host: 'sylvan.apple.com', path: '/', rejectUnauthorized: false
    };

    let agent = new https.Agent(agentOptions);

    let req = request({
        method: 'GET', uri: file_url, agent: agent
    });

    let out = fs.createWriteStream(targetPath);
    req.pipe(out);

    req.on('response', function (data) {
        // Change the total bytes value to get progress later.
        total_bytes = parseInt(data.headers['content-length']);
    });

    req.on('data', function (chunk) {
        // Update the received bytes
        received_bytes += chunk.length;

        showProgress(received_bytes, total_bytes);
    });

    req.on('end', function (e) {
        //console.log("File successfully downloaded");
        callback();
    });

    req.on('error', function (err) {
        //console.error(err)
    });

    function showProgress(received, total) {
        let percentage = (received * 100) / total;
        //console.log(percentage + "% | " + received + " bytes out of " + total + " bytes.");
    }
}

function downloadVideos() {
    let allowedVideos = getVideosToDownload();
    let downloadedVideos = store.get('downloadedVideos') ?? [];
    let flag = false;
    for (let i = 0; i < allowedVideos.length; i++) {
        if (!downloadedVideos.includes(allowedVideos[i]) && allowedVideos[i][0] !== "_") {
            let flag = true;
            let index = videos.findIndex((v) => {
                if (allowedVideos[i] === v.id) {
                    return true;
                }
            });
            console.log(allowedVideos[i]);
            //console.log(`Downloading ${videos[index].name}`);
            downloadFile(videos[index].src.H2641080p, `${cachePath}/temp/${allowedVideos[i]}.mov`, () => {
                fs.copyFileSync(`${cachePath}/temp/${allowedVideos[i]}.mov`, `${cachePath}/${allowedVideos[i]}.mov`);
                fs.unlink(`${cachePath}/temp/${allowedVideos[i]}.mov`, (err) => {
                });
                downloadedVideos.push(allowedVideos[i]);
                store.set('downloadedVideos', downloadedVideos);
                store.set('videoCacheSize', getCacheSize());
                downloadVideos();
            });
            break;
        }
    }
    downloading = flag;
}

function getVideosToDownload() {
    let allowedVideos = store.get('videoCache') ? store.get('allowedVideos') : [];
    store.get('alwaysDownloadVideos').forEach(e => {
        allowedVideos.push(e);
    });
    if (store.get("videoCacheProfiles") && store.get('videoCache')) {
        store.get('videoProfiles').forEach(e => {
            allowedVideos.push(...e.videos);
        });
    }
    allowedVideos = allowedVideos.filter(function (item, pos, self) {
        return self.indexOf(item) === pos;
    });
    store.get('neverDownloadVideos').forEach(e => {
        if (allowedVideos.includes(e)) {
            allowedVideos = allowedVideos.splice(allowedVideos.indexOf(e), 1);
        }
    });
    return allowedVideos;
}

//cache functions
function getAllFilesInCache() {
    return fs.readdirSync(cachePath);
}

function getCacheSize() {
    let totalSize = 0;
    getAllFilesInCache().forEach(function (filePath) {
        if (fs.existsSync(`${cachePath}/${filePath}`)) {
            totalSize += fs.statSync(`${cachePath}/${filePath}`).size;
        }
    });
    return totalSize;
}

function removeAllVideosInCache() {
    getAllFilesInCache().forEach(file => {
        if (fs.existsSync(`${cachePath}/${file}`)) {
            fs.unlink(`${cachePath}/${file}`, (err) => {
            });
        }
    });
    store.set('videoCacheSize', getCacheSize());
}

function removeAllUnallowedVideosInCache() {
    let allowedVideos = getVideosToDownload();
    let downloadedVideos = store.get('downloadedVideos') ?? [];
    for (let i = 0; i < downloadedVideos.length; i++) {
        if (!allowedVideos.includes(downloadedVideos[i])) {
            fs.unlink(`${cachePath}/${downloadedVideos[i]}.mov`, (err) => {
            });
        }
    }
    updateVideoCache();
}

function removeAllNeverAllowedVideosInCache() {
    let neverAllowedVideos = store.get('neverDownloadVideos');
    let downloadedVideos = store.get('downloadedVideos') ?? [];
    for (let i = 0; i < downloadedVideos.length; i++) {
        if (neverAllowedVideos.includes(downloadedVideos[i])) {
            fs.unlink(`${cachePath}/${downloadedVideos[i]}.mov`, (err) => {
            });
            downloadedVideos.splice(i, 1);
            i--;
        }
    }
    store.set('videoCacheSize', getCacheSize());
}

function updateVideoCache(callback) {
    let videoList = [];
    fs.readdir(cachePath, (err, files) => {
        files.forEach(file => {
            if (file.includes('.mov')) {
                videoList.push(file.slice(0, file.length - 4));
            }
        });
        if (!downloading) {
            store.set('downloadedVideos', videoList);
        }
        store.set('videoCacheSize', getCacheSize());
        if (callback) {
            callback();
        }
    });
}

function clearCacheTemp() {
    if (!fs.existsSync(`${app.getPath('userData')}/videos/`)) {
        fs.mkdirSync(`${app.getPath('userData')}/videos/`);
    }
    if (!fs.existsSync(`${app.getPath('userData')}/videos/temp`)) {
        fs.mkdirSync(`${app.getPath('userData')}/videos/temp`);
    }
    let dir = fs.readdirSync(cachePath + "\\temp").forEach(file => {
        if (fs.existsSync(`${cachePath}/temp/${file}`)) {
            fs.unlink(`${cachePath}/temp/${file}`, (err) => {
            });
        }
    });
}

//open & close functions
function quitApp() {
    if (!nq) {
        //app.quit();
        if (store.get("lockAfterRun")) {
            lockComputer();
        }
        closeAllWindows();
        currentlyPlaying = '';
    }
}

function closeAllWindows() {
    for (let i = 0; i < screens.length; i++) {
        if (!screens[i].isDestroyed()) {
            screens[i].close();
        }
    }
    screens = [];
}

function sleepComputer() {
    if (preview) {
        return
    }
    closeAllWindows();
    exec("rundll32.exe powrprof.dll, SetSuspendState Sleep");
    isComputerSleeping = true;
}

function lockComputer() {
    if (preview) {
        return
    }
    exec("Rundll32.exe user32.dll,LockWorkStation");
}

//idle startup timer
function launchScreensaver() {
    //console.log(screens.length,powerMonitor.getSystemIdleTime(),store.get('startAfter') * 60)
    if (screens.length === 0 && !suspend && !isComputerSleeping && !isComputerSuspendedOrLocked) {
        let idleTime = powerMonitor.getSystemIdleTime();
        if (powerMonitor.getSystemIdleState(store.get('startAfter') * 60) === "idle") {
            if (!store.get("runOnBattery")) {
                if (powerMonitor.isOnBatteryPower()) {
                    return;
                }
            }
            createSSWindow();
        }
    }
}

setInterval(launchScreensaver, 5000);

function onFirstVideoPlayed() {
    setTimeOfDayList();
    if (store.get('blankScreen')) {
        setTimeout(() => {
            for (let i = 0; i < screens.length; i++) {
                screens[i].webContents.send('blankTheScreen');
                if (store.get('sleepAfterBlank')) {
                    //sleep the computer after a few seconds of blank screen
                    setTimeout(() => {
                        sleepComputer()
                    }, store.get('videoTransitionLength') * 3)
                }
            }
        }, store.get('blankAfter') * 60000);
    }
}

//Time of day code functions
function setTimeOfDayList() {
    if (store.get('timeOfDay')) {
        for (let i = 0; i < allowedVideos.length; i++) {
            let index = videos.findIndex((e) => {
                if (allowedVideos[i] === e.id) {
                    return true;
                }
            });
            //some people seem to be getting errors where video[index] doesn't exit, this line will fix it.
            if (videos[index]) {
                switch (videos[index].timeOfDay) {
                    case "day":
                        tod.day.push(allowedVideos[i]);
                        break;
                    case "night":
                        tod.night.push(allowedVideos[i]);
                        break;
                    default:
                        tod.none.push(allowedVideos[i]);
                }
            }
            if (tod.day.length <= 3) {
                tod.day.push(...tod.none);
            }
            if (tod.night.length <= 3) {
                tod.night.push(...tod.none);
            }
        }
    }
}

setTimeOfDayList();

function getTimeOfDay() {
    let cHour = new Date().getHours();
    let cMin = new Date().getMinutes();
    let sunriseHour = store.get('sunrise').substring(0, 2);
    let sunriseMinute = store.get('sunrise').substring(3, 5);
    let sunsetHour = store.get('sunset').substring(0, 2);
    let sunsetMinute = store.get('sunset').substring(3, 5);
    let time = "night";
    if ((cHour === sunriseHour && cMin >= sunriseMinute) || (cHour > sunriseHour && cHour < sunsetHour) || (cHour === sunsetHour && cMin < sunsetMinute)) {
        time = "day";
    }
    return time;
}

//astronomy code
function calculateAstronomy() {
    if (store.get('latitude') !== "" && store.get('longitude') !== "") {
        let sunTimes = SunCalc.getTimes(new Date(), store.get('latitude'), store.get('longitude'));
        let moonTimes = SunCalc.getMoonTimes(new Date(), store.get('latitude'), store.get('longitude'))
        astronomy.sunrise = sunTimes.sunrise;
        astronomy.sunset = sunTimes.sunset;
        astronomy.moonrise = moonTimes.rise;
        astronomy.moonset = moonTimes.set;
        astronomy.calculated = true;
        store.set('astronomy', astronomy);
    }
}

//helper functions
function randomInt(min, max) {
    return Math.floor(Math.random() * max) - min;
}