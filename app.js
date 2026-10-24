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

if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
}

app.on('second-instance', (event, argv) => {
    startupReady.then(() => createConfigWindow(argv));
});

const {exec} = require('child_process');
const {dismissStartMenu} = require('./start-menu');
const videos = require("./videos.json");
const videosById = new Map(videos.map(video => [video.id, video]));
const {createPersistentSettings} = require('./settings-persistence');
const store = createPersistentSettings(require('path').join(app.getPath('userData'), 'config.json'), {
    report: (message, error) => {
        console.error(message, error);
        app.whenReady().then(() => dialog.showMessageBox({
            type: 'warning',
            title: 'Aerial settings',
            message,
            detail: `Error: ${error.code || error.message}`
        })).catch(console.error);
    }
});

// Synchronous IPC preserves the existing settings API; these handlers only use memory.
ipcMain.on('settings-read', event => {
    event.returnValue = store.store;
});
ipcMain.on('system-language', event => {
    event.returnValue = app.getPreferredSystemLanguages();
});
ipcMain.on('settings-write', (event, changes) => {
    try {
        store.set(changes);
        event.returnValue = {ok: true};
    } catch (error) {
        event.returnValue = {error: error.message};
    }
});

let settingsQuitReady = false;
let settingsQuitting = false;
app.on('before-quit', event => {
    if (settingsQuitReady) {
        return;
    }
    event.preventDefault();
    if (settingsQuitting) {
        return;
    }
    settingsQuitting = true;
    Promise.race([
        store.flush(),
        new Promise(resolve => setTimeout(() => resolve(false), 3000))
    ]).then(saved => {
        if (!saved) {
            console.error('Aerial is exiting with unsaved settings. The previous config was preserved.');
        }
    }).finally(() => {
        settingsQuitReady = true;
        app.quit();
    });
});
const request = require('request');
const https = require('https');
const fs = require('fs');
const path = require("path");
const {createCompatibilityPlayer, convertedPath, deleteConvertedOriginal} = require('./playback');
const {getVideoSources} = require('./video-sources');
const {isDisplayRequired} = require('./display-power');
const compatibleSource = createCompatibilityPlayer(() => path.join(store.get('cachePath'), 'converted'));
const AutoLaunch = require('auto-launch');
let autoLauncher = new AutoLaunch({
    name: 'Aerial',
});
const SunCalc = require('suncalc');

