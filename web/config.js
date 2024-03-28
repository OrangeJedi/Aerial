//Global variables
//This list of allowed or 'checked' videos
const videos = electron.videos;
let allowedVideos = electron.store.get("allowedVideos");
let downloadedVideos = electron.store.get("downloadedVideos");
let alwaysDownloadVideos = electron.store.get("alwaysDownloadVideos");
let neverDownloadVideos = electron.store.get("neverDownloadVideos");
let customVideos = electron.store.get("customVideos");

//Updates all the <input> tags with their proper values. Called on page load
function displaySettings() {
    let checked = ["timeOfDay", "skipVideosWithKey", "sameVideoOnScreens", "videoCache", "videoCacheProfiles", "videoCacheRemoveUnallowed", "avoidDuplicateVideos", "onlyShowVideoOnPrimaryMonitor", "videoQuality", "immediatelyUpdateVideoCache", "useTray", "blankScreen", "sleepAfterBlank", "lockAfterRun", "alternateRenderMethod", "useLocationForSunrise", "runOnBattery", "enableGlobalShortcut", "wakeOnMouseMovement", "wakeOnMouseClick"];
    for (let i = 0; i < checked.length; i++) {
        $(`#${checked[i]}`).prop('checked', electron.store.get(checked[i]));
    }
    let numTxt = ["sunrise", "sunset", "textFont", "textSize", "textColor", "startAfter", "blankAfter", "fps", "latitude", "longitude", "randomSpeed", "skipKey", "transitionType", "fillMode", "globalShortcutModifier1", "globalShortcutModifier2", "globalShortcutKey", "lockAfterRunAfter", "videoFileType"];
    for (let i = 0; i < numTxt.length; i++) {
        $(`#${numTxt[i]}`).val(electron.store.get(numTxt[i]));
    }
    let slider = ["playbackSpeed", "videoTransitionLength"];
    for (let i = 0; i < slider.length; i++) {
        $(`#${slider[i]}`).val(electron.store.get(slider[i]));
        $(`#${slider[i]}Text`).text(electron.store.get(slider[i]));
    }
    let numeralText = [{'id': "videoCacheSize", 'format': "0.00 ib"}];
    for (let i = 0; i < numeralText.length; i++) {
        $(`#${numeralText[i].id}`).text(numeral(electron.store.get(numeralText[i].id)).format(numeralText[i].format));
    }
    let staticText = ["version", "updateAvailable"];
    for (let i = 0; i < staticText.length; i++) {
        $(`#${staticText[i]}`).text(electron.store.get(staticText[i]));
    }
    displayPlaybackSettings();
    displayCustomVideos();
    colorTextPositionRadio();
    updateSettingVisibility();

    //display update, if there is one
    //console.log(electron.store.get('updateAvailable'));
    if (electron.store.get('updateAvailable') !== false) {
        document.getElementById(`aboutUpdate`).style.display = "";
        document.getElementById(`updateBadge`).style.display = "";
    }
}

displaySettings();

function displayPlaybackSettings() {
    let settings = electron.store.get('videoFilters');
    let html = "";
    for (let i = 0; i < settings.length; i++) {
        html += `<label>${settings[i].name}: <span id="${settings[i].name}Text">${settings[i].value}</span></label><span class="w3-right" onclick="resetSetting('${settings[i].name}', 'filterSlider', ${settings[i].defaultValue})"><i class="fa fa-undo"></i></span>
                <br>
                <input type="range" min="${settings[i].min}" max="${settings[i].max}" value="${settings[i].value}" step="1" id="${settings[i].name}" class="slider" onchange="updateSetting('${settings[i].name}','filterSlider')">`;
    }
    $('#videoFilterSettings').html(html);
}

//Updates settings of all shapes and sizes
function updateSetting(setting, type) {
    switch (type) {
        case "check":
            electron.store.set(setting, document.getElementById(setting).checked);
            break;
        case "slider":
            $(`#${setting}Text`).text(document.getElementById(setting).value);
        case "number":
        case "text":
        case "select":
        case "time":
            electron.store.set(setting, document.getElementById(setting).value);
            break;
        case "filterSlider":
            $(`#${setting}Text`).text(document.getElementById(setting).value);
            let s = electron.store.get('videoFilters');
            let index = s.findIndex((e) => {
                if (setting === e.name) {
                    return true;
                }
            });
            s[index].value = document.getElementById(setting).value;
            electron.store.set('videoFilters', s);
            break;
        case "autocomplete":
            let v = document.getElementById(setting).value;
            if (fontList.includes(v)) {
                electron.store.set(setting, v);
                $('#textFontError').css('display', "none");
            } else {
                $('#textFontError').css('display', "");
            }
            break;

    }
    updateSettingVisibility();
}

//Sets a setting to its default value, if it exists
function resetSetting(setting, type, value) {
    switch (type) {
        case "slider":
            $(`#${setting}Text`).text(value);
            $(`#${setting}`).val(value);
        case "number":
            $(`#${setting}`).val(value);
        case "text":
        case "time":
            electron.store.set(setting, value);
            break;
        case "filterSlider":
            let s = electron.store.get('videoFilters');
            let index = s.findIndex((e) => {
                if (setting === e.name) {
                    return true;
                }
            });
            s[index].value = s[index].defaultValue;
            electron.store.set('videoFilters', s);
            $(`#${setting}Text`).text(s[index].defaultValue);
            $(`#${setting}`).val(s[index].defaultValue);
            break;
    }
}

