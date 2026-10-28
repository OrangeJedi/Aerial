const {contextBridge, ipcRenderer} = require("electron");
const fontListUniversal = require('font-list-universal');
const {execFile} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function cleanFontName(font) {
    return font
        .trim()
        .replace(/^"/, '')
        .replace(/"$/, '')
        .replace(/^\s+|\s+$/g, '');
}

function getWindowsFonts() {
    return new Promise((resolve, reject) => {
        let scriptPath = path.join(path.dirname(require.resolve('font-list-universal')), 'libs', 'win32', 'fonts.vbs');

        if (scriptPath.includes('app.asar')) {
            let tmpScriptPath = path.join(os.tmpdir(), 'aerial-fonts.vbs');
            fs.copyFileSync(scriptPath, tmpScriptPath);
            scriptPath = tmpScriptPath;
        }

        execFile('cscript', ['//nologo', scriptPath], (err, stdout, stderr) => {
            if (err) {
                reject(err);
                return;
            }

            let fonts = `${stdout || ''}\n${stderr || ''}`
                .split('\n')
                .map(line => {
                    let parts = line.split('\t');
                    return cleanFontName(parts.length > 1 ? parts.slice(1).join('\t') : parts[0]);
                })
                .filter(font => font && !font.includes('\\'));

            resolve(Array.from(new Set(fonts)).sort());
        });
    });
}

const fontList = {
    getFonts: async () => {
        if (process.platform === 'win32') {
            try {
                return await getWindowsFonts();
            } catch (e) {
                console.log(e);
            }
        }

        return fontListUniversal.getFonts();
    }
};


module.exports = function initializePreload() {
    const store = {
        get store() {
            return ipcRenderer.sendSync('settings-read');
        },
        set store(changes) {
            const result = ipcRenderer.sendSync('settings-write', changes);
            if (result.error) {
                throw new Error(result.error);
            }
        }
    };
    const {createSettingsStore} = require('./settings-store');
    const settings = createSettingsStore(store);
    const {getVideoSources} = require('./video-sources');
    const {convertedPath} = require('./playback');
    const path = require('path');
    const fs = require('fs');

    const videoLocales = require('../localized/locales.json');
    const {createVideoLocalizer} = require('./video-localization');
    const localizeVideo = createVideoLocalizer({videos: require('../videos.json'), locales: videoLocales});
    let cachedSystemLanguages;
    const systemLanguages = () => cachedSystemLanguages ||= ipcRenderer.sendSync('system-language');

    // Expose protected methods from node modules
    contextBridge.exposeInMainWorld("electron", {
            windowPreview: process.argv.includes('--aerial-window-preview'),
            embeddedPreview: process.argv.includes('--aerial-embedded-preview'),
            get systemLanguages() {
                return systemLanguages();
            },
            convertedVideo: video => {
                if (!settings.get('prepareCompatibleVideos')) {
                    return null;
                }
                const file = convertedPath(path.join(settings.get('cachePath'), 'converted'), video);
                return fs.existsSync(file) ? require('url').pathToFileURL(file).href : null;
            },
            videoSources: video => {
                const sources = getVideoSources(video, settings);
                return video.path ? sources.map(source => require('url').pathToFileURL(source).href) : sources;
            },
            settingsDefinition: require('./build-mode').settingsDefinition(require('../web/config/settings.json')),
            configBackdrop: process.platform === 'win32' && Number(os.release().split('.')[2]) >= 22621,
            ipcRenderer: {
                send: (channel, data) => {
                    // whitelist channels
                    let validChannels = ["openFullscreenPreview", "restartForUpdate", "checkForUpdates", "quitApp", "keyPress", "updateCache", "deleteCache", "openCache", "selectCustomLocation", "selectCacheLocation", "refreshCache", "openPreview", "refreshConfig", "resetConfig", "updateLocation", "openConfigFolder", "selectFile", "openInfoEditor", "newGlobalShortcut", "consoleLog"];
                    if (channel === 'videoPlaybackState' || validChannels.includes(channel)) {
                        ipcRenderer.send(channel, data);
                    }
                },
                on: (channel, func) => {
                    let validChannels = ["configAccentChanged", "updateStatus", "displaySettings", "newCustomVideos", "newVideo", "previousVideo", "blankTheScreen", "showWelcome", "showUpdated", "updateAttribute", "screenNumber"];
                    if (validChannels.includes(channel)) {
                        // Deliberately strip event as it includes `sender`
                        ipcRenderer.on(channel, (event, ...args) => {
                            settings.invalidate();
                            func(...args);
                        });
                    }
                },
                // From render to main and back again.
                invoke: (channel, args) => {
                    let validChannels = ["getConfigAccent", "getUpdateStatus", "newVideoId", "compatibleVideo"];
                    if (validChannels.includes(channel)) {
                        return ipcRenderer.invoke(channel, args);
                    }
                }
            },
            store: {
                get: (key) => {
                    return settings.get(key);
                },
                set: (key, value) => {
                    return settings.set(key, value);
                }
            },
            videos: require("../videos.json"),
            videoLocales,
            videoText: (video, language) => {
                const selected = language || settings.get('dateTimeLanguage');
                const languages = selected && selected !== 'system' ? [selected] : systemLanguages();
                return localizeVideo(video, languages);
            },
            fontListUniversal: fontList,
        }
    )
};
