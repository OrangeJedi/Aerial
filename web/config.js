const Store = require('electron-store');
const store = new Store();

if(store.get('clock')){
    document.getElementById("showClock").checked = true;
}

function updateClock() {
    store.set('clock', document.getElementById("showClock").checked)
}