const {ipcRenderer} = require('electron');

function quitApp() {
    ipcRenderer.send('quitApp');
}

//quit when a key is pressed
document.addEventListener('keydown', quitApp);
document.addEventListener('mousedown', quitApp);
setTimeout(function () {
    var threshold = 5;
    document.addEventListener('mousemove', function (e) {
        if (threshold * threshold < e.movementX * e.movementX
            + e.movementY * e.movementY) {
            quitApp();
        }
    });
}, 3000);

//Clock
const tday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const tmonth = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function GetClock() {
    let d = new Date();
    let nday = d.getDay(), nmonth = d.getMonth(), ndate = d.getDate(), nyear = d.getFullYear();
    let nhour = d.getHours(), nmin = d.getMinutes(), nsec = d.getSeconds();
    if (nmin <= 9) nmin = "0" + nmin;
    if (nsec <= 9) nsec = "0" + nsec;

    document.getElementById('clockbox').innerHTML = "" + tday[nday] + ", " + tmonth[nmonth] + " " + ndate + ", " + nyear + " " + nhour + ":" + nmin + ":" + nsec + "";
}

GetClock();
setInterval(GetClock, 1000);