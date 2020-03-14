const {ipcRenderer} = require('electron');
const videos = require("../videos.json");
const Store = require('electron-store');
const store = new Store();
const allowedVideos = store.get("allowedVideos");

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
}, 1500);

//Clock
const tday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const tmonth = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
if (store.get("clock")) {
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
}

function randomInt(min, max) {
    return Math.floor(Math.random() * max) - min;
}

let video = document.getElementById("video");
let id = allowedVideos[randomInt(0,allowedVideos.length)];
let index = videos.findIndex((e) => {
    if(id === e.id){
        return true;
    }
});
let videoInfo = videos[index];
video.src = videoInfo.src.H2641080p;
video.addEventListener('play', (event) => {
    video.style.backgroundColor = "black";
});
video.addEventListener('ended', (event) => {
    id = allowedVideos[randomInt(0,allowedVideos.length)];
    index = videos.findIndex((e) => {
        if(id === e.id){
            return true;
        }
    });
    videoInfo = videos[index];
    video.src = videoInfo.src.H2641080p;
});