//initialize variables
let screens = [];
let configWindow = null;
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
let startTime = new Date();
let tod = {"day": [], "night": [], "twilight": [], "none": []};
let astronomy = {
    "sunrise": undefined,
    "sunset": undefined,
    "moonrise": undefined,
    "moonset": undefined,
    "calculated": false
};
//window creation code
function createConfigWindow(argv) {
    if (configWindow && !configWindow.isDestroyed()) {
        if (configWindow.isMinimized()) {
            configWindow.restore();
        }
        configWindow.show();
        configWindow.focus();
        return;
    }
    let win = new BrowserWindow({
        width: 1000,
        height: 750,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: false,
            preload: path.join(__dirname, "preload.mjs")
        },
        resizable: false,
        icon: path.join(__dirname, 'icon.ico')
    });
    configWindow = win;
    win.loadFile('web/config.html');
    win.on('closed', function () {
        configWindow = null;
        screens = screens.filter(screenWindow => screenWindow !== win);
        win = null;
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
    store.set('numDisplays', displays.length);
    const cursorDisplayId = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
    const startMenuDismissed = nq ? Promise.resolve() : dismissStartMenu().catch(() => {
        // A blocked or unavailable shell helper must not prevent the saver from starting.
    });
    for (let i = 0; i < displays.length; i++) {
        let win = new BrowserWindow({
            width: displays[i].size.width,
            height: displays[i].size.height,
            webPreferences: {
                backgroundThrottling: false,
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                sandbox: false,
                preload: path.join(__dirname, "preload.mjs")
            },
            x: displays[i].bounds.x,
            y: displays[i].bounds.y,
            // Use explicit borderless monitor bounds instead of native fullscreen transitions.
            fullscreen: false,
            resizable: nq,
            thickFrame: nq,
            skipTaskbar: !nq,
            backgroundColor: '#000000',
            frame: nq,
            icon: path.join(__dirname, 'icon.ico'),
            show: false
        })
        if (store.get("onlyShowVideoOnPrimaryMonitor") && displays[i].id !== screen.getPrimaryDisplay().id) {
            win.loadFile('web/black.html');
        } else {
            win.loadFile('web/screensaver.html');
        }
        win.on('closed', function () {
            win = null;
        });
        win.once('ready-to-show', async () => {
            await startMenuDismissed;
            if (!win || win.isDestroyed()) {
                return;
            }
            win.webContents.send('screenNumber', i);
            win.show();
            if (!nq) {
                // Apply full monitor bounds after Windows has placed the visible window.
                win.setBounds(displays[i].bounds);
                win.setAlwaysOnTop(true, 'screen-saver');
            }
            if (displays[i].id === cursorDisplayId) {
                win.focus();
            }
        })
        if (!nq) {
            win.setMenu(null);
            win.setAlwaysOnTop(true, "screen-saver");
        } else {
            win.frame = true;
        }
        screens.push(win);
        screenIds.push(displays[i].id);
    }
    startTime = new Date();
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
            preload: path.join(__dirname, "preload.mjs"),
        },
        frame: true,
        backgroundColor: '#000000',
        icon: path.join(__dirname, 'icon.ico'),
        show: false
    });
    win.loadFile('web/screensaver.html');
    win.on('closed', function () {
        screens.pop(screens.indexOf(win));
        nq = false;
        win = null;
        preview = false;
    });
    win.once('ready-to-show', () => {
        win.webContents.send('screenNumber', 0);
        win.show();
    })
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
            preload: path.join(__dirname, "preload.mjs")
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
            preload: path.join(__dirname, "json-editor", "preload.mjs")
        },
        icon: path.join(__dirname, 'icon.ico')
    });
    win.loadFile('json-editor/index.html');
    win.on('closed', function () {
        win = null;
    });
}

//start up code
Menu.setApplicationMenu(null);
app.allowRendererProcessReuse = true
const startupReady = app.whenReady().then(startUp);

