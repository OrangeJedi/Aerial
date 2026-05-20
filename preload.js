const {contextBridge, ipcRenderer} = require("electron");
const Store = require('electron-store');
const store = new Store();
const fontListUniversal = require('font-list-universal');
const {execFile} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function cleanFontName(font) {
    return font
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

// Expose protected methods from node modules
contextBridge.exposeInMainWorld("electron", {
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
        fontListUniversal: fontList,
    }
)
