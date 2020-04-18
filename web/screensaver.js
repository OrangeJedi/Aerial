const {ipcRenderer, remote} = require('electron');
const videos = require("../videos.json");
const Store = require('electron-store');
const store = new Store();
const allowedVideos = store.get("allowedVideos");
let downloadedVideos = store.get("downloadedVideos");
let customVideos = store.get("customVideos");
let previouslyPlayed = [];
let currentlyPlaying = '';
let poiTimeout, transitionTimeout;

function quitApp() {
    ipcRenderer.send('quitApp');
}

ipcRenderer.on('newVideo', () => {
    newVideo();
});

//quit when a key is pressed
document.addEventListener('keydown', (e) => {
    ipcRenderer.send('keyPress', e.code);
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
video.addEventListener("error", (event)=>{
    console.log('VIDEO PLAYBACK ERROR - Playing new video');
    newVideo();
});

function newVideo() {
    clearTimeout(poiTimeout);
    clearTimeout(transitionTimeout);
    videoAlpha = 0;
    let id = "";
    if (store.get('timeOfDay')) {
        let time = getTimeOfDay();
        id = tod[time][randomInt(0, tod[time].length)];
    } else {
        id = allowedVideos[randomInt(0, allowedVideos.length)];
    }
    if (store.get('sameVideoOnScreens')) {
        if (currentlyPlaying === remote.getGlobal('shared').currentlyPlaying) {
            remote.getGlobal('shared').currentlyPlaying = id;
        } else {
            id = remote.getGlobal('shared').currentlyPlaying;
        }
    }
    if (store.get('avoidDuplicateVideos')) {
        if (previouslyPlayed.includes(id)) {
            newVideo();
            return;
        } else {
            previouslyPlayed.push(id);
            if (previouslyPlayed.length > (allowedVideos.length * .4)) {
                previouslyPlayed.shift();
            }
        }
    }
    let videoInfo, videoSRC;
    if (id[0] === "_") {
        console.log(id);
        videoInfo = customVideos[customVideos.findIndex((e) => {
            if (id === e.id) {
                return true;
            }
        })];
        console.log(videoInfo);
        videoSRC = videoInfo.path;
    } else {
        let index = videos.findIndex((e) => {
            if (id === e.id) {
                return true;
            }
        });
        videoInfo = videos[index];
        downloadedVideos = store.get("downloadedVideos");
        videoSRC = videoInfo.src.H2641080p;
        if (downloadedVideos.includes(videoInfo.id)) {
            videoSRC = `${store.get('cachePath')}/${videoInfo.id}.mov`;
        }
    }
    video.src = videoSRC;
    video.playbackRate = Number(store.get('playbackSpeed'));
    currentlyPlaying = videoInfo.id;
    video.onplay = onVideoPlay;
    //display text
    for (let position of displayText.positionList) {
        let textArea = $(`#textDisplay-${position}`);
        if (displayText[position].type === "information") {
            if (displayText[position].infoType === "poi") {
                changePOI(position, -1, videoInfo["pointsOfInterest"]);
            } else {
                textArea.text(videoInfo[displayText[position].infoType]);
            }
        }
    }
}

let transitionLength = store.get('videoTransitionLength');
let videoAlpha = 1;

function onVideoPlay(e) {
    if(!videoQuality) {
        fadeVideoIn(transitionLength);
        setTimeout(fadeVideoOut, (e.target.duration * 1000) - transitionLength, transitionLength);
    }
}

function fadeVideoOut(time) {
    if (time > 0) {
        transitionTimeout = setTimeout(fadeVideoOut, 16, time - 16);
    }
    videoAlpha = time / transitionLength;
}

function fadeVideoIn(time) {
    if (time > 0) {
        transitionTimeout = setTimeout(fadeVideoIn, 16, time - 16);
    }
    videoAlpha = 1 - (time / transitionLength);
}

function changePOI(position, currentPOI, poiList) {
    let poiS = Object.keys(poiList);
    for (let i = 0; i < poiS.length; i++) {
        if (Number(poiS[i]) > currentPOI) {
            $(`#textDisplay-${position}`).text(poiList[poiS[i]]);
            if (i < poiS.length) {
                poiTimeout = setTimeout(changePOI, (Number(poiS[i + 1]) - Number(poiS[i])) * 1000, position, poiS[i], poiList);
            }
            break;
        }
    }
}

//time of day code
let tod = {"day": [], "night": [], "none": []};
if (store.get('timeOfDay')) {
    for (let i = 0; i < allowedVideos.length; i++) {
        let index = videos.findIndex((e) => {
            if (allowedVideos[i] === e.id) {
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
        if (tod.day.length <= 3) {
            tod.day.push(...tod.none);
        }
        if (tod.night.length <= 3) {
            tod.night.push(...tod.none);
        }
    }
}

function getTimeOfDay() {
    let cHour = new Date().getHours();
    let cMin = new Date().getMinutes();
    let sunriseHour = store.get('sunrise').substring(0, 2);
    let sunriseMinute = store.get('sunrise').substring(3, 5);
    let sunsetHour = store.get('sunrise').substring(0, 2);
    let sunsetMinute = store.get('sunrise').substring(3, 5);
    let time = "night";
    if (cHour >= sunriseHour && cMin >= sunriseMinute && cHour < sunsetHour && cMin < sunriseMinute) {
        time = "day";
    }
    return time;
}

//put the video on the canvas
function drawVideo() {
    if(videoAlpha !== 1) {
        ctx1.clearRect(0, 0, window.innerWidth, window.innerHeight);
        ctx1.globalAlpha = 1;
        ctx1.fillStyle = "#000000";
        ctx1.fillRect(0, 0, window.innerWidth, window.innerHeight);
        ctx1.globalAlpha = videoAlpha;
    }
    ctx1.drawImage(video, 0, 0, window.innerWidth, window.innerHeight);
    requestAnimationFrame(drawVideo);
}

let c1 = document.getElementById('canvasVideo');
let ctx1 = c1.getContext('2d');
c1.width = window.innerWidth;
c1.height = window.innerHeight;
let videoFilters = store.get('videoFilters');
let filter = "";
for (let i = 0; i < videoFilters.length; i++) {
    if (videoFilters[i].value !== videoFilters[i].defaultValue) {
        filter += `${videoFilters[i].name}(${videoFilters[i].value}${videoFilters[i].suffix}) `;
    }
}
ctx1.filter = filter;

let videoQuality = store.get('videoQuality');
if(videoQuality){
    $('#video').css('display', '');
}else {
    drawVideo();
}

function runClock(position, timeString) {
    $(`#textDisplay-${position}`).text(moment().format(timeString));
    setTimeout(runClock, 1000 - new Date().getMilliseconds(), position, timeString);
}

//set up css
$('.displayText').css('font-family', `"${store.get('textFont')}"`).css('font-size', `${store.get('textSize')}vw`).css('color', `${store.get('textColor')}`);

//draw text
let displayText = store.get('displayText') ?? [];
let html = "";

//create content divs
for (let position of displayText.positionList) {
    let align = "";
    if (position.includes("left")) {
        align = "w3-left-align"
    } else if (position.includes("middle")) {
        align = "w3-center"
    } else if (position.includes("right")) {
        align = "w3-right-align"
    }
    html += `<div class="w3-display-${position} ${align} w3-container textDisplayArea" id="textDisplay-${position}" style="text-shadow:.05vw .05vw 0 #444"></div>`;
    $('#textDisplayArea').html(html);
}
//add text to the content
for (let position of displayText.positionList) {
    switch (displayText[position].type) {
        case "none":
            break;
        case "text":
            $(`#textDisplay-${position}`).text(displayText[position].text);
            break;
        case "time":
            runClock(position, displayText[position].timeString);
            break;
    }
    if (!displayText[position].defaultFont) {
        $(`#textDisplay-${position}`).css('font-family', `"${displayText[position].font}"`).css('font-size', `${displayText[position].fontSize}vw`).css('color', `${displayText[position].fontColor}`);
    }
}

//play a video
newVideo();