async function startUp() {
    //Uncomment the line below when compiling the .scr file
    //store.set('useTray', false);
    let firstTime = false;
    if (!store.get("configured") || store.get("version") !== app.getVersion()) {
        firstTime = true;
        await fs.promises.mkdir(path.join(app.getPath('userData'), 'videos', 'temp'), {recursive: true});
        setUpConfigFile();
    }
    calculateAstronomy();
    checkForUpdate();
    setupGlobalShortcut();
    store.set('numDisplays', screen.getAllDisplays().length);
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
    await clearCacheTemp();
    pruneVideoCache();
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
    const snapshot = store.store;
    const settings = {
        get: key => snapshot[key],
        set: (key, value) => { snapshot[key] = value; }
    };
    //update video info
    if (!settings.get('allowedVideos')) {
        let allowedVideos = [];
        for (let i = 0; i < videos.length; i++) {
            allowedVideos.push(videos[i].id);
        }
        settings.set('allowedVideos', allowedVideos);
    }
    settings.set('downloadedVideos', settings.get('downloadedVideos') ?? []);
    settings.set('alwaysDownloadVideos', settings.get('alwaysDownloadVideos') ?? []);
    settings.set('neverDownloadVideos', settings.get('neverDownloadVideos') ?? []);
    settings.set('videoProfiles', settings.get('videoProfiles') ?? []);
    settings.set('customVideos', settings.get('customVideos') ?? []);

    //start up settings
    settings.set('useTray', settings.get('useTray') ?? true);
    settings.set('startAfter', settings.get('startAfter') ?? 10);
    settings.set('blankScreen', settings.get('blankScreen') ?? true);
    settings.set('blankAfter', settings.get('blankAfter') ?? 30);
    settings.set('sleepAfterBlank', settings.get('sleepAfterBlank') ?? true);
    settings.set('lockAfterRun', settings.get('lockAfterRun') ?? false);
    settings.set('lockAfterRunAfter', settings.get('lockAfterRunAfter') ?? 15);
    settings.set('runOnBattery', settings.get('runOnBattery') ?? true);
    settings.set('updateAvailable', false);
    settings.set('enableGlobalShortcut', settings.get('enableGlobalShortcut') ?? true);
    settings.set('globalShortcutModifier1', settings.get('globalShortcutModifier1') ?? "Super");
    settings.set('globalShortcutModifier2', settings.get('globalShortcutModifier2') ?? "+Control");
    settings.set('globalShortcutKey', settings.get('globalShortcutKey') ?? "A");
    settings.set('wakeOnMouseMovement', settings.get('wakeOnMouseMovement') ?? true);
    settings.set('wakeOnMouseClick', settings.get('wakeOnMouseClick') ?? true);
    //playback settings
    settings.set('playbackSpeed', settings.get('playbackSpeed') ?? 1);
    settings.set('skipVideosWithKey', settings.get('skipVideosWithKey') ?? true);
    settings.set('skipKey', settings.get('skipKey') ?? "ArrowRight");
    settings.set('avoidDuplicateVideos', settings.get('avoidDuplicateVideos') ?? true);
    settings.set('videoFilters', settings.get('videoFilters') ?? [{
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
    settings.set('transitionType', settings.get("transitionType") ?? "dissolve");
    settings.set('transitionDirection', settings.get("transitionDirection") ?? "");
    settings.set('videoTransitionLength', settings.get('videoTransitionLength') ?? 2000);
    settings.set('easierTransitions', settings.get('easierTransitions') ?? false);
    settings.set('fillMode', settings.get('fillMode') ?? "stretch");
    settings.set('allowH265', settings.get('allowH265') ?? true);
    settings.set('allow4K', settings.get('allow4K') ?? true);
    settings.set('prefer4K240', settings.get('prefer4K240') ?? false);
    //1.2.0 changes the default transition length because of internal changes
    if (settings.get('videoTransitionLength') === 1000) {
        settings.set('videoTransitionLength', 2000);
    }
    //time & location settings
    settings.set('timeOfDay', settings.get('timeOfDay') ?? false);
    settings.set('dateTimeLanguage', settings.get('dateTimeLanguage') ?? 'system');
    settings.set('sunrise', settings.get('sunrise') ?? "06:00");
    settings.set('sunset', settings.get('sunset') ?? "18:00");
    settings.set('useLocationForSunrise', settings.get('useLocationForSunrise') ?? false);
    settings.set('latitude', settings.get('latitude') ?? "");
    settings.set('longitude', settings.get('longitude') ?? "");
    settings.set('astronomy', settings.get('astronomy') ?? astronomy)
    //multiscreen settings
    settings.set('sameVideoOnScreens', settings.get('sameVideoOnScreens') ?? false);
    settings.set('onlyShowVideoOnPrimaryMonitor', settings.get('onlyShowVideoOnPrimaryMonitor') ?? false);
    //cache settings
    settings.set('videoCache', settings.get('videoCache') ?? false);
    settings.set('videoCacheProfiles', settings.get('videoCacheProfiles') ?? false);
    settings.set('videoCacheSize', settings.get('videoCacheSize') ?? 0);
    settings.set('videoCacheRemoveUnallowed', settings.get('videoCacheRemoveUnallowed') ?? false);
    settings.set('cachePath', settings.get('cachePath') ?? cachePath);
    settings.set('prepareCompatibleVideos', settings.get('prepareCompatibleVideos') ?? false);
    settings.set('deleteOriginalsAfterConversion', settings.get('deleteOriginalsAfterConversion') ?? true);
    settings.set('immediatelyUpdateVideoCache', settings.get('immediatelyUpdateVideoCache') ?? true);
    //check for downloaded videos
    updateVideoCache();
    //text settings
    settings.set('textFont', settings.get('textFont') ?? "Segoe UI");
    settings.set('textSize', settings.get('textSize') ?? "2");
    settings.set('textColor', settings.get('textColor') ?? "#FFFFFF");
    let displayText = settings.get('displayText');
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
        settings.set('displayText', displayText);
    }
    settings.set('randomSpeed', settings.get('randomSpeed') ?? 30);

    //config
    settings.set('version', app.getVersion());
    settings.set("configured", true);
    store.set(snapshot);
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
    if (key === 'ArrowLeft' || key === 'ArrowRight'
        || (key === store.get('skipKey') && store.get('skipVideosWithKey'))) {
        for (let i = 0; i < screens.length; i++) {
            screens[i].webContents.send(key === 'ArrowLeft' ? 'previousVideo' : 'newVideo');
        }
    } else {
        quitApp();
    }
});

ipcMain.on('updateCache', (event) => {
    updateVideoCache(() => event.reply('displaySettings'));
    updateCustomVideos();
});

ipcMain.on('deleteCache', async (event) => {
    await removeAllVideosInCache();
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
        await fs.promises.mkdir(path.join(newPath, "temp"), {recursive: true});
        updateVideoCache(() => {
            event.reply('displaySettings');
        });
    }
});

