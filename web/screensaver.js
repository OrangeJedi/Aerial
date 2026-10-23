const videos = electron.videos;
const customVideos = electron.store.get('customVideos') || [];
const containers = [document.getElementById('video'), document.getElementById('video2')];
const stage = document.getElementById('videoStage');
let currentlyPlaying = '';
let screenNumber = null;
let blackScreen = false;
let poiTimeout = [];
let currentPlayer = 0;
let generation = 0;
let preparingVideo = false;
let nextTimer;
let transitionFrame;
let activeTransition;
let recoveryPending = false;
const easierTransitions = electron.store.get('easierTransitions') === true;
const duration = Math.max(0, Number(electron.store.get('videoTransitionLength')) || 0);
const playbackRate = Math.max(0.1, Number(electron.store.get('playbackSpeed')) || 1);
const filters = (electron.store.get('videoFilters') || [])
    .filter(filter => filter.value !== filter.defaultValue)
    .map(filter => filter.name + '(' + filter.value + filter.suffix + ')').join(' ');
for (const player of containers) {
    player.style.objectFit = electron.store.get('fillMode') === 'crop' ? 'cover' : 'fill';
    player.style.filter = filters || 'none';
    player.muted = true;
}

function quitApp() {
    electron.ipcRenderer.send('quitApp');
}
document.addEventListener('keydown', event => electron.ipcRenderer.send('keyPress', event.code));
document.addEventListener('mousedown', quitApp);
setTimeout(() => {
    document.addEventListener('mousemove', event => {
        if (event.movementX ** 2 + event.movementY ** 2 > 25) {
            quitApp();
        }
    });
}, 1500);

function resetLayer(player) {
    player.style.opacity = '1';
    player.style.clipPath = 'none';
    player.style.webkitMaskImage = 'none';
}

function stopTransition() {
    cancelAnimationFrame(transitionFrame);
    if (activeTransition) {
        activeTransition.cancel();
        activeTransition = null;
    }
}

function scheduleNext() {
    clearTimeout(nextTimer);
    const player = containers[currentPlayer];
    if (Number.isFinite(player.duration)) {
        nextTimer = setTimeout(newVideo, Math.max(500,
            (player.duration - player.currentTime) * 1000 / player.playbackRate - duration - 500));
    }
}

