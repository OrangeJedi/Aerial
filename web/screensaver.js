const { ipcRenderer } = require('electron');

function quitApp() {
    ipcRenderer.send('quitApp');
}

document.addEventListener('keydown', quitApp);
document.addEventListener('mousedown', quitApp);