//Mass resets all the filter settings
function resetFilterSettings() {
    let videoFilters = electron.store.get('videoFilters');
    for (let i = 0; i < videoFilters.length; i++) {
        videoFilters[i].value = videoFilters[i].defaultValue;
    }
    electron.store.set('videoFilters', videoFilters);
    displayPlaybackSettings();
}

//Updated input fields that may be effected by another input
function updateSettingVisibility() {
    // Shows or hides the FPS settings for the alternate render method
    if (electron.store.get("alternateRenderMethod")) {
        $("#alternateRenderMethodFPS").show(300);
    } else {
        $("#alternateRenderMethodFPS").hide(200);

    }
    //disabled sunrise & sunset fields if they are calculated automatically
    if (electron.store.get("useLocationForSunrise")) {
        if (document.getElementById('latitude').value !== "" && document.getElementById('longitude').value !== "") {
            document.getElementById('sunrise').disabled = true;
            document.getElementById('sunset').disabled = true;
        } else {
            document.getElementById('needsLocation').style.display = 'block';
            electron.store.set('useLocationForSunrise', false);
            displaySettings();
        }
    } else {
        document.getElementById('sunrise').disabled = false;
        document.getElementById('sunset').disabled = false;
    }

    //show directions for transitions
    let directions, html = '';
    switch (electron.store.get("transitionType")) {
        case 'random':
        case 'dissolve':
        case 'dipToBlack':
            document.getElementById('transitionDirectionSpan').style.display = 'none';
            break;
        case 'fade':
            directions = [{name: "Left", value: "left"}, {name: "Right", value: "right"},
                {name: "Top", value: "top"}, {name: "Bottom", value: "bottom"},
                {name: "Top Left", value: "top-left"}, {name: "Top Right", value: "top-right"},
                {name: "Bottom Left", value: "bottom-left"}, {name: "Bottom Right", value: "bottom-right"}];
            break;
        case 'wipe':
            directions = [{name: "Left", value: "left"}, {name: "Right", value: "right"},
                {name: "Top", value: "top"}, {name: "Bottom", value: "bottom"}];
            break;
        case 'fadeCircle':
        case 'circle':
            directions = [{name: "Normal", value: "normal"}, {name: "Reverse", value: "reverse"}];
            break;
    }
    if (directions) {
        let currentDirection = electron.store.get('transitionDirection');
        directions.forEach((direction) => {
            html += `<option value="${direction.value}" ${currentDirection === direction.value ? "selected" : ""}>${direction.name}</option>`;
        });
        html += `<option value="random" ${currentDirection === "random" ? "selected" : ""}>Random</option>`;
        document.getElementById('transitionDirectionSpan').style.display = '';
        document.getElementById('transitionDirection').innerHTML = html;
        if (currentDirection === "") {
            electron.store.set('transitionDirection', directions[0].value);
        }
    }
}

//config functions
function refreshAerial() {
    alert("You will need to run Aerial again to finish the refresh");
    electron.ipcRenderer.send('refreshConfig');
}

function resetAerial() {
    if (confirm("This will reset all of Aerial's settings; this cannot be undone.\nAre you sure you want to do this?")) {
        alert("You will need to run Aerial again to finish resetting");
        electron.ipcRenderer.send('resetConfig');
    }
}

//Menu functions that interacted with app.js
function updateLocation() {
    if (electron.store.get('useLocationForSunrise')) {
        setTimeout(() => {
            electron.ipcRenderer.send('updateLocation');
        }, 200);
    }
}

//Cache functions
function updateCache() {
    electron.ipcRenderer.send('updateCache');
}

function refreshCache() {
    electron.ipcRenderer.send('refreshCache');
}

function deleteCache() {
    if (confirm('Are sure you want to delete all the videos in the cache?'))
        electron.ipcRenderer.send('deleteCache');
}

function selectCacheLocation() {
    if (confirm("This will delete all videos in the current cache and move the cache location to the chosen folder.\nIf you want to keep your downloaded videos copy them to the new location before clicking ok.")) {
        console.log('hey');
        electron.ipcRenderer.send('selectCacheLocation');
    }
}

let skipKeyInput = document.getElementById('skipKey');
skipKeyInput.addEventListener('keyup', (e) => {
    skipKeyInput.value = e.code;
    updateSetting('skipKey', 'text');
});

let globalShortcutKeyInput = document.getElementById('globalShortcutKey');
globalShortcutKeyInput.addEventListener('keyup', (e) => {
    let key = e.key;
    if (key.length === 1) {
        key = key.toUpperCase();
    }
    globalShortcutKeyInput.value = key;
    updateSetting('globalShortcutKey', 'text');
    newGlobalShortcut();
});
electron.ipcRenderer.on('displaySettings', () => {
    displaySettings();
});

electron.ipcRenderer.on('showWelcome', () => {
    document.getElementById('welcomeMessage').style.display = 'block';
});