ipcMain.on('refreshCache', async (event) => {
    if (store.get('immediatelyUpdateVideoCache')) {
        await pruneVideoCache();
        downloadVideos();
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
    store.clear();
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

ipcMain.handle('compatibleVideo', async (event, id) => {
    if (!store.get('prepareCompatibleVideos')) {
        throw new Error('Compatible video preparation is disabled');
    }
    const video = videos.find(video => video.id === id) || (store.get('customVideos') || []).find(video => video.id === id);
    if (!video) {
        throw new Error('Unknown video');
    }
    const sources = getVideoSources(video, store);
    if (!sources.length) {
        throw new Error('Video is excluded by playback settings');
    }
    const cached = path.join(store.get('cachePath'), `${id}.mov`);
    const original = video.path || cached;
    let source;
    if (!video.path && fs.existsSync(cached)) {
        source = await compatibleSource({...video, path: cached}).catch(() => compatibleSource({...video, path: sources[0]}));
    } else {
        source = await compatibleSource({...video, path: sources[0]});
    }
    if (store.get('prepareCompatibleVideos') && store.get('deleteOriginalsAfterConversion')) {
        try {
            await deleteConvertedOriginal(source, original);
            store.set('downloadedVideos', (store.get('downloadedVideos') || []).filter(value => value !== id));
        } catch (error) {
            console.error('Unable to delete converted original', error);
        }
    }
    store.set('videoCacheSize', await getCacheSizeAsync());
    return source;
});

ipcMain.handle('newVideoId', (event, lastPlayed) => {
    if (currentlyPlaying === '') {
        onFirstVideoPlayed();
    }

    const snapshot = store.store;
    const settings = {get: key => snapshot[key]};
    const customById = new Map((snapshot.customVideos || []).map(video => [video.id, video]));
    let candidates = (settings.get('allowedVideos') || []).filter(id => {
        const video = videosById.get(id);
        return video ? getVideoSources(video, settings).length > 0 : customById.has(id);
    });
    // Immediate repeats are allowed only when no other selected, playable video exists.
    const alternatives = candidates.filter(id => id !== lastPlayed);
    if (alternatives.length) {
        candidates = alternatives;
    }
    if (settings.get('timeOfDay')) {
        const timedIds = new Set(tod[getTimeOfDay(settings)]);
        const timed = candidates.filter(id => timedIds.has(id));
        if (timed.length) {
            candidates = timed;
        }
    }
    if (!candidates.length) {
        throw new Error('No selected videos match playback settings');
    }
    if (settings.get('sameVideoOnScreens') && currentlyPlaying !== lastPlayed && candidates.includes(currentlyPlaying)) {
        return currentlyPlaying;
    }
    function newId() {
        let choices = candidates;
        if (settings.get('avoidDuplicateVideos') && candidates.length > 6) {
            const fresh = candidates.filter(id => !previouslyPlayed.includes(id));
            if (fresh.length) {
                choices = fresh;
            }
        }
        const id = choices[randomInt(0, choices.length)];
        previouslyPlayed.push(id);
        previouslyPlayed = previouslyPlayed.slice(-Math.max(1, Math.floor(candidates.length * 0.3)));
        return id;
    }

    currentlyPlaying = newId();
    return currentlyPlaying;
})

ipcMain.on('newGlobalShortcut', (event) => {
    setupGlobalShortcut();
});

ipcMain.on('consoleLog', (event, msg) => {
    console.log(msg);
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
    if (store.get("enableGlobalShortcut")) {
        globalShortcut.register(`${store.get("globalShortcutModifier1") + store.get("globalShortcutModifier2")}+${store.get("globalShortcutKey")}`, () => {
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

function downloadFile(file_url, targetPath) {
    const {pipeline} = require('stream/promises');
    const agent = new https.Agent({
        host: 'sylvan.apple.com', path: '/', rejectUnauthorized: false
    });
    const input = request({method: 'GET', uri: file_url, agent});
    input.on('response', response => {
        if (response.statusCode !== 200) {
            input.destroy(new Error(`Video download returned HTTP ${response.statusCode}`));
        }
    });
    // Pipeline waits for the output file to finish and propagates errors on either stream.
    return pipeline(input, fs.createWriteStream(targetPath));
}

async function downloadVideos() {
    if (downloading) {
        return;
    }
    downloading = true;
    try {
        while (true) {
            const snapshot = store.store;
            const settings = {get: key => snapshot[key]};
            const allowed = getVideosToDownload(settings);
            const downloaded = new Set(snapshot.downloadedVideos || []);
            let next;
            const destination = cachePath;
            for (const id of allowed) {
                if (downloaded.has(id) || id[0] === '_') {
                    continue;
                }
                if (snapshot.prepareCompatibleVideos && snapshot.deleteOriginalsAfterConversion) {
                    try {
                        await fs.promises.access(convertedPath(path.join(destination, 'converted'), {id}));
                        continue;
                    } catch (error) {
                        if (error.code !== 'ENOENT') {
                            throw error;
                        }
                    }
                }
                next = videosById.get(id);
                break;
            }
            if (!next) {
                break;
            }
            const temporary = path.join(destination, 'temp', `${next.id}.mov`);
            try {
                await downloadFile(getVideoSources(next, settings)[0], temporary);
                // A cache location change invalidates work targeting the old directory.
                if (destination !== cachePath) {
                    continue;
                }
                await fs.promises.copyFile(temporary, path.join(destination, `${next.id}.mov`));
                const size = await getCacheSizeAsync(destination);
                if (destination === cachePath) {
                    store.set({
                        downloadedVideos: [...new Set([...(store.get('downloadedVideos') || []), next.id])],
                        videoCacheSize: size
                    });
                }
            } finally {
                await fs.promises.unlink(temporary).catch(error => {
                    if (error.code !== 'ENOENT') {
                        console.error('Unable to remove temporary video', error);
                    }
                });
            }
        }
    } catch (error) {
        console.error('Unable to download video', error);
    } finally {
        downloading = false;
    }
}

function getVideosToDownload(settings = store) {
    const snapshot = settings === store ? store.store : null;
    if (snapshot) {
        settings = {get: key => snapshot[key]};
    }
    const allowed = new Set(settings.get('videoCache') ? settings.get('allowedVideos') : []);
    for (const id of settings.get('alwaysDownloadVideos') || []) {
        allowed.add(id);
    }
    if (settings.get('videoCacheProfiles') && settings.get('videoCache')) {
        for (const profile of settings.get('videoProfiles') || []) {
            profile.videos.forEach(id => allowed.add(id));
        }
    }
    const never = new Set(settings.get('neverDownloadVideos') || []);
    return [...allowed].filter(id => {
        const video = videosById.get(id);
        return !never.has(id) && video && getVideoSources(video, settings).length > 0;
    });
}

async function getCacheSizeAsync(directory = cachePath) {
    let size = 0;
    const entries = await fs.promises.readdir(directory, {withFileTypes: true});
    for (const entry of entries) {
        const file = path.join(directory, entry.name);
        try {
            if (entry.isDirectory()) {
                if (entry.name === 'converted') {
                    size += await getCacheSizeAsync(file);
                }
            } else {
                size += (await fs.promises.stat(file)).size;
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }
    return size;
}

// Cache maintenance runs in order so repeated changes do not overlap deletions.
let cacheMaintenance = Promise.resolve();

function maintainCache(work) {
    cacheMaintenance = cacheMaintenance.then(work).catch(error => {
        console.error('Unable to maintain video cache', error);
    });
    return cacheMaintenance;
}

async function unlinkCachedFile(file) {
    try {
        await fs.promises.unlink(file);
        return true;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
        return false;
    }
}

function removeAllVideosInCache() {
    return maintainCache(async () => {
        const directory = cachePath;
        const entries = await fs.promises.readdir(directory, {withFileTypes: true});
        for (const entry of entries) {
            const file = path.join(directory, entry.name);
            if (entry.name === 'converted' && entry.isDirectory()) {
                // Converted outputs are files; preserve any unexpected subdirectories.
                const converted = await fs.promises.readdir(file, {withFileTypes: true});
                for (const output of converted) {
                    if (!output.isDirectory()) {
                        await unlinkCachedFile(path.join(file, output.name));
                    }
                }
            } else if (!entry.isDirectory()) {
                await unlinkCachedFile(file);
            }
        }
        if (directory === cachePath) {
            await updateVideoCache();
        }
    });
}

function pruneVideoCache() {
    return maintainCache(async () => {
        const snapshot = store.store;
        const directory = cachePath;
        const allowed = snapshot.videoCacheRemoveUnallowed
            ? new Set(getVideosToDownload({get: key => snapshot[key]})) : null;
        const never = new Set(snapshot.neverDownloadVideos || []);
        let changed = false;
        for (const id of snapshot.downloadedVideos || []) {
            if (never.has(id) || (allowed && !allowed.has(id))) {
                changed = await unlinkCachedFile(path.join(directory, `${id}.mov`)) || changed;
            }
        }
        // No deletion means no reason to rescan the entire cache or rewrite settings.
        if (changed && directory === cachePath) {
            await updateVideoCache();
        }
    });
}

async function updateVideoCache(callback) {
    const directory = cachePath;
    try {
        const files = await fs.promises.readdir(directory);
        const size = await getCacheSizeAsync(directory);
        if (directory !== cachePath) {
            return;
        }
        const changes = {videoCacheSize: size};
        if (!downloading) {
            changes.downloadedVideos = files.filter(file => file.endsWith('.mov')).map(file => file.slice(0, -4));
        }
        store.set(changes);
        if (callback) {
            callback();
        }
    } catch (error) {
        console.error('Unable to update video cache', error);
    }
}

async function clearCacheTemp() {
    const directory = path.join(cachePath, 'temp');
    try {
        await fs.promises.mkdir(directory, {recursive: true});
        const entries = await fs.promises.readdir(directory, {withFileTypes: true});
        for (const entry of entries) {
            if (!entry.isDirectory()) {
                await unlinkCachedFile(path.join(directory, entry.name));
            }
        }
    } catch (error) {
        console.error('Unable to clear temporary cache', error);
    }
}

//open & close functions
function quitApp() {
    if (!nq) {
        //app.quit();
        if (store.get("lockAfterRun") && (new Date() - startTime) / 1000 > store.get("lockAfterRunAfter")) {
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
let checkingDisplayPower = false;

function canLaunchScreensaver() {
    const startAfter = store.get('startAfter');
    return screens.length === 0 && !suspend && !isComputerSleeping &&
        !isComputerSuspendedOrLocked && startAfter > 0 &&
        powerMonitor.getSystemIdleState(startAfter * 60) === 'idle' &&
        (store.get('runOnBattery') || !powerMonitor.isOnBatteryPower());
}

async function launchScreensaver() {
    if (checkingDisplayPower || !canLaunchScreensaver()) {
        return;
    }
    checkingDisplayPower = true;
    try {
        const displayRequired = await isDisplayRequired();
        // Input, settings, or power state may have changed during the query.
        if (!displayRequired && canLaunchScreensaver()) {
            createSSWindow();
        }
    } catch (error) {
        // Skip this attempt if Windows cannot confirm it is safe to start.
        console.warn('Unable to query display power requests:', error.message);
    } finally {
        checkingDisplayPower = false;
    }
}

setInterval(launchScreensaver, 5000);

function onFirstVideoPlayed() {
    let startTime = new Date();
    setTimeOfDayList();
    if (store.get('blankScreen')) {
        let interval = setInterval(() => {
            if (screens.length === 0) {
                clearTimeout(interval);
                return;
            }
            if (new Date() - startTime >= store.get('blankAfter') * 60 * 1000) {
                blankScreensaver();
            }
        }, 30000);
    }
}

function blankScreensaver() {
    for (let i = 0; i < screens.length; i++) {
        screens[i].webContents.send('blankTheScreen');
        if (store.get('sleepAfterBlank')) {
            //sleep the computer after a few seconds of blank screen
            setTimeout(() => {
                sleepComputer()
            }, store.get('videoTransitionLength') * 3)
        }
    }
}

//Time of day code functions
function setTimeOfDayList() {
    tod = {day: [], night: [], twilight: [], none: []};
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
                    case "twilight":
                        tod.twilight.push(allowedVideos[i]);
                        break;
                    default:
                        tod.none.push(allowedVideos[i]);
                }
            }
        }
        for (const period of ['day', 'night', 'twilight']) {
            if (tod[period].length <= 3) {
                tod[period].push(...tod.none);
            }
        }
    }
}

setTimeOfDayList();

function getTimeOfDay(settings = store) {
    let cHour = new Date().getHours();
    let cMin = new Date().getMinutes();
    let sunriseHour = Number(settings.get('sunrise').substring(0, 2));
    let sunriseMinute = Number(settings.get('sunrise').substring(3, 5));
    let sunsetHour = Number(settings.get('sunset').substring(0, 2));
    let sunsetMinute = Number(settings.get('sunset').substring(3, 5));
    const minutes = cHour * 60 + cMin;
    const sunrise = sunriseHour * 60 + sunriseMinute;
    const sunset = sunsetHour * 60 + sunsetMinute;
    const distance = boundary => Math.abs(((minutes - boundary + 2160) % 1440) - 720);
    if (distance(sunrise) <= 30 || distance(sunset) <= 30) {
        return 'twilight';
    }
    const daylightLength = (sunset - sunrise + 1440) % 1440;
    return (minutes - sunrise + 1440) % 1440 < daylightLength ? 'day' : 'night';
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
