const {ipcRenderer} = require('electron');
const videos = require("../videos.json");
const Store = require('electron-store');
const store = new Store();
const allowedVideos = store.get("allowedVideos");

function quitApp() {
    ipcRenderer.send('quitApp');
}

//quit when a key is pressed
document.addEventListener('keydown', (e) => {
    if(e.code === "ArrowRight" && store.get('skipVideosWithKey')){
        newVideo();
    }else {
        quitApp();
    }
});
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

//initial loading
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

video.addEventListener('play', (event) => {
    video.style.backgroundColor = "black";
});
video.addEventListener('ended', (event) => {
    newVideo();
});

function newVideo() {
    let id = "";
    if(store.get('timeOfDay')){
        let time = getTimeOfDay();
        id = tod[time][randomInt(0, tod[time].length)];
    }else {
        id = allowedVideos[randomInt(0, allowedVideos.length)];
    }
    let index = videos.findIndex((e) => {
        if(id === e.id){
            return true;
        }
    });
    let videoInfo = videos[index];
    video.src = videoInfo.src.H2641080p;
    video.playbackRate = Number(store.get('playbackSpeed'));
}

//time of day code
let tod = {"day": [], "night": [], "none" : []};
if(store.get('timeOfDay')){
    for(let i = 0; i < allowedVideos.length;i++){
        let index = videos.findIndex((e) => {
            if(allowedVideos[i] === e.id){
                return true;
            }
        });
        switch (videos[index].timeOfDay) {
            case "day":
                tod.day.push(allowedVideos[i]);
                break;
            case "night":
                tod.night.push(allowedVideos[i]);
                break;
            default:
                tod.none.push(allowedVideos[i]);
        }
        if(tod.day.length <= 3){
            tod.day.push(...tod.none);
        }
        if(tod.night.length <= 3){
            tod.night.push(...tod.none);
        }
    }
}

function getTimeOfDay() {
    let cHour = new Date().getHours();
    let cMin = new Date().getMinutes();
    let sunriseHour = store.get('sunrise').substring(0,2);
    let sunriseMinute = store.get('sunrise').substring(3,5);
    let sunsetHour = store.get('sunrise').substring(0,2);
    let sunsetMinute = store.get('sunrise').substring(3,5);
    let time = "night";
    if(cHour >= sunriseHour && cMin >= sunriseMinute && cHour < sunsetHour && cMin < sunriseMinute){
        time = "day";
    }
    return time;
}

//put the video on the canvas
let c1 = document.getElementById('canvasVideo');
let ctx1 = c1.getContext('2d');
c1.width = window.innerWidth;
c1.height = window.innerHeight;
let videoFilters = store.get('videoFilters');
let filter = "";
for(let i = 0; i < videoFilters.length;i++){
    filter += `${videoFilters[i].name}(${videoFilters[i].value}${videoFilters[i].suffix}) `;
}
ctx1.filter = filter;
function drawVideo (){
    ctx1.drawImage(video,0,0,window.innerWidth,window.innerHeight);
    requestAnimationFrame(drawVideo);
}
drawVideo();

//play a video
newVideo();