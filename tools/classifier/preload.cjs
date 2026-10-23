const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('classifier', {
    list: () => ipcRenderer.invoke('classifier:list'),
    frame: (id, background = false) => ipcRenderer.invoke('classifier:frame', id, background),
    save: (id, tag) => ipcRenderer.invoke('classifier:save', id, tag)
});