electron.ipcRenderer.on('updateAttribute', (args) => {
    let id = args[0];
    let value = args[1]
    document.getElementById(id).innerText = value;
});

//Custom videos
electron.ipcRenderer.on('newCustomVideos', (videoList, path) => {
    customVideos = electron.store.get('customVideos');
    for (let i = 0; i < videoList.length; i++) {
        let index = customVideos.findIndex((e) => {
            if (`${path}\\${videoList[i]}` === e.path) {
                return true;
            }
        });
        if (index === -1) {
            customVideos.push({
                "path": `${path}\\${videoList[i]}`,
                "name": videoList[i],
                "id": newId(),
                "accessibilityLabel": "Custom Video"
            });
        }
        allowedVideos.push(customVideos[customVideos.length - 1].id);
    }
    electron.store.set('customVideos', customVideos);
    electron.store.set("allowedVideos", allowedVideos);
    displayCustomVideos();
});

function newId() {
    return '_' + Math.random().toString(36).substr(2, 9);
}

function displayCustomVideos() {
    let html = "<br>";
    customVideos = electron.store.get('customVideos');
    html += "<table class='w3-table-all'>";
    for (let i = 0; i < customVideos.length; i++) {
        html += `<tr>
                <td><input type="checkbox" class="w3-check" ${allowedVideos.includes(customVideos[i].id) ? "checked" : ""} onclick="checkCustomVideo(this,'${customVideos[i].id}')"></td>
                <td>${customVideos[i].name}</td>
                <td><i class="fa fa-cog w3-large" onclick="editCustomVideo('${customVideos[i].id}')"></i></td>
                <td><i class='fa fa-times w3-large' style='color: #f44336' onclick="removeCustomVideo('${customVideos[i].id}')"></i></td>
                </tr>`;
    }
    html += "</table>";
    $('#customVideoList').html(html);
}

function checkCustomVideo(e, id) {
    if (e.checked) {
        allowedVideos.push(id);
    } else {
        allowedVideos.splice(allowedVideos.indexOf(id), 1);
    }
    electron.store.set("allowedVideos", allowedVideos);
}

function removeCustomVideo(id) {
    if (allowedVideos.includes(id)) {
        allowedVideos.splice(allowedVideos.indexOf(id), 1);
    }
    let index = customVideos.findIndex((e) => {
        if (id === e.id) {
            return true;
        }
    });
    customVideos.splice(index, 1);
    electron.store.set("customVideos", customVideos);
    displayCustomVideos();
}

function editCustomVideo(id) {
    let index = customVideos.findIndex((e) => {
        if (id === e.id) {
            return true;
        }
    });
    document.getElementById('editCustomVideo').style.display = 'block';
    document.getElementById('customVideoName').onchange = () => {
        customVideos[index].name = $('#customVideoName').val();
        electron.store.set('customVideos', customVideos);
        displayCustomVideos()
    };
    document.getElementById('customVideoName').value = customVideos[index].name;
    electron.store.set('customVideos', customVideos);
    displayCustomVideos();
}

//Text tab

function colorTextPositionRadio() {
    let displayTextSettings = electron.store.get('displayText');
    $('.imagePosition').each(function () {
        let color = false;
        for (let i = 0; i < displayTextSettings[this.value].length; i++) {
            if (displayTextSettings[this.value][i].type !== "none") {
                color = true;
            }
        }
        if (color) {
            $(this).addClass('imagePositionWithValue');
        } else {
            $(this).removeClass('imagePositionWithValue')
        }
    });
}

function loadScreenSelect() {
    let html = '<option value="">All Screens</option>'
    for (let i = 0; i < electron.store.get('numDisplays'); i++) {
        html += `<option value="${i}">Screen ${i + 1}</option>`
    }
    $('#screenSelectorSelect').html(html);
}

loadScreenSelect();

//handles selecting a radio button from the position image
function positionSelect(position) {
    position = position.value;
    let displayTextSettings = electron.store.get('displayText')[position];

    document.getElementById("positionTypeSelect0").setAttribute('onchange', `updatePositionType('${position}',0)`);
    document.getElementById("positionRow0").setAttribute('onclick', `lineSelect('${position}',0)`);
    $('#positionTypeSelect0').val(displayTextSettings[0].type);
    document.getElementById("positionTypeSelect1").setAttribute('onchange', `updatePositionType('${position}',1)`);
    document.getElementById("positionRow1").setAttribute('onclick', `lineSelect('${position}',1)`);
    $('#positionTypeSelect1').val(displayTextSettings[1].type);
    document.getElementById("positionTypeSelect2").setAttribute('onchange', `updatePositionType('${position}',2)`);
    document.getElementById("positionRow2").setAttribute('onclick', `lineSelect('${position}',2)`);
    $('#positionTypeSelect2').val(displayTextSettings[2].type);
    document.getElementById("positionTypeSelect3").setAttribute('onchange', `updatePositionType('${position}',3)`);
    document.getElementById("positionRow3").setAttribute('onclick', `lineSelect('${position}',3)`);
    $('#positionTypeSelect3').val(displayTextSettings[3].type);

    $('#positionType').css('display', "");
    lineSelect(position, 0);
}

