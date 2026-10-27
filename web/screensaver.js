const videos = electron.videos;
const customVideos = electron.store.get('customVideos') || [];
const videosById = new Map([...videos, ...customVideos].map(video => [video.id, video]));
const containers = [document.getElementById('video'), document.getElementById('video2')];
const stage = document.getElementById('videoStage');
const textOverlay = document.getElementById('textDisplayArea');
let textRevealed = false;
let currentlyPlaying = '';
let displayedVideo = '';
let videoHistory = [];
let historyIndex = -1;
let screenNumber = null;
let blackScreen = false;
let poiTimeout = [];
let currentPlayer = 0;
let generation = 0;
let preparingVideo = false;
let nextTimer;
let preparationTimer;
let preparation;
let transitionFrame;
let activeTransition;
let recoveryPending = false;
const preparationLead = 10000;
const easierTransitions = electron.store.get('easierTransitions') === true;
const duration = electron.store.get('transitionType') === 'none'
    ? 0 : Math.max(0, Number(electron.store.get('videoTransitionLength')) || 0);
const filters = (electron.store.get('videoFilters') || [])
    .filter(filter => Number.isFinite(Number(filter.value)) && Number(filter.value) !== Number(filter.defaultValue))
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
if (electron.store.get('wakeOnMouseClick') !== false) {
    document.addEventListener('mousedown', quitApp);
}
if (electron.store.get('wakeOnMouseMovement') !== false) {
    setTimeout(() => {
        document.addEventListener('mousemove', event => {
            if (event.movementX ** 2 + event.movementY ** 2 > 25) {
                quitApp();
            }
        });
    }, 1500);
}

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

function discardPreparation() {
    if (preparation) {
        preparation.cancelled = true;
        videoPlayback.release(containers[preparation.target]);
        preparation = null;
        if (!blackScreen) {
            electron.ipcRenderer.send('videoPlaybackState', {playing: [displayedVideo], pending: null});
        }
    }
}

function prepareNext(id = null, skipSources = []) {
    if (preparation || blackScreen) {
        return preparation;
    }
    const job = {target: 1 - currentPlayer, id, cancelled: false};
    const player = containers[job.target];
    preparation = job;
    player.style.visibility = 'hidden';
    resetLayer(player);
    job.promise = (async () => {
        const requestedId = id || videoHistory[historyIndex + 1];
        job.id = await electron.ipcRenderer.invoke('newVideoId', requestedId
            ? {lastPlayed: currentlyPlaying, requestedId} : currentlyPlaying);
        if (job.cancelled || blackScreen) {
            throw new Error('Playback cancelled');
        }
        player.playbackStats = {};
        await videoPlayback.load(player, videosById.get(job.id), () => {}, {skipSources});
        if (job.cancelled || blackScreen) {
            throw new Error('Playback cancelled');
        }
        return job.id;
    })();
    // A preload may fail before the transition timer consumes its promise.
    job.promise.catch(() => {});
    return job;
}

function scheduleNext() {
    clearTimeout(nextTimer);
    clearTimeout(preparationTimer);
    const player = containers[currentPlayer];
    if (Number.isFinite(player.duration)) {
        const delay = Math.max(500,
            (player.duration - player.currentTime) * 1000 / player.playbackRate - duration - 500);
        preparationTimer = setTimeout(() => prepareNext(), Math.max(0, delay - preparationLead));
        nextTimer = setTimeout(newVideo, delay);
    }
}

