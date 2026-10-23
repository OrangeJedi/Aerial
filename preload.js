const {contextBridge, ipcRenderer} = require("electron");
module.exports = function initializePreload(Store) {
    const store = new Store();
    const {createSettingsStore} = require('./settings-store');
    const settings = createSettingsStore(store);
    const {getVideoSources} = require('./video-sources');
    const {convertedPath} = require('./playback');
    const path = require('path');
    const fs = require('fs');

    // Expose protected methods from node modules
    contextBridge.exposeInMainWorld("electron", {
            convertedVideo: video => {
                if (!settings.get('prepareCompatibleVideos')) {
                    return null;
                }
                const file = convertedPath(path.join(settings.get('cachePath'), 'converted'), video);
                return fs.existsSync(file) ? require('url').pathToFileURL(file).href : null;
            },
            videoSources: video => {
                return getVideoSources(video, settings);
            },
            ipcRenderer: {
                send: (channel, data) => {
                    // whitelist channels
                    let validChannels = ["quitApp", "keyPress", "updateCache", "deleteCache", "openCache", "selectCustomLocation", "selectCacheLocation", "refreshCache", "openPreview", "refreshConfig", "resetConfig", "updateLocation", "openConfigFolder", "selectFile", "openInfoEditor", "newGlobalShortcut", "consoleLog"];
                    if (validChannels.includes(channel)) {
                        ipcRenderer.send(channel, data);
                    }
                },
                on: (channel, func) => {
                    let validChannels = ["displaySettings", "newCustomVideos", "newVideo", "blankTheScreen", "showWelcome", "updateAttribute", "screenNumber"];
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
                    let validChannels = ["newVideoId", "compatibleVideo"];
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
            videos: require("./videos.json"),
            fontListUniversal: require('font-list-universal'),
        }
    )
};
