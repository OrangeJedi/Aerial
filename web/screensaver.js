const videos = electron.videos;
const allowedVideos = electron.store.get("allowedVideos");
let downloadedVideos = electron.store.get("downloadedVideos");
let customVideos = electron.store.get("customVideos");
let currentlyPlaying = '';
let transitionTimeout;
let poiTimeout = [];
let blackScreen = false;
let previousErrorId = "";
let numErrors = 1;

function quitApp() {
    electron.ipcRenderer.send('quitApp');
}

//quit when a key is pressed
document.addEventListener('keydown', (e) => {
    electron.ipcRenderer.send('keyPress', e.code);
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

let video = document.getElementById("video");

video.addEventListener('play', (event) => {
    video.style.backgroundColor = "black";
});
video.addEventListener('ended', (event) => {
    newVideo();
    numErrors = 0;
});
video.addEventListener("error", (event) => {
    setTimeout(() => {
        if (video.currentTime === 0) {
            console.log('VIDEO PLAYBACK ERROR - Playing new video', event);
            if (previousErrorId !== currentlyPlaying) {
                newVideo();
            }
            previousErrorId = currentlyPlaying;
            numErrors++;
        }
    }, 500 * numErrors);
});

function newVideo() {
    if (blackScreen) {
        return
    }
    clearTimeout(transitionTimeout);
    videoAlpha = 0;
    video.src = "";
    electron.ipcRenderer.invoke('newVideoId', currentlyPlaying).then((id) => {
        let videoInfo, videoSRC;
        if (id[0] === "_") {
            videoInfo = customVideos[customVideos.findIndex((e) => {
                if (id === e.id) {
                    return true;
                }
            })];
            videoSRC = videoInfo.path;
        } else {
            let index = videos.findIndex((e) => {
                if (id === e.id) {
                    return true;
                }
            });
            videoInfo = videos[index];
            downloadedVideos = electron.store.get("downloadedVideos");
            videoSRC = videoInfo.src.H2641080p;
            if (downloadedVideos.includes(videoInfo.id)) {
                videoSRC = `${electron.store.get('cachePath')}/${videoInfo.id}.mov`;
            }
        }
        video.src = videoSRC;
        video.playbackRate = Number(electron.store.get('playbackSpeed'));
        currentlyPlaying = videoInfo.id;
        video.onplay = onVideoPlay;
        //display text
        for (let position of displayText.positionList) {
            let textArea = $(`#textDisplay-${position}`);
            if (displayText[position].type === "information") {
                if (displayText[position].infoType === "poi") {
                    console.log(videoInfo["pointsOfInterest"] !== undefined);
                    if (videoInfo["pointsOfInterest"] !== undefined) {
                        changePOI(position, -1, videoInfo["pointsOfInterest"]);
                    } else {
                        changePOI(position, -1, {"0": ""});
                    }
                } else {
                    console.log("hey!");
                    textArea.text(videoInfo[displayText[position].infoType]);
                }
            }
            textArea.css('width', displayText[position].maxWidth ? displayText[position].maxWidth : "50%")
        }
    })

}

let transitionLength = electron.store.get('videoTransitionLength');
let videoAlpha = 1;

function onVideoPlay(e) {
    if (!videoQuality) {
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

function fadeTextOut(time) {
    if (time > 0) {
        transitionTimeout = setTimeout(fadeTextOut, 16, time - 16);
    }
    $('#textDisplayArea').css('opacity', time / transitionLength);
}

function fadeVideoIn(time) {
    if (time > 0) {
        transitionTimeout = setTimeout(fadeVideoIn, 16, time - 16);
    }
    videoAlpha = 1 - (time / transitionLength);
}

function changePOI(position, currentPOI, poiList) {
    poiTimeout = clearTimeouts(poiTimeout);
    let poiS = Object.keys(poiList);
    for (let i = 0; i < poiS.length; i++) {
        if (Number(poiS[i]) > currentPOI) {
            $(`#textDisplay-${position}`).text(poiList[poiS[i]]);
            if (i < poiS.length - 1) {
                poiTimeout.push(setTimeout(changePOI, (Number(poiS[i + 1]) - Number(poiS[i])) * 1000 || 0, position, poiS[i], poiList));
            }
            break;
        }
    }
}

function clearTimeouts(arr) {
    for (let i = 0; i < arr.length; i++) {
        clearTimeout(arr[i]);
    }
    return [];
}

//put the video on the canvas
function drawVideo() {
    if (videoAlpha !== 1) {
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
let videoFilters = electron.store.get('videoFilters');
let filter = "";
for (let i = 0; i < videoFilters.length; i++) {
    if (videoFilters[i].value !== videoFilters[i].defaultValue) {
        filter += `${videoFilters[i].name}(${videoFilters[i].value}${videoFilters[i].suffix}) `;
    }
}
ctx1.filter = filter;

let videoQuality = electron.store.get('videoQuality');
if (videoQuality) {
    $('#video').css('display', '');
} else {
    drawVideo();
}

function runClock(position, timeString) {
    if (blackScreen) {
        return
    }
    $(`#textDisplay-${position}`).text(moment().format(timeString));
    setTimeout(runClock, 1000 - new Date().getMilliseconds(), position, timeString);
}

//set up css
$('.displayText').css('font-family', `"${electron.store.get('textFont')}"`).css('font-size', `${electron.store.get('textSize')}vw`).css('color', `${electron.store.get('textColor')}`);

//draw text
let displayText = electron.store.get('displayText') ?? [];
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
        case "html":
            $(`#textDisplay-${position}`).html(displayText[position].html);
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

electron.ipcRenderer.on('newVideo', () => {
    newVideo();
});

electron.ipcRenderer.on('blankTheScreen', () => {
    blackScreen = true;
    fadeVideoOut(transitionLength);
    fadeTextOut(transitionLength)
    setTimeout(() => {
        video.src = "";
    }, transitionLength);
});