// Opacity transitions use browser animations; masks update only during a transition.
function transitionTo(target, token) {
    const skipStartupTransition = electron.windowPreview && !textRevealed;
    const outgoing = containers[currentPlayer];
    const incoming = containers[target];
    const types = ['dissolve', 'dipToBlack', 'fade', 'wipe', 'circle', 'fadeCircle'];
    let type = skipStartupTransition ? 'none' : electron.store.get('transitionType');
    if (type === 'random') {
        type = types[randomInt(0, types.length)];
    }
    const singleVideo = easierTransitions || type === 'dipToBlack' || type === 'none';
    const directions = ['left', 'right', 'top', 'bottom'];
    let direction = electron.store.get('transitionDirection');
    if (direction === 'random') {
        direction = (type === 'circle' || type === 'fadeCircle')
            ? (Math.random() < 0.5 ? 'normal' : 'reverse') : directions[randomInt(0, directions.length)];
    }
    const angles = {left: 'to right', right: 'to left', top: 'to bottom', bottom: 'to top',
        'top-left': 'to bottom right', 'top-right': 'to bottom left',
        'bottom-left': 'to top right', 'bottom-right': 'to top left'};
    const angle = angles[direction] || angles.left;
    const radius = Math.hypot(innerWidth, innerHeight) / 2;
    const reverse = direction === 'reverse';
    const inside = reverse ? 'transparent' : 'black';
    const outside = reverse ? 'black' : 'transparent';
    const feather = type === 'fadeCircle' ? radius * 0.05 : 0;
    const wipes = {left: value => '0 ' + value + '% 0 0', right: value => '0 0 0 ' + value + '%',
        top: value => '0 0 ' + value + '% 0', bottom: value => value + '% 0 0 0'};
    const wipe = wipes[direction] || wipes.left;
    resetLayer(incoming);
    incoming.style.opacity = '0';
    incoming.style.visibility = 'visible';
    incoming.style.zIndex = '1';
    outgoing.style.zIndex = '0';
    incoming.pause();
    let started;
    let textUpdated = false;
    let playPromise;
    let playDeadline;
    let frameDeadline;
    let firstFrame;
    let settled = false;
    const animations = [];
    const timers = [];
    return new Promise((resolve, reject) => {
        function cleanup() {
            cancelAnimationFrame(transitionFrame);
            clearTimeout(playDeadline);
            clearTimeout(frameDeadline);
            if (firstFrame !== undefined) {
                incoming.cancelVideoFrameCallback(firstFrame);
            }
            timers.forEach(clearTimeout);
            animations.forEach(animation => animation.cancel());
            activeTransition = null;
        }
        function fail(error) {
            if (!settled) {
                settled = true;
                cleanup();
                reject(error);
            }
        }
        function updateText() {
            if (!settled && !textUpdated) {
                textUpdated = true;
                drawDynamicText();
            }
        }
        function startIncoming() {
            if (settled || playPromise) {
                return;
            }
            if (singleVideo) {
                outgoing.pause();
            }
            playPromise = new Promise((resolvePlay, rejectPlay) => {
                playDeadline = setTimeout(() => rejectPlay(new Error('Video did not start')), 10000);
                let playing = false;
                let presented = !incoming.requestVideoFrameCallback;
                function ready() {
                    if (playing && presented) {
                        resolvePlay();
                    }
                }
                if (!presented) {
                    firstFrame = incoming.requestVideoFrameCallback(() => {
                        firstFrame = undefined;
                        presented = true;
                        ready();
                    });
                }
                incoming.play().then(() => {
                    playing = true;
                    if (!presented) {
                        frameDeadline = setTimeout(() => {
                            presented = true;
                            ready();
                        }, 500);
                    }
                    ready();
                }, rejectPlay);
            }).finally(() => {
                clearTimeout(playDeadline);
                clearTimeout(frameDeadline);
                if (firstFrame !== undefined) {
                    incoming.cancelVideoFrameCallback(firstFrame);
                    firstFrame = undefined;
                }
            });
            playPromise.catch(fail);
        }
        function finish() {
            if (settled) {
                return;
            }
            startIncoming();
            playPromise.then(() => {
                if (settled) {
                    return;
                }
                if (token !== generation || blackScreen) {
                    fail(new Error('Playback cancelled'));
                    return;
                }
                outgoing.style.visibility = 'hidden';
                resetLayer(outgoing);
                resetLayer(incoming);
                // Keep the desktop visible until the first video has fully transitioned in.
                document.body.style.backgroundColor = 'black';
                if (!textRevealed) {
                    textRevealed = true;
                    if (skipStartupTransition) {
                        textOverlay.style.transition = 'none';
                    }
                    textOverlay.style.opacity = '1';
                }
                currentPlayer = target;
                displayedVideo = currentlyPlaying;
                videoPlayback.release(outgoing);
                settled = true;
                cleanup();
                resolve();
            }, fail);
        }
        activeTransition = {cancel: () => fail(new Error('Playback cancelled'))};
        function beginVisual() {
            if (settled) {
                return;
            }
            started = performance.now();
            if (!duration || type === 'none') {
                updateText();
                finish();
                return;
            }
            if (type === 'dissolve' || type === 'dipToBlack' || !types.includes(type)) {
                incoming.style.opacity = '0';
                const options = {duration, easing: 'linear', fill: 'both'};
                const keyframes = type === 'dipToBlack'
                    ? [{opacity: 0, offset: 0}, {opacity: 0, offset: 0.5}, {opacity: 1, offset: 1}]
                    : [{opacity: 0}, {opacity: 1}];
                animations.push(incoming.animate(keyframes, options));
                if (type === 'dipToBlack') {
                    animations.push(outgoing.animate([
                        {opacity: 1, offset: 0}, {opacity: 0, offset: 0.5}, {opacity: 0, offset: 1}
                    ], options));
                }
                timers.push(setTimeout(updateText, duration * 0.33));
                if (singleVideo) {
                    timers.push(setTimeout(startIncoming, duration / 2));
                } else {
                    startIncoming();
                }
                Promise.all(animations.map(animation => animation.finished)).then(finish, fail);
                return;
            }
            incoming.style.opacity = '1';
            tick(started);
        }
        function tick(now) {
            try {
                renderFrame(now);
            } catch (error) {
                fail(error);
            }
        }
        function renderFrame(now) {
            if (settled) {
                return;
            }
            if (token !== generation || blackScreen) {
                fail(new Error('Playback cancelled'));
                return;
            }
            const progress = Math.min(1, (now - started) / duration);
            if (progress >= 0.33) {
                updateText();
            }
            if (!singleVideo || progress >= 0.5) {
                startIncoming();
            }
            if (type === 'wipe') {
                incoming.style.clipPath = 'inset(' + wipe((1 - progress) * 100) + ')';
            } else if (type === 'circle' || type === 'fadeCircle') {
                const value = radius * (reverse ? 1 - progress : progress);
                if (type === 'circle' && !reverse) {
                    incoming.style.clipPath = 'circle(' + value + 'px at center)';
                } else {
                    incoming.style.webkitMaskImage = 'radial-gradient(circle at center, ' + inside + ' '
                        + Math.max(0, value - feather) + 'px, ' + outside + ' ' + value + 'px)';
                }
            } else if (type === 'fade') {
                incoming.style.webkitMaskImage = 'linear-gradient(' + angle
                    + ', black ' + (progress * 115 - 15) + '%, transparent ' + (progress * 115) + '%)';
            }
            if (progress < 1) {
                transitionFrame = requestAnimationFrame(tick);
            } else {
                finish();
            }
        }
        if (singleVideo) {
            beginVisual();
        } else {
            startIncoming();
            playPromise.then(beginVisual, fail);
        }
    });
}

