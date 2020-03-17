const Store = require('electron-store');
const videos = require("../videos.json");
const store = new Store();

let allowedVideos = store.get("allowedVideos");

if (store.get('clock')) {
    console.log('hello');
    document.getElementById("showClock").checked = true;
}

function displaySettings() {
    let checked = ["timeOfDay", "skipVideosWithKey"];
    for (let i = 0; i < checked.length; i++) {
        $(`#${checked[i]}`).prop('checked', store.get(checked[i]));
    }
    let number = ["sunrise", "sunset"];
    for (let i = 0; i < number.length; i++) {
        $(`#${number[i]}`).val(store.get(number[i]));
    }
    let slider = ["playbackSpeed"];
    for (let i = 0; i < slider.length; i++) {
        $(`#${slider[i]}`).val(store.get(slider[i]));
        $(`#${slider[i]}Text`).text(store.get(slider[i]));
    }
    displayPlaybackSettings();
}
displaySettings();

function displayPlaybackSettings() {
    let settings = store.get('videoFilters');
    let html = "";
    for(let i = 0; i < settings.length;i++){
        html += `<label>${settings[i].name}: <span id="${settings[i].name}Text">${settings[i].value}</span></label><span class="w3-right" onclick="resetSetting('${settings[i].name}', 'filterSlider', ${settings[i].defaultValue})"><i class="fa fa-undo"></i></span>
                <br>
                <input type="range" min="${settings[i].min}" max="${settings[i].max}" value="${settings[i].value}" step="1" id="${settings[i].name}" class="slider" onchange="updateSetting('${settings[i].name}','filterSlider')">`;
    }
    $('#videoFilterSettings').html(html);
}

function updateClock() {
    store.set('clock', document.getElementById("showClock").checked)
}

function updateSetting(setting, type) {
    switch (type) {
        case "check":
            store.set(setting, document.getElementById(setting).checked);
            break;
        case "slider":
            $(`#${setting}Text`).text(document.getElementById(setting).value);
        case "number":
        case "text":
        case "time":
            store.set(setting, document.getElementById(setting).value);
            break;
        case "filterSlider":
            $(`#${setting}Text`).text(document.getElementById(setting).value);
            let s = store.get('videoFilters');
            let index = s.findIndex((e) => {
                if(setting === e.name){
                    return true;
                }
            });
            s[index].value = document.getElementById(setting).value;
            store.set('videoFilters', s);
            break;

    }
}

function resetSetting(setting, type, value) {
    switch (type) {
        case "slider":
            $(`#${setting}Text`).text(value);
            $(`#${setting}`).val(value);
        case "number":
        case "text":
        case "time":
            store.set(setting, value);
            break;
        case "filterSlider":
            let s = store.get('videoFilters');
            let index = s.findIndex((e) => {
                if(setting === e.name){
                    return true;
                }
            });
            s[index].value = s[index].defaultValue;
            store.set('videoFilters', s);
            $(`#${setting}Text`).text(s[index].defaultValue);
            $(`#${setting}`).val(s[index].defaultValue);
            break;
    }
}

function resetFilterSettings() {
    let videoFilters = store.get('videoFilters');
    for(let i = 0; i < videoFilters.length;i++){
        videoFilters[i].value = videoFilters[i].defaultValue;
    }
    store.set('videoFilters', videoFilters);
    displayPlaybackSettings();
}

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

$(document).ready(() => {
    makeList();
    selectVideo(-1);
});

function makeList() {
    let videoList = "<a onclick=\"selectVideo(-1)\"><h3 class=\"w3-bar-item videoListItem\" id='videoListTitle'><i class=\"fa fa-film\"></i> Videos</h3></a>";
    let headertxt = "";
    for (let i = 0; i < videos.length; i++) {
        if (headertxt !== videos[i].accessibilityLabel) {
            videoList += `<h5 class="w3-bar-item videoListItem" id='videoListTitle'>${videos[i].accessibilityLabel}</h5>`;
            headertxt = videos[i].accessibilityLabel;
        }
        videoList += `<span style="padding-left: 10%; font-size: small"><input type="checkbox" ${allowedVideos.includes(videos[i].id) ? "checked" : ""} class="w3-check" onclick="checkVideo(event,${i})">
                      <a style="display: inline;" href="#" id="videoList-${i}" onclick="selectVideo(${i})" class="w3-bar-item w3-button videoListItem">
                      ${videos[i].name ? videos[i].name : videos[i].accessibilityLabel}
                      </a></span><br>`;
    }
    videoList += "<br><br><br><br><br><br>";
    $('#videoList').html(videoList);
}

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

function selectVideo(index) {
    let x = document.getElementsByClassName("videoListItem");
    for (i = 0; i < x.length; i++) {
        x[i].className = x[i].className.replace("w3-deep-orange", "");
    }
    if (index > -1) {
        document.getElementById("videoList-" + index).className += " w3-deep-orange";
        $('#videoPlayer').attr("src", videos[index].src.H2641080p).show();
        $('#videoName').text(videos[index].accessibilityLabel);
        $('#videoSettings').html("");
    } else {
        $('#videoPlayer').attr("src", "").hide();
        $('#videoName').text("Video Settings");
        $('#videoSettings').html(`<br>
                                  <div class="w3-container">
                                  <button class="w3-button w3-white w3-border w3-border-green w3-round-large" onclick="selectAll()">Select All</button>
                                  <button class="w3-button w3-white w3-border w3-border-red w3-round-large" onclick="deselectAll()">Deselect All</button>
                                  <br><br>
                                  <select class="w3-select w3-border" style="width: 25%" id="videoType">
                                     <option value="aerial">Aerial</option>
                                     <option value="space">Space</option>
                                     <option value="underwater">Underwater</option>
                                  </select> 
                                  <button class="w3-button w3-white w3-border w3-border-green w3-round-large" onclick="selectType()">Select Type</button>
                                  <button class="w3-button w3-white w3-border w3-border-red w3-round-large" onclick="deselectType()">Deselect Type</button>
                                  </div>`);
    }
}

function checkVideo(e, index) {
    if (e.currentTarget.checked) {
        allowedVideos.push(videos[index].id);
    } else {
        allowedVideos.splice(allowedVideos.indexOf(videos[index].id), 1);
    }
    store.set("allowedVideos", allowedVideos);
}

function deselectAll() {
    allowedVideos = [];
    store.set("allowedVideos", allowedVideos);
    makeList();
}

function selectAll() {
    allowedVideos = [];
    for (let i = 0; i < videos.length; i++) {
        allowedVideos.push(videos[i].id);
    }
    store.set("allowedVideos", allowedVideos);
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
    store.set("allowedVideos", allowedVideos);
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
    store.set("allowedVideos", allowedVideos);
    makeList();
}