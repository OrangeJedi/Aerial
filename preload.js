const {contextBridge, ipcRenderer} = require("electron");
const Store = require('electron-store');
const store = new Store();

// Expose protected methods from node modules
contextBridge.exposeInMainWorld("electron", {
        ipcRenderer: {
            send: (channel, data) => {
                // whitelist channels
                let validChannels = ["quitApp", "keyPress", "updateCache", "deleteCache", "openCache", "selectCustomLocation", "selectCacheLocation", "refreshCache", "openPreview", "refreshConfig", "resetConfig", "updateLocation","openConfigFolder","selectFile","openInfoEditor", "newGlobalShortcut"];
                if (validChannels.includes(channel)) {
                    ipcRenderer.send(channel, data);
                }
            },
            on: (channel, func) => {
                let validChannels = ["displaySettings", "newCustomVideos", "newVideo", "blankTheScreen", "showWelcome","updateAttribute"];
                if (validChannels.includes(channel)) {
                    // Deliberately strip event as it includes `sender`
                    ipcRenderer.on(channel, (event, ...args) => func(...args));
                }
            },
            // From render to main and back again.
            invoke: (channel, args) => {
                let validChannels = ["newVideoId"];
                if (validChannels.includes(channel)) {
                    return ipcRenderer.invoke(channel, args);
                }
            }
        },
        store: {
            get: (key) => {
                return store.get(key);
            },
            set: (key, value) => {
                return store.set(key, value);
            }
        },
        videos: require("./videos.json"),
        fontListUniversal: require('font-list-universal'),
    }
)