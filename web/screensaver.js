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
let screenNumber = null;
let randomType, randomDirection;

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
    video.addEventListener('play', () => {
        video.style.backgroundColor = "black";
    });
    video.addEventListener("error", videoError);
});

function videoError(event) {
    if (event.srcElement === containers[currentPlayer]) {
        setTimeout(() => {
            if (event.srcElement.currentTime === 0) {
                console.log('VIDEO PLAYBACK ERROR', event.target.error.message, event);
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
            videoSRC = videoInfo.src[electron.store.get('videoFileType')];
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

    currentlyPlaying = containers[videoContainer].videoId;
    containers[videoContainer].play();
    containers[videoContainer].playbackRate = Number(electron.store.get('playbackSpeed'));

    if (loadedCallback) {
        loadedCallback();
    }
}

let videoWaitingTimeout;

function newVideo() {
    prepVideo(prePlayer, () => {
        clearTimeout(videoWaitingTimeout);
        //give time for the video to load before tying to play it
        videoWaitingTimeout = setTimeout(() => {
            playVideo(prePlayer, () => {
                clearTimeout(transitionTimeout);
                fadeVideoIn(transitionLength);
                //wait until the video is fully loaded before setting the end of video timeout
                setTimeout(() => {
                    //call a new video when the current one is over
                    setTimeout(() => {
                        newVideo();
                        numErrors = 0;
                    }, (containers[prePlayer].duration * 1000) - transitionLength - 500);
                }, 1000);
            });
        }, 500);
    });
}

function switchVideoContainers() {
    if (videoQuality) {
        containers[currentPlayer].style.display = 'none';
        containers[prePlayer].style.display = '';
    }
    containers[currentPlayer].pause();
    let temp = currentPlayer;
    currentPlayer = prePlayer;
    transitionPercent = 1;
    prePlayer = temp;
}

function drawDynamicText() {
    let videoInfo;
    if (currentlyPlaying[0] === "_") {
        videoInfo = customVideos[customVideos.findIndex((e) => {
            if (currentlyPlaying === e.id) {
                return true;
            }
        })];
    } else {
        let index = videos.findIndex((e) => {
            if (currentlyPlaying === e.id) {
                return true;
            }
        });
        videoInfo = videos[index];
    }

    //exit the function if no video info is found
    if (!videoInfo) {
        return;
    }

    for (let position of displayText.positionList) {
        for (let i = 0; i < displayText[position].length; i++) {
            let line = displayText[position][i];
            let textArea;
            if (position !== "random") {
                textArea = $(`#${position}-${i}`);
            } else {
                textArea = $(`#${position}-${i}`);
            }
            if (line.type === "information") {
                if (line.infoType === "poi" && position !== "random") {
                    if (videoInfo["pointsOfInterest"] !== undefined) {
                        changePOI(position, i, -1, videoInfo["pointsOfInterest"]);
                    } else {
                        changePOI(position, i, -1, {"0": ""});
                    }
                } else {
                    textArea.text(videoInfo[line.infoType]);
                }
                $(`#textDisplayArea-${position}`).css('width', line.maxWidth ? displayText[position].maxWidth : "50%");
            }
        }
    }
}

let transitionLength = electron.store.get('videoTransitionLength');
let transitionPercent = 1;
let transitionSource = "";

function fadeVideoOut(time) {
    transitionSource = "fadeout";
    if (time > 0) {
        transitionTimeout = setTimeout(fadeVideoOut, 16, time - 16);
    }
    transitionPercent = time / transitionLength;
    if (transitionPercent <= 0) {
        transitionPercent = 0;
        clearTimeout(transitionTimeout);
        setTimeout(() => {
            transitionSource = ""
        }, 1000);
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
    if (time === transitionLength) {
        if (transitionSettings.type === "random") {
            randomType = true;
            transitionSettings.type = transitionTypes[randomInt(0, transitionTypes.length)];
            transitionSettings.direction = transitionDirections[transitionSettings.type][randomInt(0, transitionDirections[transitionSettings.type].length)];
        }
        if (transitionSettings.direction === "random") {
            randomDirection = true;
            transitionSettings.direction = transitionDirections[transitionSettings.type][randomInt(0, transitionDirections[transitionSettings.type].length)];
        }
    }
    if (time > 0) {
        transitionTimeout = setTimeout(fadeVideoIn, 16, time - 16);
    }
    transitionPercent = 1 - (time / transitionLength);

    //update dynamic video text 1/3 of the way through the transition
    if (transitionPercent >= .33) {
        drawDynamicText();
    }
    if (transitionPercent <= 0) {
        transitionPercent = 0;
    } else if (transitionPercent >= 1) {
        transitionPercent = 1;
        clearTimeout(transitionTimeout);
        switchVideoContainers();
        if (randomType) {
            transitionSettings.type = "random";
        }
        if (randomDirection) {
            transitionSettings.direction = "random";
        }
    }
}

function changePOI(position, line, currentPOI, poiList) {
    poiTimeout = clearTimeouts(poiTimeout);
    let poiS = Object.keys(poiList);
    for (let i = 0; i < poiS.length; i++) {
        if (Number(poiS[i]) > currentPOI) {
            $(`#${position}-${line}`).text(poiList[poiS[i]]);
            if (i < poiS.length - 1) {
                poiTimeout.push(setTimeout(changePOI, (Number(poiS[i + 1]) - Number(poiS[i])) * 1000 || 0, position, line, poiS[i], poiList));
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

const transitionTypes = ["dissolve", "dipToBlack", "fade", "wipe", "circle", "fadeCircle"];
const transitionDirections = {
    "dissolve": [""],
    "dipToBlack": [""],
    "fade": ["left", "right", "top", "down", "top-left", "top-right", "bottom-left", "bottom-right"],
    "wipe": ["left", "right", "top", "down"],
    "circle": ["normal", "reverse"],
    "fadeCircle": ["normal", "reverse"]
};
let transitionSettings = {
    "type": electron.store.get("transitionType"),
    "direction": electron.store.get("transitionDirection")
};

//put the video on the canvas
function drawVideo() {
    ctx1.reset();
    ctx1.filter = filterString;
    ctx1.globalCompositeOperation = "source-over";
    ctx1.globalAlpha = 1;
    if (transitionPercent < 1) {
        if (transitionSource === "fadeout") {
            drawImage(ctx1, containers[currentPlayer]);
            ctx1.fillStyle = `rgba(0,0,0,${1 - transitionPercent})`;
            ctx1.rect(0, 0, window.innerWidth, window.innerHeight);
            ctx1.fill();
        } else {
            let gradient, maxBound, rad;
            switch (transitionSettings.type) {
                case "dissolve":
                    if (containers[currentPlayer].paused) {
                        ctx1.fillStyle = `rgb(0, 0, 0)`;
                        ctx1.rect(0, 0, window.innerWidth, window.innerHeight);
                        ctx1.fill();
                    } else {
                        drawImage(ctx1, containers[currentPlayer]);
                    }
                    ctx1.globalCompositeOperation = "destination-out";
                    ctx1.fillStyle = `rgba(0,0,0,${transitionPercent})`;
                    ctx1.rect(0, 0, window.innerWidth, window.innerHeight);
                    ctx1.fill();
                    ctx1.globalCompositeOperation = "destination-over";
                    drawImage(ctx1, containers[prePlayer]);
                    break;
                case "dipToBlack":
                    if (transitionPercent <= .5) {
                        drawImage(ctx1, containers[currentPlayer]);
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
                        drawImage(ctx1, containers[prePlayer]);
                    }
                    break;
                case"fade":
                    drawImage(ctx1, containers[prePlayer]);
                    ctx1.globalCompositeOperation = "destination-out";
                    switch (transitionSettings.direction) {
                        case "left":
                            gradient = ctx1.createLinearGradient(0, window.innerHeight / 2, window.innerWidth, window.innerHeight / 2);
                            break;
                        case "right":
                            gradient = ctx1.createLinearGradient(window.innerWidth, window.innerHeight / 2, 0, window.innerHeight / 2);
                            break;
                        case "top":
                            gradient = ctx1.createLinearGradient(window.innerWidth / 2, 0, window.innerWidth / 2, window.innerHeight);
                            break;
                        case "bottom":
                            gradient = ctx1.createLinearGradient(window.innerWidth / 2, window.innerHeight, window.innerWidth / 2, 0);
                            break;
                        case "top-left":
                            gradient = ctx1.createLinearGradient(0, 0, window.innerWidth, window.innerHeight);
                            break;
                        case"top-right":
                            gradient = ctx1.createLinearGradient(window.innerWidth, 0, 0, window.innerHeight);
                            break;
                        case"bottom-left":
                            gradient = ctx1.createLinearGradient(0, window.innerHeight, window.innerWidth, 0);
                            break;
                        case"bottom-right":
                            gradient = ctx1.createLinearGradient(window.innerWidth, window.innerHeight, 0, 0,);
                            break;
                    }
                    gradient.addColorStop(transitionPercent, "rgba(0,0,0,0)");
                    gradient.addColorStop(transitionPercent + .15 > 1 ? 1 : transitionPercent + .15, `rgba(0, 0, 0, 1)`);
                    ctx1.fillStyle = gradient;
                    ctx1.rect(0, 0, window.innerWidth, window.innerHeight);
                    ctx1.fill();
                    ctx1.globalCompositeOperation = "destination-over";
                    drawImage(ctx1, containers[currentPlayer]);
                    break;
                case "wipe":
                    drawImage(ctx1, containers[prePlayer]);
                    ctx1.globalCompositeOperation = "destination-in";
                    ctx1.globalAlpha = 1;
                    ctx1.fillStyle = "#000000";
                    switch (transitionSettings.direction) {
                        case "left":
                            ctx1.rect(0, 0, window.innerWidth * transitionPercent, window.innerHeight);
                            break;
                        case "right":
                            ctx1.rect(window.innerWidth - (window.innerWidth * transitionPercent), 0, window.innerWidth, window.innerHeight);
                            break;
                        case "top":
                            ctx1.rect(0, 0, window.innerWidth, window.innerHeight * transitionPercent);
                            break;
                        case "bottom":
                            ctx1.rect(0, window.innerHeight - (window.innerHeight * transitionPercent), window.innerWidth, window.innerHeight);
                            break;
                    }

                    ctx1.fill();
                    ctx1.globalCompositeOperation = "destination-over";
                    drawImage(ctx1, containers[currentPlayer]);
                    break;
                case "circle":
                    if (transitionSettings.direction === 'normal') {
                        drawImage(ctx1, containers[prePlayer]);
                        maxBound = window.innerWidth > window.innerHeight ? window.innerWidth : window.innerHeight;
                        rad = maxBound * (transitionPercent > 1 ? 1 : transitionPercent < 0 ? 0 : transitionPercent);
                        ctx1.fillStyle = "#000000";
                        ctx1.globalCompositeOperation = "destination-in";
                        ctx1.arc(window.innerWidth / 2, window.innerHeight / 2, rad, 0, Math.PI * 2);
                        ctx1.fill();

                        ctx1.globalCompositeOperation = "destination-over";
                        drawImage(ctx1, containers[currentPlayer]);
                    } else {
                        drawImage(ctx1, containers[prePlayer]);
                        maxBound = window.innerWidth > window.innerHeight ? window.innerWidth : window.innerHeight;
                        rad = maxBound * (1 - (transitionPercent > 1 ? 1 : transitionPercent < 0 ? 0 : transitionPercent));
                        ctx1.fillStyle = "#000000";
                        ctx1.globalCompositeOperation = "destination-out";
                        ctx1.arc(window.innerWidth / 2, window.innerHeight / 2, rad, 0, Math.PI * 2);
                        ctx1.fill();
                        ctx1.globalCompositeOperation = "destination-over";
                        drawImage(ctx1, containers[currentPlayer]);
                    }
                    break;
                case "fadeCircle" :
                    drawImage(ctx1, containers[prePlayer]);
                    ctx1.globalCompositeOperation = "destination-out";
                    maxBound = window.innerWidth > window.innerHeight ? window.innerWidth : window.innerHeight;
                    switch (transitionSettings.direction) {
                        case "reverse":
                            gradient = ctx1.createRadialGradient(window.innerWidth / 2, window.innerHeight / 2, maxBound, window.innerWidth / 2, window.innerHeight / 2, 0);
                            break;
                        default:
                            gradient = ctx1.createRadialGradient(window.innerWidth / 2, window.innerHeight / 2, 0, window.innerWidth / 2, window.innerHeight / 2, maxBound);
                            break;
                    }
                    gradient.addColorStop(transitionPercent, "rgba(0,0,0,0)");
                    gradient.addColorStop(transitionPercent + .05 > 1 ? 1 : transitionPercent + .05, `rgba(0, 0, 0, 1)`);
                    ctx1.fillStyle = gradient;
                    ctx1.rect(0, 0, window.innerWidth, window.innerHeight);
                    ctx1.fill();
                    ctx1.globalCompositeOperation = "destination-over";
                    drawImage(ctx1, containers[currentPlayer]);
                    break;
            }
        }
    } else {
        drawImage(ctx1, containers[currentPlayer]);
        //ctx1.drawImage(containers[currentPlayer], 0, 0, window.innerWidth, window.innerHeight);
    }
    requestAnimationFrame(drawVideo);
}

//function to scale image properly when drawn
let aspectRatio = window.innerWidth / window.innerHeight;
let widthScale = window.innerWidth / ((16 / 9) * window.innerHeight);
let heightScale = window.innerHeight / (window.innerWidth / (16 / 9));

function drawImage(context, image) {
    if (electron.store.get("fillMode") === "stretch" || aspectRatio === 16 / 9) {
        //stretch
        context.drawImage(image, 0, 0, window.innerWidth, window.innerHeight);
    } else if (electron.store.get("fillMode") === "crop") {
        //crop
        if (widthScale > 1) {
            context.drawImage(image, 0, (image.videoHeight - image.videoHeight / widthScale) / 2, image.videoWidth, image.videoHeight / widthScale, 0, 0, window.innerWidth, window.innerHeight);
        } else {
            context.drawImage(image, (image.videoWidth - image.videoWidth / heightScale) / 2, 0, image.videoWidth / heightScale, image.videoHeight, 0, 0, window.innerWidth, window.innerHeight);
        }
    }
}

let c1 = document.getElementById('canvasVideo');
let ctx1 = c1.getContext('2d');
c1.width = window.innerWidth;
c1.height = window.innerHeight;
let videoFilters = electron.store.get('videoFilters');
let filterString = "";
for (let i = 0; i < videoFilters.length; i++) {
    if (videoFilters[i].value !== videoFilters[i].defaultValue) {
        filterString += `${videoFilters[i].name}(${videoFilters[i].value}${videoFilters[i].suffix}) `;
    }
}
ctx1.filter = filterString;

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

function renderText() {
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
}

function displayTextPosition(position, displayLocation) {
    let selector = displayLocation ? `#textDisplay-${displayLocation}` : `#textDisplay-${position}`;
    let html = "";
    for (let i = 0; i < displayText[position].length; i++) {
        if (displayText[position][i].onlyShowOnScreen === undefined || Number(displayText[position][i].onlyShowOnScreen) === Number(screenNumber)) {
            html += `<div id="${position}-${i}" style="${displayText[position][i].customCSS}">${createContentLine(displayText[position][i], position, i)}</div>`;
        }
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
        case "information":
            html += "<script>drawDynamicText()</script>";
            break;
    }
    return html;
}

let random = false;
for (let i = 0; i < displayText.random.length; i++) {
    if (displayText.random[i].type !== "none") {
        random = true;
    }
}
if (random) {
    displayText.random.currentLocation = "none";
    setTimeout(switchRandomText, 750);
    let randomInterval = setInterval(switchRandomText, electron.store.get('randomSpeed') * 1000);
}

function switchRandomText() {
    let newLoc = false;
    let c = 0;
    do {
        console.log("switching random text");
        if (c > 100) {
            console.log("random overload - nowhere to go");
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
    }, transitionLength + 750);
});

electron.ipcRenderer.on('screenNumber', (number) => {
    screenNumber = number;
    renderText();
});