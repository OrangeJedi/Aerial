const videos = electron.videos;
const allowedVideos = electron.store.get("allowedVideos");
let downloadedVideos = electron.store.get("downloadedVideos");
let customVideos = electron.store.get("customVideos");
let currentlyPlaying = '';
let prepedVideo = '';
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

let containers = [document.getElementById("video"), document.getElementById("video2")]
let currentPlayer = 0;
let prePlayer = 1;

/*let video = document.getElementById("video");
let video2 = document.getElementById("video2");*/

containers.forEach((video) => {
    video.addEventListener('play', (event) => {
        video.style.backgroundColor = "black";
    });
    video.addEventListener('ended', (event) => {
        //newVideo(currentPlayer);
        console.log("ended!");
        numErrors = 0;
    });
    video.addEventListener("error", videoError);
});

function videoError(event) {
    if (event.srcElement === containers[currentPlayer]) {
        setTimeout(() => {
            if (event.srcElement.currentTime === 0) {
                console.log('VIDEO PLAYBACK ERROR', event);
                console.log(event.target.error.message);
                if (previousErrorId !== currentlyPlaying) {
                    newVideo();
                }
                previousErrorId = currentlyPlaying;
                numErrors++;
            }
        }, 500 * numErrors);
    } else {
        console.log("Error in Pre-Player");
    }
}

function prepVideo(videoContainer, callback) {
    if (blackScreen) {
        return
    }
    containers[videoContainer].src = "";
    electron.ipcRenderer.invoke('newVideoId', currentlyPlaying).then((id) => {
        let videoInfo, videoSRC;
        //grab video info and file location based on whether it is a custom video or not
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
        //load video in video player
        containers[videoContainer].videoId = id;
        containers[videoContainer].src = videoSRC;
        containers[videoContainer].playbackRate = Number(electron.store.get('playbackSpeed'));
        containers[videoContainer].pause();

        if (callback) {
            callback();
        }
    });
}

function playVideo(videoContainer, loadedCallback) {
    if (blackScreen) {
        return
    }
    let id = containers[videoContainer].videoId;

    /*containers[videoContainer].addEventListener('durationchange', () => {
        if (loadedCallback) {
            loadedCallback();
        }
    });*/

    let videoInfo;
    if (id[0] === "_") {
        videoInfo = customVideos[customVideos.findIndex((e) => {
            if (id === e.id) {
                return true;
            }
        })];
    } else {
        let index = videos.findIndex((e) => {
            if (id === e.id) {
                return true;
            }
        });
        videoInfo = videos[index];
    }
    currentlyPlaying = videoInfo.id;
    containers[videoContainer].play();
    containers[videoContainer].playbackRate = Number(electron.store.get('playbackSpeed'));

    //display text
    for (let position of displayText.positionList) {
        let textArea = $(`#textDisplay-${position}`);
        if (displayText[position].type === "information") {
            if (displayText[position].infoType === "poi") {
                if (videoInfo["pointsOfInterest"] !== undefined) {
                    changePOI(position, -1, videoInfo["pointsOfInterest"]);
                } else {
                    changePOI(position, -1, {"0": ""});
                }
            } else {
                textArea.text(videoInfo[displayText[position].infoType]);
            }
        }
        textArea.css('width', displayText[position].maxWidth ? displayText[position].maxWidth : "50%")
    }

    if (loadedCallback) {
        loadedCallback();
    }
}

let videoWaitingTimeout;

function newVideo() {
    prepVideo(prePlayer, () => {
        clearTimeout(videoWaitingTimeout);
        videoWaitingTimeout = setTimeout(() => {
            console.log("hi");
            playVideo(prePlayer, () => {
                clearTimeout(transitionTimeout);
                if (!videoQuality) {
                    fadeVideoIn(transitionLength);
                    setTimeout(() => {
                        newVideo();
                    }, (containers[prePlayer].duration * 1000) - transitionLength - 500);
                }
            });
        }, 500);
    });
}

function switchVideoContainers() {
    containers[currentPlayer].pause();
    let temp = currentPlayer;
    currentPlayer = prePlayer;
    transitionPercent = 1;
    prePlayer = temp;
}

let transitionLength = electron.store.get('videoTransitionLength');
let transitionPercent = 1;

