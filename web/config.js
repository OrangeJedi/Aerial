//Global constants
//Set up persistent read/write for storing all of our settings
const Store = require('electron-store');
const store = new Store();
//All the videos and their information
const videos = require("../videos.json");

//Global variables
//This list of allowed or 'checked' videos
let allowedVideos = store.get("allowedVideos");

//Updates all the <input> tags with their proper values. Called on page load
function displaySettings() {
    let checked = ["timeOfDay", "skipVideosWithKey", "sameVideoOnScreens"];
    for (let i = 0; i < checked.length; i++) {
        $(`#${checked[i]}`).prop('checked', store.get(checked[i]));
    }
    let numTxt = ["sunrise", "sunset", "textFont", "textSize", 'textColor'];
    for (let i = 0; i < numTxt.length; i++) {
        $(`#${numTxt[i]}`).val(store.get(numTxt[i]));
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
                if (setting === e.name) {
                    return true;
                }
            });
            s[index].value = document.getElementById(setting).value;
            store.set('videoFilters', s);
            break;
        case "autocomplete":
            let v = document.getElementById(setting).value;
            if (fontList.includes(v)) {
                store.set(setting, v);
                $('#textFontError').css('display', "none");
            } else {
                $('#textFontError').css('display', "");
            }
            break;

    }
}

//Sets a setting to its default value, if it exists
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
                if (setting === e.name) {
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

//Mass resets all the filter settings
function resetFilterSettings() {
    let videoFilters = store.get('videoFilters');
    for (let i = 0; i < videoFilters.length; i++) {
        videoFilters[i].value = videoFilters[i].defaultValue;
    }
    store.set('videoFilters', videoFilters);
    displayPlaybackSettings();
}

//Text tab

//handles selecting a radio button from the position image
function positionSelect(position) {
    position = position.value;
    let displayTextSettings = store.get('displayText')[position];
    document.getElementById("positionTypeSelect").setAttribute('onchange', `updatePositionType('${position}')`);
    $('#positionTypeSelect').val(displayTextSettings.type);
    $('#positionType').css('display', "");
    updatePositionType(position);
}

function updatePositionType(position) {
    let displayTextSettings = store.get('displayText');
    displayTextSettings[position].type = $('#positionTypeSelect').val();
    let html = "";
    switch (displayTextSettings[position].type) {
        case "none":
            html = "";
            break;
        case "text":
            html = `<label>Text</label><input class='w3-input' value='${displayTextSettings[position].text ? displayTextSettings[position].text : ""}' onchange="updateTextSetting(this, '${position}', 'text')">`;
            break;
        case "time":
            displayTextSettings[position].timeString = displayTextSettings[position].timeString ? displayTextSettings[position].timeString : "hh:mm:ss";
            html = `
                                    <input class='w3-input' value='${displayTextSettings[position].timeString}' onchange="showMomentDisplay('positionTimeDisplay', this); updateTextSetting(this, '${position}', 'timeString')">
                                    <span id="positionTimeDisplay">${moment().format(displayTextSettings[position].timeString)}</span>
                                    <br>
                                    <button onclick="document.getElementById('timeFormatExplain').style.display='block'" class="w3-button w3-white w3-border w3-border-blue w3-round-large" style="margin-top: 2%">Show Formatting Details</button>`;
            break;
        case "information":
            let selected = displayTextSettings[position].infoType ? displayTextSettings[position].infoType : "";
            console.log(selected);
            html = `<label>Type </label>
                                        <select onchange="updateTextSetting(this, '${position}', 'infoType')">
                                        <option value="accessibilityLabel" ${selected === "accessibilityLabel" ? "selected" : ""}>Label</option>
                                        <option value="name" ${selected === "name" ? "selected" : ""}>Video Name</option>
                                        <option value="poi" ${selected === "poi" ? "selected" : ""}>Location Information</option>
                                        </select>`;
            break;
    }
    if (displayTextSettings[position].type !== "none") {
        html += `<br><input type="checkbox" class="w3-check" id="useDefaultFont" onchange="updateTextSettingCheck(this, '${position}', 'defaultFont'); updatePositionType('${position}');" ${displayTextSettings[position].defaultFont ? 'checked' : ''}><label> Use Default Font</label>`;
        if (!displayTextSettings[position].defaultFont) {
            displayTextSettings[position]['font'] = displayTextSettings[position].font ? displayTextSettings[position].font : store.get('textFont');
            displayTextSettings[position]['fontSize'] = displayTextSettings[position].fontSize ? displayTextSettings[position].fontSize : store.get('textSize');
            displayTextSettings[position]['fontColor'] = displayTextSettings[position].fontColor ? displayTextSettings[position].fontColor : store.get('textColor');
            html += `<br><div class="autocomplete" style="width:300px;">
                    <label>Font: </label><input id="positionFont" type="text" onchange="updateTextSetting(this, '${position}', 'font')" value="${displayTextSettings[position]['font']}">
                    </div>
                    <label>Font Size: </label><input class="w3-input" id="positionTextSize" type="number" step=".25" style="width: 10%; display: inline; margin-top: 2%" onchange="updateTextSetting(this, '${position}', 'fontSize')" value="${displayTextSettings[position]['fontSize']}">
                    <label>Color: </label><input class="w3-input" type="color" step=".25" style="width: 5%; display: inline; margin-top: 2%; padding: 0;" onchange="updateTextSetting(this, '${position}', 'fontColor')" value="${displayTextSettings[position]['fontColor']}">`;
            $('#positionDetails').html(html);
            autocomplete(document.getElementById('positionFont'), fontList, (e) => {
                updateTextSetting(e, position, 'font')
            });
        } else {
            $('#positionDetails').html(html);
        }
    } else {
        $('#positionDetails').html(html);
    }
    store.set('displayText', displayTextSettings);
}

//Text settings are stored separate from other settings, so they require their own functions
function updateTextSetting(input, position, setting) {
    let text = store.get('displayText');
    text[position][setting] = input.value;
    store.set('displayText', text);
}

//This one handles checkboxes because they are a special case
function updateTextSettingCheck(input, position, setting) {
    let text = store.get('displayText');
    text[position][setting] = input.checked;
    store.set('displayText', text);
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
    videoList += "<br><br><br><br><br><br>";
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
                                  <br><br>
                                  <h3>Profiles</h3>
                                  <select class="w3-select w3-border" id="videoProfiles">
                                  </select>
                                  <br><br>
                                  <button class="w3-button w3-white w3-border w3-border-green w3-round-large" onclick="displayProfile('videoProfiles')">Load Profile</button>
                                  <button class="w3-button w3-white w3-border w3-border-green w3-round-large" onclick="updateProfile('videoProfiles')">Update Profile</button>
                                  <button class="w3-button w3-white w3-border w3-border-red w3-round-large" onclick="removeProfile('videoProfiles')">Delete Profile</button>
                                  <button class="w3-button w3-white w3-border w3-border-blue w3-round-large" onclick="document.getElementById('createVideoProfile').style.display='block'">Create Profile</button>
                                  </div>`);
        let profiles = store.get('videoProfiles');
        let html = "";
        for(let i = 0;i < profiles.length;i++){
            html += `<option value="${profiles[i].name}">${profiles[i].name}</option>`
        }
        $('#videoProfiles').html(html);
    }
}

//Updates the video list when a video is checked
function checkVideo(e, index) {
    if (e.currentTarget.checked) {
        allowedVideos.push(videos[index].id);
    } else {
        allowedVideos.splice(allowedVideos.indexOf(videos[index].id), 1);
    }
    store.set("allowedVideos", allowedVideos);
}

//automated video selection buttons
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

//Video Profiles
function createProfile(id) {
    let profiles = store.get('videoProfiles');
    profiles.push({
        "name" : $(`#${id}`).val(),
        "videos" : allowedVideos
    });
    store.set('videoProfiles', profiles);
    selectVideo(-1);
}

