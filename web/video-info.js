const videos = structuredClone(electron.videos);
let types = ["cityscape", "landscape", "underwater", "space"];
let timeOfDays = [undefined, "day", "night"];


function renderVideos() {
    let typeFilter = document.getElementById("filterTypeSelect").value;
    let toDFilter = document.getElementById("filterToDSelect").value;
    if (toDFilter === "undefined") {
        toDFilter = undefined;
    }
    let html = "";
    for (let i = 0; i < videos.length; i++) {
        let display = true;
        if(typeFilter !== ".*"){
            if(videos[i].type !== typeFilter){
                display = false;
            }
        }
        if(toDFilter !== ".*"){
            if(videos[i].timeOfDay !== toDFilter){
                display = false;
            }
        }
        if (display){
            html += `<div id="video-${i}" style="padding: 1%">
                <h3>${videos[i].name}</h3>
                <div class="w3-cell-row"></div>
                    <div class="w3-container w3-cell">
                        <!--<video src="${videos[i].src.H2641080p}" width="30%"></video>-->
                        <button onclick="displayVideoModal('${videos[i].src.H2641080p}')">Show Video</button>
                    </div>
                    <div class="w3-container w3-cell">
                        ID: <span style="color: #9e9e9e">${videos[i].id}</span>
                        <br>
                        Accessibility Label: <input id="video-${i}-accessibilityLabel" value="${videos[i].accessibilityLabel}" />
                        <br>
                        Name: <input id="video-${i}-name" value="${videos[i].name}" />                 
                        <br>
                        Type: ${createTypeSelect(videos[i].type, `video-${i}-type`)}
                        <br>
                        Time of Day: ${createTimeOfDaySelect(videos[i].timeOfDay, `video-${i}-timeOfDay`)}
                    </div>
                    <div class="w3-container w3-cell">
                        Source: <br>
                        <textarea id="videoSource-${i}">${JSON.stringify(videos[i].src)}</textarea>
                        <br>
                        Points Of Interest: <br>
                        <textarea id="videoPOI-${i}">${JSON.stringify(videos[i].pointsOfInterest)}</textarea>
                    </div>
                </div>
             </div>`;
        }
    }
    document.getElementById("videoList").innerHTML = html;
}
renderVideos();

function displayVideoModal(videoSRC) {
    document.getElementById('videoModal').style.display = 'block';
    document.getElementById('modalVideo').src = videoSRC;
}

function displayFilterModal() {
    document.getElementById('filterModal').style.display = 'block';
}

function createTypeSelect(selected, id) {
    let html = `<select id="${id}">`;
    types.forEach((value, index) => {
        html += `<option ${value === selected ? "selected" : ""} value="${value}">${value}</option>`
    })
    html += "</select>";
    return html;
}

function createTimeOfDaySelect(selected, id) {
    let html = `<select id="${id}">`;
    timeOfDays.forEach((value, index) => {
        html += `<option ${value === selected ? "selected" : ""} value="${value}">${value}</option>`
    })
    html += "</select>";
    return html;
}

function exportData() {
    collectData();
    document.getElementById('exportModal').style.display = 'block';
    document.getElementById('exportText').value = JSON.stringify(videos);
}

function collectData() {
    for (let i = 0; i < videos.length; i++) {
        videos[i].accessibilityLabel = document.getElementById(`video-${i}-accessibilityLabel`).value;
        videos[i].name = document.getElementById(`video-${i}-name`).value;
        videos[i].type = document.getElementById(`video-${i}-type`).value;
        videos[i].timeOfDay = document.getElementById(`video-${i}-timeOfDay`).value;
        let srcData = document.getElementById(`videoSource-${i}`).value;
        try {
            srcData = JSON.parse(srcData);
            videos[i].src = srcData;
        } catch (err) {
            alert(`Invalid source JSON for ${videos[i].name} (${videos[i].id})`);
            return false;
        }
        let poiData = document.getElementById(`videoPOI-${i}`).value;
        try {
            poiData = JSON.parse(poiData);
            videos[i].pointsOfInterest = poiData;
        } catch (err) {
            alert(`Invalid PoI JSON for ${videos[i].name} (${videos[i].id})`);
            return false;
        }
    }

    return videos;
}

function setFilters(){
    document.getElementById('filterModal').style.display = 'none';
    renderVideos();
}