function lineSelect(position, line) {
    let displayTextSettings = electron.store.get('displayText')[position][line];
    document.getElementById("textWidthSelect").setAttribute('onchange', `updateTextSetting(this, '${position}','${line}', 'maxWidth')`);
    $('#textWidthSelect').val(displayTextSettings.maxWidth ? displayTextSettings.maxWidth : "50%");
    $('#textWidthContainer').css('display', "");

    $('#positionLineNum0').css("font-weight", "normal");
    $('#positionLineNum1').css("font-weight", "normal");
    $('#positionLineNum2').css("font-weight", "normal");
    $('#positionLineNum3').css("font-weight", "normal");

    $('#positionLineNum' + line).css("font-weight", "bold");

    if (electron.store.get('numDisplays') > 0) {
        $('#screenSelectorDiv').css('display', "");
        $('#screenSelectorSelect').val(displayTextSettings.onlyShowOnScreen);
        document.getElementById("screenSelectorSelect").setAttribute('onchange', `updateScreenSelect('${position}',${line})`);
    }

    updatePositionType(position, line);
}

function updatePositionType(position, line) {
    let displayTextSettings = electron.store.get('displayText');
    displayTextSettings[position][line].type = $('#positionTypeSelect' + line).val();
    let html = "";
    switch (displayTextSettings[position][line].type) {
        case "none":
            html = "";
            break;
        case "text":
            html = `<label>Text</label><input class='w3-input' value='${displayTextSettings[position][line].text ? displayTextSettings[position][line].text : ""}' onchange="updateTextSetting(this, '${position}','${line}', 'text')">`;
            break;
        case "html":
            html = `<label>HTML</label><br><textarea onchange="updateTextSetting(this, '${position}','${line}', 'html')" cols="75" rows="7">${displayTextSettings[position][line].html ? displayTextSettings[position][line].html : ""}</textarea>`;
            break;
        case "image":
            html = `<button onclick="electron.ipcRenderer.send('selectFile',['image','${position}','${line}'])">Select Image</button>
                    <br>File: <span id="imageFileName">${displayTextSettings[position][line].imagePath}</span>
                    <br><br>
                    <label>Width: </label><input class='w3-input' style="width: 20%; display: inline !important;" value='${displayTextSettings[position][line].imageWidth ? displayTextSettings[position][line].imageWidth : ""}' onchange="updateTextSetting(this, '${position}','${line}', 'imageWidth')">
                    <br>`;
            break;
        case "time":
            displayTextSettings[position][line].timeString = displayTextSettings[position][line].timeString ? displayTextSettings[position][line].timeString : "hh:mm:ss";
            html = `
                                    <input class='w3-input' value='${displayTextSettings[position][line].timeString}' onchange="showMomentDisplay('positionTimeDisplay', this); updateTextSetting(this, '${position}','${line}', 'timeString')">
                                    <span id="positionTimeDisplay">${moment().format(displayTextSettings[position][line].timeString)}</span>
                                    <br>
                                    <button onclick="document.getElementById('timeFormatExplain').style.display='block'" class="w3-button w3-white w3-border w3-border-blue w3-round-large" style="margin-top: 2%">Show Formatting Details</button>`;
            break;
        case "information":
            displayTextSettings[position][line].infoType = displayTextSettings[position][line].infoType || "accessibilityLabel";
            let selected = displayTextSettings[position][line].infoType ? displayTextSettings[position][line].infoType : "";
            html = `<br><label>Type </label>
                                        <select onchange="updateTextSetting(this, '${position}', '${line}','infoType')">
                                        <option value="accessibilityLabel" ${selected === "accessibilityLabel" ? "selected" : ""}>Label</option>
                                        <option value="name" ${selected === "name" ? "selected" : ""}>Video Name</option>
                                        ${position !== "random" ? `<option value="poi" ${selected === "poi" ? "selected" : ""}>Location Information</option>` : ""}
                                        </select><br>`;
            break;
        case "astronomy":
            if (document.getElementById('latitude').value === "" || document.getElementById('longitude').value === "") {
                document.getElementById('needsLocation').style.display = 'block';
                displayTextSettings[position][line].type = "none";
                $('#positionTypeSelect' + line).val("none");
                break;
            }
            displayTextSettings[position][line].astronomy = displayTextSettings[position][line].astronomy || "sunrise/set";
            displayTextSettings[position][line].astroTimeString = displayTextSettings[position][line].astroTimeString || "hh:mm"
            let astroType = displayTextSettings[position][line].astronomy ? displayTextSettings[position][line].astronomy : "";
            html = `<br><label>Type </label>
                   <select onchange="updateTextSetting(this, '${position}','${line}', 'astronomy')">
                       <option value="sunrise/set" ${astroType === "sunrise/set" ? "selected" : ""}>Sunrise/Sunset</option>
                       <option value="moonrise/set" ${astroType === "moonrise/set" ? "selected" : ""}>Moonrise/Moonset</option>
                       <option value="sunrise" ${astroType === "sunrise" ? "selected" : ""}>Sunrise</option>
                       <option value="sunset" ${astroType === "sunset" ? "selected" : ""}>Sunset</option>
                       <option value="moonrise" ${astroType === "moonrise" ? "selected" : ""}>Moonrise</option>
                       <option value="moonset" ${astroType === "moonset" ? "selected" : ""}>Moonset</option>
                   </select>
                   <br><br>
                   <input class='w3-input'  style="width: 15%" value='${displayTextSettings[position][line].astroTimeString}' onchange="showMomentDisplay('positionTimeDisplay', this); updateTextSetting(this, '${position}', '${line}','astroTimeString')">
                
                   <span id="positionTimeDisplay" style="margin-left: .5%; line-height: 2.5;">${moment().format(displayTextSettings[position][line].astroTimeString)}</span>
                   <button onclick="document.getElementById('timeFormatExplain').style.display='block'" class="w3-button w3-white w3-border w3-border-blue w3-round-large" style="margin-top: -6%; margin-left: 10%;">Show Formatting Details</button>
                   <br>            
            `;
            showMomentDisplay('positionTimeDisplay', this);
            break;
    }
    if (displayTextSettings[position][line].type !== "none") {
        html += `<br><input type="checkbox" class="w3-check" id="useDefaultFont" onchange="updateTextSettingCheck(this, '${position}','${line}', 'defaultFont'); updatePositionType('${position}','${line}');" ${displayTextSettings[position][line].defaultFont ? 'checked' : ''}><label> Use Default Font</label>`;
        html += `<div style="text-align: right; margin-top: -4%">Custom CSS <input id="customCSS" onchange="updateTextSetting(this, '${position}','${line}', 'customCSS')" value="${displayTextSettings[position][line].customCSS ?? ''}"/></div>`;
        if (!displayTextSettings[position][line].defaultFont) {
            displayTextSettings[position][line]['font'] = displayTextSettings[position][line].font ? displayTextSettings[position][line].font : electron.store.get('textFont');
            displayTextSettings[position][line]['fontSize'] = displayTextSettings[position][line].fontSize ? displayTextSettings[position][line].fontSize : electron.store.get('textSize');
            displayTextSettings[position][line]['fontColor'] = displayTextSettings[position][line].fontColor ? displayTextSettings[position][line].fontColor : electron.store.get('textColor');
            html += `<div class="autocomplete" style="width:300px;">
                    <label>Font: </label><input id="positionFont" type="text" onchange="updateTextSetting(this, '${position}','${line}', 'font')" value="${displayTextSettings[position][line]['font']}">
                    </div>
                    <label>Font Size: </label><input class="w3-input" id="positionTextSize" type="number" step=".25" style="width: 10%; display: inline; margin-top: 2%" onchange="updateTextSetting(this, '${position}','${line}', 'fontSize')" value="${displayTextSettings[position][line]['fontSize']}">
                    <label>Color: </label><input class="w3-input" type="color" step=".25" style="width: 5%; display: inline; margin-top: 2%; padding: 0;" onchange="updateTextSetting(this, '${position}','${line}', 'fontColor')" value="${displayTextSettings[position][line]['fontColor']}">`;
            $('#positionDetails').html(html);
            autocomplete(document.getElementById('positionFont'), fontList, (e) => {
                updateTextSetting(e, position, line, 'font')
            });
        } else {
            $('#positionDetails').html(html);
            $('#textWidthContainer').css('display', "");
        }
    } else {
        $('#positionDetails').html(html);
        $('#textWidthContainer').css('display', "none");
    }
    electron.store.set('displayText', displayTextSettings);
    colorTextPositionRadio();
}