async function newVideo(recover = false, navigationIndex = null) {
    if (blackScreen) {
        return;
    }
    if (!recover && navigationIndex === null && historyIndex < videoHistory.length - 1) {
        navigationIndex = historyIndex + 1;
    }
    const token = ++generation;
    stopFrameSample();
    health = null;
    stopTransition();
    clearTimeout(nextTimer);
    clearTimeout(preparationTimer);
    // A second skip can interrupt an active transition. Its spare is no longer usable.
    if (recover || preparingVideo || navigationIndex !== null) {
        discardPreparation();
    }
    preparingVideo = true;
    if (!recover) {
        failedSources = [];
    }
    const forcedId = navigationIndex !== null ? videoHistory[navigationIndex] : null;
    const job = preparation || prepareNext(recover ? currentlyPlaying : forcedId, recover ? failedSources : []);
    const player = containers[job.target];
    resetLayer(containers[currentPlayer]);
    let loaded = false;
    try {
        const id = await job.promise;
        if (token !== generation || blackScreen) {
            return;
        }
        loaded = true;
        if (recover && id !== currentlyPlaying) {
            recover = false;
        }
        if (navigationIndex !== null && id !== forcedId) {
            navigationIndex = null;
        }
        const outgoingId = displayedVideo;
        currentlyPlaying = id;
        electron.ipcRenderer.send('videoPlaybackState', {playing: [outgoingId, id], pending: id});
        await transitionTo(job.target, token);
        if (token === generation) {
            electron.ipcRenderer.send('videoPlaybackState', {playing: [id], pending: null});
            if (navigationIndex !== null) {
                historyIndex = navigationIndex;
            } else if (!recover) {
                videoHistory = videoHistory.slice(0, historyIndex + 1);
                videoHistory.push(id);
                videoHistory = videoHistory.slice(-100);
                historyIndex = videoHistory.length - 1;
            }
            preparation = null;
            preparingVideo = false;
            recoveryPending = false;
            scheduleNext();
        }
    } catch (error) {
        if (token === generation && !blackScreen && error.message !== 'Playback cancelled') {
            const source = player.playbackSource;
            preparingVideo = false;
            recoveryPending = false;
            stopTransition();
            player.style.visibility = 'hidden';
            discardPreparation();
            resetLayer(containers[currentPlayer]);
            if (loaded && source && !failedSources.includes(source)) {
                failedSources.push(source);
                videoPlayback.markFailed(job.id, source);
                currentlyPlaying = job.id;
                return newVideo(true, navigationIndex);
            }
            console.error('VIDEO PLAYBACK ERROR', error);
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
    const source = containers[currentPlayer].playbackSource;
    failedSources.push(source);
    videoPlayback.markFailed(currentlyPlaying, source);
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
let frameRequest;
function stopFrameSample() {
    if (frameRequest) {
        frameRequest.player.cancelVideoFrameCallback(frameRequest.id);
        frameRequest = null;
    }
}

// One frame callback per health sample, not a continuous per-frame loop.
function sampleFrame(player) {
    if (!player.requestVideoFrameCallback || frameRequest) {
        return;
    }
    const request = {player, source: player.playbackSource};
    frameRequest = request;
    request.id = player.requestVideoFrameCallback((now, metadata) => {
        if (frameRequest !== request) {
            return;
        }
        frameRequest = null;
        if (player.playbackSource !== request.source || player.paused) {
            return;
        }
        const stats = player.playbackStats;
        stats.presentedFps = stats.presentedAt !== undefined && stats.source === request.source
            ? (metadata.presentedFrames - stats.presentedFrames) * 1000 / (now - stats.presentedAt) : null;
        stats.source = request.source;
        stats.presentedFrames = metadata.presentedFrames;
        stats.presentedAt = now;
        stats.decodeMs = metadata.processingDuration === undefined ? null : metadata.processingDuration * 1000;
    });
}

for (const player of containers) {
    player.addEventListener('waiting', () => { player.playbackWaiting = true; });
    player.addEventListener('playing', () => { player.playbackWaiting = false; });
    player.addEventListener('emptied', () => { player.playbackWaiting = false; });
}
const healthInterval = setInterval(() => {
    const player = containers[currentPlayer];
    if (preparingVideo || blackScreen || player.paused || player.ended) {
        health = null;
        stopFrameSample();
        return;
    }
    const now = performance.now();
    const quality = player.getVideoPlaybackQuality();
    const buffered = videoPlayback.bufferedAhead(player);
    const buffering = player.playbackWaiting || player.readyState < 3 || buffered < 0.25;
    if (!health || health.player !== player || health.source !== player.src) {
        health = {player, source: player.src, bad: 0, bufferingSince: null};
    } else {
        const total = quality.totalVideoFrames - health.total;
        const dropped = quality.droppedVideoFrames - health.dropped;
        const stalled = player.currentTime <= health.time + 0.05;
        if (buffering) {
            health.bad = 0;
            health.bufferingSince = stalled ? (health.bufferingSince ?? now) : null;
            if (health.bufferingSince !== null && now - health.bufferingSince >= 15000) {
                recoverPlayback();
                return;
            }
        } else {
            health.bufferingSince = null;
            health.bad = stalled || (total > 20 && dropped / total > 0.15) ? health.bad + 1 : 0;
            if (health.bad >= 2) {
                recoverPlayback();
                return;
            }
        }
        player.playbackStats.droppedFrameRatio = total > 0 ? dropped / total : 0;
    }
    player.playbackStats ||= {};
    player.playbackStats.bufferedSeconds = buffered;
    player.playbackStats.buffering = Boolean(buffering);
    health.time = player.currentTime;
    health.total = quality.totalVideoFrames;
    health.dropped = quality.droppedVideoFrames;
    sampleFrame(player);
}, 3000);

function drawDynamicText() {
    poiTimeout = clearTimeouts(poiTimeout);
    const video = videosById.get(currentlyPlaying);

    //exit the function if no video info is found
    if (!video) {
        return;
    }
    const videoInfo = {...video, ...electron.videoText(video)};

    for (let position of displayText.positionList) {
        for (let i = 0; i < displayText[position].length; i++) {
            let line = displayText[position][i];
            if (!overlayVisibleOnScreen(position, line)) {
                continue;
            }
            const textArea = $(`#${position}-${i}`);
            if (line.type === "information") {
                textArea.attr('dir', 'auto');
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
            $(`#${position}-${line}`).attr('dir', 'auto').text(poiList[poiS[i]]);
            if (i < poiS.length - 1) {
                const rate = videoPlayback.speed(currentlyPlaying);
                poiTimeout.push(setTimeout(changePOI, (Number(poiS[i + 1]) - Number(poiS[i])) * 1000 / rate || 0, position, line, poiS[i], poiList));
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
        return;
    }
    clearTimeout(displayText[position][line].clockTimeout);
    $(`#${position}-${line}-clock`).text(localizedDateTime().format(timeString));
    displayText[position][line].clockTimeout = setTimeout(runClock, 1000 - new Date().getMilliseconds(), position, line, timeString);
}

//set up css
let localFontFaces = {};

function cssString(value) {
    return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function fontAlias(font) {
    let hash = 0;
    for (let i = 0; i < font.length; i++) {
        hash = ((hash << 5) - hash) + font.charCodeAt(i);
        hash |= 0;
    }
    return `AerialLocalFont-${Math.abs(hash)}`;
}

function ensureLocalFontFace(font) {
    let fontName = String(font || "").trim().replace(/^["']|["']$/g, "");

    if (!fontName) {
        return "";
    }

    let alias = fontAlias(fontName);

    if (!localFontFaces[alias]) {
        let fontSources = [fontName];
        let fontNameWithoutRegular = fontName.replace(/\s+Regular$/i, "");
        if (fontNameWithoutRegular !== fontName) {
            fontSources.push(fontNameWithoutRegular);
        }

        let style = document.getElementById("aerial-local-font-faces");
        if (!style) {
            style = document.createElement("style");
            style.id = "aerial-local-font-faces";
            document.head.appendChild(style);
        }

        style.appendChild(document.createTextNode(`@font-face { font-family: ${cssString(alias)}; src: ${fontSources.map(fontSource => `local(${cssString(fontSource)})`).join(", ")}; font-display: swap; }\n`));
        localFontFaces[alias] = true;
    }

    return alias;
}

function cssFontFamily(font) {
    let fontName = String(font || "").trim().replace(/^["']|["']$/g, "");
    let alias = ensureLocalFontFace(fontName);

    if (!fontName) {
        return `"Segoe UI", sans-serif`;
    }

    return `${cssString(alias)}, ${cssString(fontName)}, "Segoe UI", sans-serif`;
}

$('.displayText').css('font-family', cssFontFamily(electron.store.get('textFont'))).css('font-size', `${electron.store.get('textSize')}${electron.store.get('textSizeUnit') === 'vh' ? 'vh' : 'vw'}`).css('color', `${electron.store.get('textColor')}`);

//draw text
let displayText = electron.store.get('displayText') ?? [];
let html = "";

function clearClocks(position) {
    for (const line of displayText[position] || []) {
        clearTimeout(line.clockTimeout);
        line.clockTimeout = undefined;
    }
}

function renderText() {
    displayText.positionList.forEach(clearClocks);
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
        html += `<div class="w3-display-${position} ${align} w3-container textDisplayArea" id="textDisplay-${position}"></div>`;
    }
    $('#textDisplayArea').html(html);
//add text to the content
    for (let position of displayText.positionList) {
        if (position !== "random") {
            displayTextPosition(position);
        }
    }
    drawDynamicText();
}

function overlayVisibleOnScreen(position, line) {
    // Named overlays share the first active line's monitor selection.
    // Untagged legacy lines retain their original individual settings.
    const source = line.overlayId
        ? displayText[position].find(entry => entry.overlayId === line.overlayId && entry.type !== 'none') || line
        : line;
    return source.enabled !== false && (source.onlyShowOnScreen === undefined
        || [].concat(source.onlyShowOnScreen).some(screen => Number(screen) === Number(screenNumber)));
}

function displayTextPosition(position, displayLocation) {
    clearClocks(position);
    let selector = displayLocation ? `#textDisplay-${displayLocation}` : `#textDisplay-${position}`;
    let html = "";
    for (let i = 0; i < displayText[position].length; i++) {
        if (overlayVisibleOnScreen(position, displayText[position][i])) {
            const line = displayText[position][i];
            const style = line.defaultFont !== false ? electron.store.get('textStyle') : line.fontStyle || electron.store.get('textStyle');
            html += `<div id="${position}-${i}" style="${aerialTextStyle.declarations(style)}${line.customCSS || ''}">${createContentLine(line, position, i)}</div>`;
        }
    }
    $(selector).html(html);
    for (let i = 0; i < displayText[position].length; i++) {
        const line = displayText[position][i];
        if (line.type === 'time' && overlayVisibleOnScreen(position, line)) {
            runClock(position, i, line.timeString);
        }
        if (!displayText[position][i].defaultFont) {
            $(`#${position}-${i}`).css('font-family', cssFontFamily(displayText[position][i].font)).css('font-size', `${displayText[position][i].fontSize}${electron.store.get('textSizeUnit') === 'vh' ? 'vh' : 'vw'}`).css('color', `${displayText[position][i].fontColor}`);
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
            let eventTime = localizedDateTime(astronomy[type]);
            html += eventTime.format(contentLine.astroTimeString);
            break;
        case "information":
            break;
    }
    return html;
}

let randomTimer;
let randomInterval;
if (displayText.random.some(line => line.type !== 'none')) {
    displayText.random.currentLocation = 'none';
    randomTimer = setTimeout(switchRandomText, 750);
    randomInterval = setInterval(switchRandomText, electron.store.get('randomSpeed') * 1000);
}

function switchRandomText() {
    if (blackScreen) {
        return;
    }
    const locations = displayText.positionList.filter(position => position !== 'random'
        && position !== displayText.random.currentLocation
        && displayText[position].every(line => line.type === 'none'
            || !overlayVisibleOnScreen(position, line)));
    if (!locations.length) {
        return;
    }
    clearClocks('random');
    const location = locations[randomInt(0, locations.length)];
    $('#textDisplay-' + displayText.random.currentLocation).html('');
    displayText.random.currentLocation = location;
    displayTextPosition('random', location);
    if (displayText.random.some(line => line.type === 'information')) {
        drawDynamicText();
    }
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}


newVideo();
electron.ipcRenderer.on('newVideo', () => newVideo());
electron.ipcRenderer.on('previousVideo', () => {
    if (historyIndex > 0) {
        newVideo(false, historyIndex - 1);
    }
});
electron.ipcRenderer.on('blankTheScreen', () => {
    blackScreen = true;
    setTimeout(() => electron.ipcRenderer.send('videoPlaybackState', {playing: [], pending: null}), duration);
    document.body.style.backgroundColor = 'black';
    generation++;
    stopFrameSample();
    clearInterval(healthInterval);
    clearInterval(randomInterval);
    clearTimeout(randomTimer);
    displayText.positionList.forEach(clearClocks);
    stopTransition();
    clearTimeout(nextTimer);
    clearTimeout(preparationTimer);
    discardPreparation();
    poiTimeout = clearTimeouts(poiTimeout);
    containers.forEach(player => {
        videoPlayback.cancel(player);
        player.pause();
    });
    stage.style.transition = 'opacity ' + duration + 'ms linear';
    stage.style.opacity = '0';
    $('#textDisplayArea').css({transition: 'opacity ' + duration + 'ms linear', opacity: 0});
    setTimeout(() => containers.forEach(player => videoPlayback.release(player)), duration);
});
electron.ipcRenderer.on('screenNumber', number => {
    screenNumber = number;
    renderText();
});