// CSS handles all pixels; this loop only advances transition properties.
async function transitionTo(target, token) {
    const outgoing = containers[currentPlayer];
    const incoming = containers[target];
    const types = ['dissolve', 'dipToBlack', 'fade', 'wipe', 'circle', 'fadeCircle'];
    let type = electron.store.get('transitionType');
    if (type === 'random') {
        type = types[randomInt(0, types.length)];
    }
    const directions = ['left', 'right', 'top', 'bottom'];
    let direction = electron.store.get('transitionDirection');
    if (direction === 'random') {
        direction = (type === 'circle' || type === 'fadeCircle')
            ? (Math.random() < 0.5 ? 'normal' : 'reverse') : directions[randomInt(0, directions.length)];
    }
    resetLayer(incoming);
    incoming.style.visibility = 'visible';
    incoming.style.zIndex = '1';
    outgoing.style.zIndex = '0';
    incoming.pause();
    const started = performance.now();
    let switched = false;
    let textUpdated = false;
    let playPromise = Promise.resolve();
    let playDeadline;
    return new Promise((resolve, reject) => {
        activeTransition = {cancel: () => {
            clearTimeout(playDeadline);
            reject(new Error('Playback cancelled'));
        }};
        function tick(now) {
            if (token !== generation || blackScreen) {
                reject(new Error('Playback cancelled'));
                return;
            }
            const progress = duration ? Math.min(1, (now - started) / duration) : 1;
            if (!textUpdated && progress >= 0.33) {
                textUpdated = true;
                drawDynamicText();
            }
            if (!switched && (!easierTransitions || progress >= 0.5)) {
                switched = true;
                if (easierTransitions) {
                    outgoing.pause();
                }
                playPromise = new Promise((resolvePlay, rejectPlay) => {
                    playDeadline = setTimeout(() => rejectPlay(new Error('Video did not start')), 10000);
                    incoming.play().then(resolvePlay, rejectPlay);
                }).finally(() => clearTimeout(playDeadline));
                playPromise.catch(reject);
            }
            if (type === 'dipToBlack') {
                outgoing.style.opacity = String(Math.max(0, 1 - progress * 2));
                incoming.style.opacity = String(Math.max(0, progress * 2 - 1));
            } else if (type === 'wipe') {
                const hidden = (1 - progress) * 100;
                const edges = {left: '0 ' + hidden + '% 0 0', right: '0 0 0 ' + hidden + '%',
                    top: '0 0 ' + hidden + '% 0', bottom: hidden + '% 0 0 0'};
                incoming.style.clipPath = 'inset(' + (edges[direction] || edges.left) + ')';
            } else if (type === 'circle' || type === 'fadeCircle') {
                const reverse = direction === 'reverse';
                const radius = Math.hypot(innerWidth, innerHeight) / 2;
                const value = radius * (reverse ? 1 - progress : progress);
                if (type === 'circle' && !reverse) {
                    incoming.style.clipPath = 'circle(' + value + 'px at center)';
                } else {
                    const inside = reverse ? 'transparent' : 'black';
                    const outside = reverse ? 'black' : 'transparent';
                    const feather = type === 'fadeCircle' ? radius * 0.05 : 0;
                    incoming.style.webkitMaskImage = 'radial-gradient(circle at center, ' + inside + ' '
                        + Math.max(0, value - feather) + 'px, ' + outside + ' ' + value + 'px)';
                }
            } else if (type === 'fade') {
                const angles = {left: 'to right', right: 'to left', top: 'to bottom', bottom: 'to top',
                    'top-left': 'to bottom right', 'top-right': 'to bottom left',
                    'bottom-left': 'to top right', 'bottom-right': 'to top left'};
                incoming.style.webkitMaskImage = 'linear-gradient(' + (angles[direction] || 'to right')
                    + ', black ' + (progress * 115 - 15) + '%, transparent ' + (progress * 115) + '%)';
            } else {
                incoming.style.opacity = String(progress);
            }
            if (progress < 1) {
                transitionFrame = requestAnimationFrame(tick);
            } else {
                playPromise.then(() => {
                    if (token !== generation || blackScreen) {
                        reject(new Error('Playback cancelled'));
                        return;
                    }
                    outgoing.pause();
                    outgoing.style.visibility = 'hidden';
                    resetLayer(outgoing);
                    resetLayer(incoming);
                    currentPlayer = target;
                    videoPlayback.cancel(outgoing);
                    outgoing.removeAttribute('src');
                    outgoing.load();
                    activeTransition = null;
                    resolve();
                }, reject);
            }
        }
        tick(started);
    });
}

async function newVideo(recover = false) {
    if (blackScreen) {
        return;
    }
    const token = ++generation;
    stopTransition();
    clearTimeout(nextTimer);
    preparingVideo = true;
    const target = 1 - currentPlayer;
    const player = containers[target];
    videoPlayback.cancel(player);
    player.pause();
    player.style.visibility = 'hidden';
    resetLayer(containers[currentPlayer]);
    let selectedId;
    try {
        const id = recover ? currentlyPlaying : await electron.ipcRenderer.invoke('newVideoId', currentlyPlaying);
        if (token !== generation || blackScreen) {
            return;
        }
        if (!recover) {
            failedSources = [];
        }
        selectedId = id;
        const info = (id.startsWith('_') ? customVideos : videos).find(video => video.id === id);
        await videoPlayback.load(player, info, status => {
            if (token === generation) {
                $('#playbackStatus').text(status);
            }
        }, {skipSources: recover ? failedSources : []});
        if (token !== generation || blackScreen) {
            return;
        }
        player.playbackRate = playbackRate;
        // Easier Transitions holds the loaded first frame until the midpoint.
        currentlyPlaying = id;
        await transitionTo(target, token);
        if (token === generation) {
            preparingVideo = false;
            recoveryPending = false;
            scheduleNext();
        }
    } catch (error) {
        if (token === generation && !blackScreen && error.message !== 'Playback cancelled') {
            preparingVideo = false;
            recoveryPending = false;
            stopTransition();
            player.pause();
            player.style.visibility = 'hidden';
            resetLayer(containers[currentPlayer]);
            if (player.playbackSource && !failedSources.includes(player.playbackSource)) {
                failedSources.push(player.playbackSource);
                currentlyPlaying = selectedId;
                return newVideo(true);
            }
            console.error('VIDEO PLAYBACK ERROR', error);
            $('#playbackStatus').text('Unable to play this video. Trying another...');
            nextTimer = setTimeout(newVideo, 3000);
        }
    }
}