//Text settings are stored separate from other settings, so they require their own functions
function updateTextSetting(input, position, line, setting) {
    let text = electron.store.get('displayText');
    text[position][line][setting] = input.value;
    electron.store.set('displayText', text);
}

//This one handles checkboxes because they are a special case
function updateTextSettingCheck(input, position, line, setting) {
    let text = electron.store.get('displayText');
    text[position][line][setting] = input.checked;
    electron.store.set('displayText', text);
}

function updateScreenSelect(position, line) {
    let text = electron.store.get('displayText');
    text[position][line].onlyShowOnScreen = $('#screenSelectorSelect').val();
    electron.store.set('displayText', text);
}

//Handles changing menu tabs
function changeTab(evt, tab) {
    let i, x, tablinks;
    x = document.getElementsByClassName("tab");
    for (i = 0; i < x.length; i++) {
        x[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tablink");
    for (i = 0; i < x.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" w3-blue", "");
    }
    document.getElementById(tab).style.display = "block";
    evt.currentTarget.className += " w3-blue";
}

//Functions to run the side menus
function selectSetting(item) {
    let list = document.getElementsByClassName("settingsListItem");
    for (i = 0; i < list.length; i++) {
        list[i].className = list[i].className.replace("w3-deep-orange", "");
    }
    if (item !== "general") {
        document.getElementById(`settingsList-${item}`).className += " w3-deep-orange";
    }
    let cards = document.getElementsByClassName("settingsCard");
    for (i = 0; i < cards.length; i++) {
        cards[i].style.display = "none";
    }
    document.getElementById(`${item}Settings`).style.display = "";
}

function selectTextSetting(item) {
    let list = document.getElementsByClassName("textSettingsListItem");
    for (i = 0; i < list.length; i++) {
        list[i].className = list[i].className.replace("w3-deep-orange", "");
    }
    if (item !== "general") {
        document.getElementById(`textSettingsList-${item}`).className += " w3-deep-orange";
    }
    let cards = document.getElementsByClassName("textSettingsCard");
    for (i = 0; i < cards.length; i++) {
        cards[i].style.display = "none";
    }
    document.getElementById(`${item}TextSettings`).style.display = "";
}

//Video tab

//Makes and then displays the videos on the sidebar
function makeList() {
    let videoList = "<a onclick=\"selectVideo(-1)\"><h3 class=\"w3-bar-item videoListItem\" id='videoListTitle'><i class=\"fa fa-film\"></i> Videos</h3></a>";
    let headertxt = "";
    for (let i = 0; i < videos.length; i++) {
        if (headertxt !== videos[i].accessibilityLabel) {
            videoList += `<h5 class="w3-bar-item videoListItem" id='videoListTitle'>${videos[i].accessibilityLabel}</h5>`;
            headertxt = videos[i].accessibilityLabel;
        }
        videoList += `<span style="padding-left: 8%; font-size: small"><input type="checkbox" ${allowedVideos.includes(videos[i].id) ? "checked" : ""} class="w3-check" onclick="checkVideo(event,${i})">
                      <a style="display: inline;" href="#" id="videoList-${i}" onclick="selectVideo(${i})" class="w3-bar-item w3-button videoListItem">
                      ${videos[i].name ? videos[i].name : videos[i].accessibilityLabel}
                      </a></span><br>`;
    }
    videoList += "<br>";
    $('#videoList').html(videoList);
}

$(document).ready(() => {
    makeList();
    selectVideo(-1);
});

//Shows further info when you click on a video
function selectVideo(index) {
    let x = document.getElementsByClassName("videoListItem");
    for (i = 0; i < x.length; i++) {
        x[i].className = x[i].className.replace("w3-deep-orange", "");
    }
    if (index > -1) {
        downloadedVideos = electron.store.get("downloadedVideos");
        document.getElementById("videoList-" + index).className += " w3-deep-orange";
        let videoSRC = videos[index].src[electron.store.get('videoFileType')];
        if (downloadedVideos.includes(videos[index].id)) {
            videoSRC = `${electron.store.get('cachePath')}/${videos[index].id}.mov`;
        }
        $('#videoPlayer').attr("src", videoSRC).show();
        $('#videoName').text(videos[index].accessibilityLabel);
        let videoDownloadState = "whenChecked";
        if (alwaysDownloadVideos.includes(videos[index].id)) {
            videoDownloadState = "always";
        } else if (neverDownloadVideos.includes(videos[index].id)) {
            videoDownloadState = "never";
        }
        $('#videoInfo').html(`${downloadedVideos.includes(videos[index].id) ? "<p class='w3-large'><i class='far fa-check-circle' style='color: #4CAF50'></i> Downloaded</p>" : "<p class='w3-large'><i class='far fa-times-circle' style='color: #f44336'></i> Downloaded</p>"}
                              <div class="w3-small">
                              <input class="w3-radio" type="radio" name="downloadVideo" onclick="changeVideoDownloadState(this, '${videos[index].id}')" value="whenChecked" ${videoDownloadState === "whenChecked" ? "checked" : ""}>
                              <label>Download when checked and cache is enabled</label><br>  
                              <input class="w3-radio" type="radio" name="downloadVideo" onclick="changeVideoDownloadState(this, '${videos[index].id}')" value="always" ${videoDownloadState === "always" ? "checked" : ""}>
                              <label>Always download</label><br>
                              <input class="w3-radio" type="radio" name="downloadVideo" onclick="changeVideoDownloadState(this, '${videos[index].id}')" value="never" ${videoDownloadState === "never" ? "checked" : ""}>
                              <label>Never download</label>
                              </div>`).css('display', '');
        $('#videoSettings').css('display', 'none');
    } else {
        $('#videoPlayer').attr("src", "").hide();
        $('#videoName').text("Video Settings");
        $('#videoInfo').css('display', 'none');
        $('#videoSettings').html(`<br>
                                  <div class="w3-container">
                                  <button class="w3-button w3-white w3-border w3-border-green w3-round-large" onclick="selectAll()">Select All</button>
                                  <button class="w3-button w3-white w3-border w3-border-red w3-round-large" onclick="deselectAll()">Deselect All</button>
                                  <br><br>
                                  <select class="w3-select w3-border" style="width: 25%" id="videoType">
                                     <option value="cityscape">Cityscape</option>
                                     <option value="landscape">Landscape</option>
                                     <option value="space">Space</option>
                                     <option value="underwater">Underwater</option>
                                  </select> 
                                  <button class="w3-button w3-white w3-border w3-border-green w3-round-large" onclick="selectType()">Select Type</button>
                                  <button class="w3-button w3-white w3-border w3-border-red w3-round-large" onclick="deselectType()">Deselect Type</button>
                                  <br>
                                  <h3>Profiles</h3>
                                  <select class="w3-select w3-border" id="videoProfiles">
                                  </select>
                                  <br><br>
                                  <button class="w3-button w3-white w3-border w3-border-green w3-round-large" onclick="displayProfile('videoProfiles')">Load Profile</button>
                                  <button class="w3-button w3-white w3-border w3-border-green w3-round-large" onclick="updateProfile('videoProfiles')">Update Profile</button>
                                  <button class="w3-button w3-white w3-border w3-border-red w3-round-large" onclick="removeProfile('videoProfiles')">Delete Profile</button>
                                  <button class="w3-button w3-white w3-border w3-border-blue w3-round-large" onclick="document.getElementById('createVideoProfile').style.display='block'">Create Profile</button>
                                  <br>
                                  <h3>Downloads</h3>
                                  <button class="w3-button w3-white w3-border w3-border-blue w3-round-large" onclick="changeAllVideoDownloadState('allVideoDownloadState')">Set all videos to </button>
                                  <select id="allVideoDownloadState" class="w3-select w3-border" style="width: 35%">
                                    <option value="whenChecked">download when checked</option>
                                    <option value="always">always download</option>
                                    <option value="never">never download</option>
                                  </select>
                                  </div>`).css('display', '');
        let profiles = electron.store.get('videoProfiles');
        let html = "";
        for (let i = 0; i < profiles.length; i++) {
            html += `<option value="${profiles[i].name}">${profiles[i].name}</option>`
        }
        $('#videoProfiles').html(html);
    }
}

function changeVideoDownloadState(element, videoId) {
    alwaysDownloadVideos = alwaysDownloadVideos.filter(function (item, pos, self) {
        return item !== videoId;
    });
    neverDownloadVideos = neverDownloadVideos.filter(function (item, pos, self) {
        return item !== videoId;
    });
    switch (element.value) {
        case "whenChecked":
            break;
        case "always":
            alwaysDownloadVideos.push(videoId);
            break;
        case "never":
            neverDownloadVideos.push(videoId);
            break;
    }
    electron.store.set("alwaysDownloadVideos", alwaysDownloadVideos);
    electron.store.set("neverDownloadVideos", neverDownloadVideos);
}

function changeAllVideoDownloadState(elementId) {
    alwaysDownloadVideos = [];
    neverDownloadVideos = [];
    switch ($(`#${elementId}`).val()) {
        case "whenChecked":
            break;
        case "always":
            for (let i = 0; i < videos.length; i++) {
                alwaysDownloadVideos.push(videos[i].id);
            }
            break;
        case "never":
            for (let i = 0; i < videos.length; i++) {
                neverDownloadVideos.push(videos[i].id);
            }
            break;
    }
    electron.store.set("alwaysDownloadVideos", alwaysDownloadVideos);
    electron.store.set("neverDownloadVideos", neverDownloadVideos);
}

//Updates the video list when a video is checked
function checkVideo(e, index) {
    if (e.currentTarget.checked) {
        allowedVideos.push(videos[index].id);
    } else {
        allowedVideos.splice(allowedVideos.indexOf(videos[index].id), 1);
    }
    electron.store.set("allowedVideos", allowedVideos);
    setTimeout(refreshCache, 50);
}

//automated video selection buttons
function deselectAll() {
    allowedVideos = allowedVideos.filter(id => id[0] === "_");
    electron.store.set("allowedVideos", allowedVideos);
    makeList();
}

function selectAll() {
    allowedVideos = [];
    for (let i = 0; i < videos.length; i++) {
        allowedVideos.push(videos[i].id);
    }
    electron.store.set("allowedVideos", allowedVideos);
    makeList();
}

function selectType() {
    let type = $('#videoType').val();
    for (let i = 0; i < videos.length; i++) {
        if (videos[i].type === type) {
            if (!allowedVideos.includes(videos[i].id)) {
                allowedVideos.push(videos[i].id);
            }
        }
    }
    electron.store.set("allowedVideos", allowedVideos);
    makeList();
}

function deselectType() {
    let type = $('#videoType').val();
    for (let i = 0; i < videos.length; i++) {
        if (videos[i].type === type) {
            if (allowedVideos.includes(videos[i].id)) {
                allowedVideos.splice(allowedVideos.indexOf(videos[i].id), 1);
            }
        }
    }
    electron.store.set("allowedVideos", allowedVideos);
    makeList();
}

//Video Profiles
function createProfile(id) {
    let profiles = electron.store.get('videoProfiles');
    profiles.push({
        "name": $(`#${id}`).val(),
        "videos": allowedVideos
    });
    electron.store.set('videoProfiles', profiles);
    selectVideo(-1);
}

function updateProfile(id) {
    let profiles = electron.store.get('videoProfiles');
    for (let i = 0; i < profiles.length; i++) {
        if (profiles[i].name === $(`#${id}`).val()) {
            profiles[i].videos = allowedVideos.filter(id => id[0] !== "_");
            break;
        }
    }
    electron.store.set('videoProfiles', profiles);
}

function removeProfile(id) {
    let profiles = electron.store.get('videoProfiles');
    for (let i = 0; i < profiles.length; i++) {
        if (profiles[i].name === $(`#${id}`).val()) {
            profiles.splice(i, 1);
            break;
        }
    }
    electron.store.set('videoProfiles', profiles);
    selectVideo(-1);
}

function displayProfile(id) {
    let customAllowed = allowedVideos.filter(id => id[0] === "_");
    let profiles = electron.store.get('videoProfiles');
    for (let i = 0; i < profiles.length; i++) {
        if (profiles[i].name === $(`#${id}`).val()) {
            allowedVideos = profiles[i].videos;
            makeList();
            break;
        }
    }
    allowedVideos.push(...customAllowed);
    electron.store.set("allowedVideos", allowedVideos);
}

//For formatting time and dates. Used throughout the config menu
function showMomentDisplay(id, stringID) {
    $(`#${id}`).text(moment().format(stringID.value));
}

//Autocomplete stuff
function autocomplete(inp, arr, func) {
    /*the autocomplete function takes two arguments,
    the text field element and an array of possible autocompleted values:*/
    var currentFocus;
    /*execute a function when someone writes in the text field:*/
    inp.addEventListener("input", function (e) {
        var a, b, i, val = this.value;
        /*close any already open lists of autocompleted values*/
        closeAllLists();
        /*if (!val) {
            return false;
        }*/
        currentFocus = -1;
        /*create a DIV element that will contain the items (values):*/
        a = document.createElement("DIV");
        a.setAttribute("id", this.id + "autocomplete-list");
        a.setAttribute("class", "autocomplete-items");
        /*append the DIV element as a child of the autocomplete container:*/
        this.parentNode.appendChild(a);
        /*for each item in the array...*/
        for (i = 0; i < arr.length; i++) {
            /*check if the item starts with the same letters as the text field value:*/
            if (arr[i].substr(0, val.length).toUpperCase() == val.toUpperCase() || !val) {
                /*create a DIV element for each matching element:*/
                b = document.createElement("DIV");
                /*make the matching letters bold:*/
                b.innerHTML = "<strong>" + arr[i].substr(0, val.length) + "</strong>";
                b.innerHTML += arr[i].substr(val.length);
                /*insert a input field that will hold the current array item's value:*/
                b.innerHTML += "<input type='hidden' value='" + arr[i] + "'>";
                /*execute a function when someone clicks on the item value (DIV element):*/
                b.addEventListener("click", function (e) {
                    /*insert the value for the autocomplete text field:*/
                    inp.value = this.getElementsByTagName("input")[0].value;
                    /*close the list of autocompleted values,
                    (or any other open lists of autocompleted values:*/
                    closeAllLists();
                    func(inp);
                });
                a.appendChild(b);
            }
        }
    });
    /*execute a function presses a key on the keyboard:*/
    inp.addEventListener("keydown", function (e) {
        var x = document.getElementById(this.id + "autocomplete-list");
        if (x) x = x.getElementsByTagName("div");
        if (e.keyCode == 40) {
            /*If the arrow DOWN key is pressed,
            increase the currentFocus variable:*/
            currentFocus++;
            /*and and make the current item more visible:*/
            addActive(x);
        } else if (e.keyCode == 38) { //up
            /*If the arrow UP key is pressed,
            decrease the currentFocus variable:*/
            currentFocus--;
            /*and and make the current item more visible:*/
            addActive(x);
        } else if (e.keyCode == 13) {
            /*If the ENTER key is pressed, prevent the form from being submitted,*/
            e.preventDefault();
            if (currentFocus > -1) {
                /*and simulate a click on the "active" item:*/
                if (x) x[currentFocus].click();
            }
        }
    });

    function addActive(x) {
        /*a function to classify an item as "active":*/
        if (!x) return false;
        /*start by removing the "active" class on all items:*/
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        /*add class "autocomplete-active":*/
        x[currentFocus].classList.add("autocomplete-active");
    }

    function removeActive(x) {
        /*a function to remove the "active" class from all autocomplete items:*/
        for (var i = 0; i < x.length; i++) {
            x[i].classList.remove("autocomplete-active");
        }
    }

    function closeAllLists(elmnt) {
        /*close all autocomplete lists in the document,
        except the one passed as an argument:*/
        var x = document.getElementsByClassName("autocomplete-items");
        for (var i = 0; i < x.length; i++) {
            if (elmnt != x[i] && elmnt != inp) {
                x[i].parentNode.removeChild(x[i]);
            }
        }
    }

    /*execute a function when someone clicks in the document:*/
    /*document.addEventListener("click", function (e) {
        closeAllLists(e.target);
    });*/
}

function closeAllLists(elmnt) {
    /*close all autocomplete lists in the document,
    except the one passed as an argument:*/
    var x = document.getElementsByClassName("autocomplete-items");
    for (var i = 0; i < x.length; i++) {
        if (elmnt != x[i]) {
            x[i].parentNode.removeChild(x[i]);
        }
    }
}

document.addEventListener("click", function (e) {
    closeAllLists(e.target);
});

//Still autocomplete stuff. This part sets up our font lists
let fontList = [];
electron.fontListUniversal.getFonts().then(fonts => {
    autocomplete(document.getElementById('textFont'), fonts, () => {
        updateSetting('textFont', 'autocomplete')
    },);
    fontList = fonts
});

//Preview
function openPreview() {
    electron.ipcRenderer.send('openPreview');
}

function newGlobalShortcut() {
    electron.ipcRenderer.send('newGlobalShortcut');
}