function fadeVideoOut(time) {
    if (time > 0) {
        transitionTimeout = setTimeout(fadeVideoOut, 16, time - 16);
    }
    transitionPercent = time / transitionLength;
    if (transitionPercent <= 0) {
        transitionPercent = 0;
        clearTimeout(transitionTimeout);
    } else if (transitionPercent >= 1) {
        transitionPercent = 1;
    }
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
    transitionPercent = 1 - (time / transitionLength);
    if (transitionPercent <= 0) {
        transitionPercent = 0;
    } else if (transitionPercent >= 1) {
        transitionPercent = 1;
        clearTimeout(transitionTimeout);
        switchVideoContainers();
    }
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

let transitionType = "fade";

//put the video on the canvas
function drawVideo() {
    ctx1.reset();
    ctx1.globalCompositeOperation = "source-over";
    ctx1.globalAlpha = 1;
    if (transitionPercent < 1) {
        switch (transitionType) {
            case "fade":
                ctx1.drawImage(containers[currentPlayer], 0, 0, window.innerWidth, window.innerHeight);
                ctx1.globalCompositeOperation = "destination-out";
                ctx1.fillStyle = `rgba(0,0,0,${transitionPercent})`;
                ctx1.rect(0, 0, window.innerWidth, window.innerHeight);
                ctx1.fill();
                ctx1.globalCompositeOperation = "destination-over";
                ctx1.drawImage(containers[prePlayer], 0, 0, window.innerWidth, window.innerHeight);
                break;
            case "dip-to-black":
                if (transitionPercent <= .5) {
                    ctx1.drawImage(containers[currentPlayer], 0, 0, window.innerWidth, window.innerHeight);
                    ctx1.globalCompositeOperation = "destination-out";
                    ctx1.fillStyle = `rgba(0,0,0,${transitionPercent * 2})`;
                    ctx1.rect(0, 0, window.innerWidth, window.innerHeight);
                    ctx1.fill();
                    ctx1.globalCompositeOperation = "destination-over";
                    ctx1.fillStyle = `rgb(0, 0, 0)`;
                    ctx1.rect(0, 0, window.innerWidth, window.innerHeight);
                    ctx1.fill();
                } else {
                    ctx1.fillStyle = `rgb(0, 0, 0)`;
                    ctx1.rect(0, 0, window.innerWidth, window.innerHeight);
                    ctx1.fill();
                    ctx1.globalCompositeOperation = "destination-out";
                    ctx1.fillStyle = `rgba(0,0,0,${(transitionPercent - .5) * 2})`;
                    ctx1.rect(0, 0, window.innerWidth, window.innerHeight);
                    ctx1.fill();
                    ctx1.globalCompositeOperation = "destination-over";
                    ctx1.drawImage(containers[prePlayer], 0, 0, window.innerWidth, window.innerHeight);
                }
                break;
            case"fade-left":
                ctx1.drawImage(containers[prePlayer], 0, 0, window.innerWidth, window.innerHeight);
                ctx1.globalCompositeOperation = "destination-out";
                let gradient = ctx1.createLinearGradient(0, window.innerHeight / 2, window.innerWidth, window.innerHeight / 2);
                gradient.addColorStop(transitionPercent, "rgba(0,0,0,0)");
                gradient.addColorStop(transitionPercent + .15 > 1 ? 1 : transitionPercent + .15, `rgba(0, 0, 0, 1)`);
                ctx1.fillStyle = gradient;
                ctx1.rect(0, 0, window.innerWidth, window.innerHeight);
                ctx1.fill();
                ctx1.globalCompositeOperation = "destination-over";
                ctx1.drawImage(containers[currentPlayer], 0, 0, window.innerWidth, window.innerHeight);
                break;
            case"fade-right":
                ctx1.drawImage(containers[prePlayer], 0, 0, window.innerWidth, window.innerHeight);
                ctx1.globalCompositeOperation = "destination-out";
                let gradient2 = ctx1.createLinearGradient(0, window.innerHeight / 2, window.innerWidth, window.innerHeight / 2);
                gradient2.addColorStop(1 - transitionPercent, "rgba(0,0,0,0)");
                gradient2.addColorStop(1 - (transitionPercent + .15 > 1 ? 1 : transitionPercent + .15), `rgba(0, 0, 0, 1)`);
                ctx1.fillStyle = gradient2;
                ctx1.rect(0, 0, window.innerWidth, window.innerHeight);
                ctx1.fill();
                ctx1.globalCompositeOperation = "destination-over";
                ctx1.drawImage(containers[currentPlayer], 0, 0, window.innerWidth, window.innerHeight);
                break;
            case"fade-top-left":
                ctx1.drawImage(containers[prePlayer], 0, 0, window.innerWidth, window.innerHeight);
                ctx1.globalCompositeOperation = "destination-out";
                let gradient3 = ctx1.createLinearGradient(0, 0, window.innerWidth, window.innerHeight);
                gradient3.addColorStop(transitionPercent, "rgba(0,0,0,0)");
                gradient3.addColorStop(transitionPercent + .15 > 1 ? 1 : transitionPercent + .15, `rgba(0, 0, 0, 1)`);
                ctx1.fillStyle = gradient3;
                ctx1.rect(0, 0, window.innerWidth, window.innerHeight);
                ctx1.fill();
                ctx1.globalCompositeOperation = "destination-over";
                ctx1.drawImage(containers[currentPlayer], 0, 0, window.innerWidth, window.innerHeight);
                break;
            case "wipe-left":
                ctx1.clearRect(0, 0, window.innerWidth, window.innerHeight);
                ctx1.drawImage(containers[prePlayer], 0, 0, window.innerWidth, window.innerHeight);
                ctx1.globalCompositeOperation = "destination-in";
                ctx1.globalAlpha = 1;
                ctx1.fillStyle = "#000000";
                ctx1.rect(0, 0, window.innerWidth * transitionPercent, window.innerHeight);
                ctx1.fill();
                ctx1.globalCompositeOperation = "destination-over";
                ctx1.drawImage(containers[currentPlayer], 0, 0, window.innerWidth, window.innerHeight);
                break;
            case "wipe-right":
                ctx1.drawImage(containers[prePlayer], 0, 0, window.innerWidth, window.innerHeight);
                ctx1.globalCompositeOperation = "destination-in";
                ctx1.fillStyle = "#000000";
                ctx1.rect(window.innerWidth - (window.innerWidth * transitionPercent), 0, window.innerWidth, window.innerHeight);
                ctx1.fill();
                ctx1.globalCompositeOperation = "destination-over";
                ctx1.drawImage(containers[currentPlayer], 0, 0, window.innerWidth, window.innerHeight);
                break;
            case "circle":
                ctx1.drawImage(containers[prePlayer], 0, 0, window.innerWidth, window.innerHeight);
                let maxBound = window.innerWidth > window.innerHeight ? window.innerWidth : window.innerHeight;
                let rad = maxBound * (transitionPercent > 1 ? 1 : transitionPercent < 0 ? 0 : transitionPercent);
                ctx1.fillStyle = "#000000";
                ctx1.globalCompositeOperation = "destination-in";
                ctx1.arc(window.innerWidth / 2, window.innerHeight / 2, rad, 0, Math.PI * 2);
                ctx1.fill();
                ctx1.globalCompositeOperation = "destination-over";
                ctx1.drawImage(containers[currentPlayer], 0, 0, window.innerWidth, window.innerHeight);
                break;
            case "reverse-circle":
                ctx1.drawImage(containers[prePlayer], 0, 0, window.innerWidth, window.innerHeight);
                let rmaxBound = window.innerWidth > window.innerHeight ? window.innerWidth : window.innerHeight;
                let rrad = rmaxBound * (1 - (transitionPercent > 1 ? 1 : transitionPercent < 0 ? 0 : transitionPercent));
                ctx1.globalAlpha = 1;
                ctx1.fillStyle = "#000000";
                ctx1.globalCompositeOperation = "destination-out";
                ctx1.arc(window.innerWidth / 2, window.innerHeight / 2, rrad, 0, Math.PI * 2);
                ctx1.fill();
                ctx1.globalCompositeOperation = "destination-over";
                ctx1.drawImage(containers[currentPlayer], 0, 0, window.innerWidth, window.innerHeight);
                break;
        }
    } else {
        ctx1.drawImage(containers[currentPlayer], 0, 0, window.innerWidth, window.innerHeight);
    }
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

// Fix for issue #110
// Replace requestAnimationFrame with our own that never sleeps
const drawVideoRequests = [];
const animationFPS = electron.store.get("fps")
const useAlternateRenderMethod = electron.store.get("alternateRenderMethod")
let videoQuality = electron.store.get("videoQuality");

if (useAlternateRenderMethod) {
    function getAnimationFrame(start) {
        let time = start;
        const fns = drawVideoRequests.slice();
        drawVideoRequests.length = 0;

        const t = performance.now();
        const dt = t - start;
        const t1 = 1e3 / animationFPS; //60 FPS;

        for (const f of fns) f(dt);

        while (time <= t + t1 / 4) time += t1;
        setTimeout(getAnimationFrame, time - t, performance.now());
    }

    function requestAnimationFrame(func) {
        drawVideoRequests.push(func);
        return drawVideoRequests.length - 1;
    }

    if (videoQuality) {
        $('#video').css('display', '');
    } else {
        getAnimationFrame(performance.now());
        drawVideo();
    }
} else {
    if (videoQuality) {
        $('#video').css('display', '');
    } else {
        drawVideo();
    }
}

function runClock(position, line, timeString) {
    if (blackScreen) {
        return
    }
    $(`#${position}-${line}-clock`).text(moment().format(timeString));
    displayText[position][line].clockTimeout = setTimeout(runClock, 1000 - new Date().getMilliseconds(), position, line, timeString);
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
    if (position !== "random") {
        displayTextPosition(position);
    }
}

function displayTextPosition(position, displayLocation) {
    let selector = displayLocation ? `#textDisplay-${displayLocation}` : `#textDisplay-${position}`;
    let html = "";
    for (let i = 0; i < displayText[position].length; i++) {
        html += `<div id="${position}-${i}">${createContentLine(displayText[position][i], position, i)}</div>`;
    }
    $(selector).html(html);
    for (let i = 0; i < displayText[position].length; i++) {
        if (!displayText[position][i].defaultFont) {
            $(`#${position}-${i}`).css('font-family', `"${displayText[position][i].font}"`).css('font-size', `${displayText[position][i].fontSize}vw`).css('color', `${displayText[position][i].fontColor}`);
        }
    }
}

function createContentLine(contentLine, position, line) {
    let html = "";
    switch (contentLine.type) {
        case "none":
            break;
        case "text":
            html += contentLine.text;
            break;
        case "html":
            html += contentLine.html;
            break;
        case "image":
            html += `<img src="${contentLine.imagePath}" alt="There was an error displaying this image"
                    ${contentLine.imageWidth == "" ? "" : `height=${contentLine.imageWidth}`} 
                    />`;
            break;
        case "time":
            html += `<div id=${position}-${line}-clock></div>`;
            runClock(position, line, contentLine.timeString);
            break;
        case "astronomy":
            const astronomy = electron.store.get("astronomy");
            let type = contentLine.astronomy;
            if (contentLine.astronomy === "sunrise/set") {
                if (new Date() < new Date(astronomy.sunrise) || new Date() > new Date(astronomy.sunset)) {
                    type = "sunrise";
                } else {
                    type = "sunset";
                }
            }
            if (contentLine.astronomy === "moonrise/set") {
                if (new Date() < new Date(astronomy.moonrise) && new Date() > new Date(astronomy.moonset)) {
                    type = "moonrise";
                } else {
                    type = "moonset";
                }
            }
            switch (type) {
                case "sunrise":
                    html += "Sunrise @"
                    break
                case "sunset":
                    html += "Sunset @"
                    break
                case "moonrise":
                    html += "Moonrise @"
                    break
                case "moonset":
                    html += "Moonset @"
                    break
            }
            let eventTime = moment(astronomy[type]);
            html += eventTime.format(contentLine.astroTimeString);
            break;
    }
    return html;
}

//Random is broken. Remove this when it is fixed.
let random = false;
for (let i = 0; i < displayText.random.length; i++) {
    if (displayText.random[i].type !== "none") {
        random = true;
    }
}
if (random) {
    displayText.random.currentLocation = "none";
    switchRandomText();
    let randomInterval = setInterval(switchRandomText, electron.store.get('randomSpeed') * 1000);
}

function switchRandomText() {
    let newLoc = false;
    let c = 0;
    do {
        if (c > 100) {
            console.log("overload");
            break;
        }
        newLoc = displayText.positionList[randomInt(0, displayText.positionList.length - 1)];
        let text = false;
        for (let i = 0; i < displayText[newLoc].length; i++) {
            if (displayText[newLoc][i].type !== "none") {
                text = true;
            }
        }
        if (text || displayText.random.currentLocation === newLoc) {
            newLoc = false;
            continue;
        }
        if (displayText.random[0].type === "time" && displayText.random.currentLocation !== "none") {
            clearTimeout(displayText[displayText.random.currentLocation].clockTimeout);
        }
        $(`#textDisplay-${displayText.random.currentLocation}`).html("");
        displayText.random.currentLocation = newLoc;
        displayTextPosition("random", newLoc);
        c++;
    } while (!newLoc);
}

function randomInt(min, max) {
    return Math.floor(Math.random() * max) - min;
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
        video2.src = "";
    }, transitionLength);
});