let failedSources = [];
function recoverPlayback() {
    if (preparingVideo || recoveryPending || blackScreen) {
        return;
    }
    recoveryPending = true;
    failedSources.push(containers[currentPlayer].playbackSource);
    newVideo(true);
}
for (const player of containers) {
    player.addEventListener('ended', () => {
        if (player === containers[currentPlayer] && !preparingVideo && !blackScreen) {
            newVideo();
        }
    });
    player.addEventListener('error', () => {
        if (player === containers[currentPlayer]) {
            recoverPlayback();
        }
    });
}
let health = null;
setInterval(() => {
    const player = containers[currentPlayer];
    if (preparingVideo || blackScreen || player.paused || player.ended) {
        health = null;
        return;
    }
    const quality = player.getVideoPlaybackQuality();
    if (health && health.source === player.src) {
        const total = quality.totalVideoFrames - health.total;
        const dropped = quality.droppedVideoFrames - health.dropped;
        const stalled = player.currentTime <= health.time + 0.05;
        health.bad = stalled || (total > 20 && dropped / total > 0.15) ? health.bad + 1 : 0;
        if (health.bad >= 2) {
            recoverPlayback();
        }
    } else {
        health = {source: player.src, bad: 0};
    }
    health.time = player.currentTime;
    health.total = quality.totalVideoFrames;
    health.dropped = quality.droppedVideoFrames;
}, 3000);

function drawDynamicText() {
    poiTimeout = clearTimeouts(poiTimeout);
    const videoInfo = (currentlyPlaying.startsWith('_') ? customVideos : videos)
        .find(video => video.id === currentlyPlaying);

    //exit the function if no video info is found
    if (!videoInfo) {
        return;
    }

    for (let position of displayText.positionList) {
        for (let i = 0; i < displayText[position].length; i++) {
            let line = displayText[position][i];
            const textArea = $(`#${position}-${i}`);
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

function changePOI(position, line, currentPOI, poiList) {
    let poiS = Object.keys(poiList);
    for (let i = 0; i < poiS.length; i++) {
        if (Number(poiS[i]) > currentPOI) {
            $(`#${position}-${line}`).text(poiList[poiS[i]]);
            if (i < poiS.length - 1) {
                poiTimeout.push(setTimeout(changePOI, (Number(poiS[i + 1]) - Number(poiS[i])) * 1000 / playbackRate || 0, position, line, poiS[i], poiList));
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
    html = "";
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
    setInterval(switchRandomText, electron.store.get('randomSpeed') * 1000);
}

function switchRandomText() {
    let newLoc = false;
    let c = 0;
    do {
        c++;
        if (c > 100) {
            console.error("random overload - nowhere to go");
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
    } while (!newLoc);
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}


newVideo();
electron.ipcRenderer.on('newVideo', () => newVideo());
electron.ipcRenderer.on('blankTheScreen', () => {
    blackScreen = true;
    generation++;
    stopTransition();
    clearTimeout(nextTimer);
    poiTimeout = clearTimeouts(poiTimeout);
    containers.forEach(player => {
        videoPlayback.cancel(player);
        player.pause();
    });
    $('#playbackStatus').text('');
    stage.style.transition = 'opacity ' + duration + 'ms linear';
    stage.style.opacity = '0';
    $('#textDisplayArea').css({transition: 'opacity ' + duration + 'ms linear', opacity: 0});
    setTimeout(() => containers.forEach(player => {
        player.removeAttribute('src');
        player.load();
    }), duration);
});
electron.ipcRenderer.on('screenNumber', number => {
    screenNumber = number;
    renderText();
});