function updateProfile(id) {
    let profiles = store.get('videoProfiles');
    for(let i = 0; i < profiles.length;i++){
        if(profiles[i].name === $(`#${id}`).val()){
            profiles[i].videos = allowedVideos;
            break;
        }
    }
    store.set('videoProfiles', profiles);
}

function removeProfile(id) {
    let profiles = store.get('videoProfiles');
    for(let i = 0; i < profiles.length;i++){
        if(profiles[i].name === $(`#${id}`).val()){
            profiles.splice(i,1);
            break;
        }
    }
    store.set('videoProfiles', profiles);
    selectVideo(-1);
}

function displayProfile(id) {
    let profiles = store.get('videoProfiles');
    for(let i = 0; i < profiles.length;i++){
        if(profiles[i].name === $(`#${id}`).val()){
            allowedVideos = profiles[i].videos;
            makeList();
            break;
        }
    }
    store.set("allowedVideos", allowedVideos);
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
        if (!val) {
            return false;
        }
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
            if (arr[i].substr(0, val.length).toUpperCase() == val.toUpperCase()) {
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
require('font-list-universal').getFonts().then(fonts => {
    autocomplete(document.getElementById('textFont'), fonts, () => {
        updateSetting('textFont', 'autocomplete')
    },);
    fontList = fonts
});
