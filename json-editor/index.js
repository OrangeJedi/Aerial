const {ipcRenderer} = require('electron');
let videos = require("../videos.json");
const beautify = require("json-beautify");

const Store = require('electron-store');
const store = new Store();

document.getElementById('output').value = beautify(videos, null, 2,128);

function beautifyInput() {
    document.getElementById('input').value = beautify(JSON.parse(document.getElementById('input').value), null, 2,96);
}

function createJSON() {
    let newData = JSON.parse(document.getElementById('input').value);
    if(Array.isArray(newData.assets)){
        newData = newData.assets;
    }
    if(!Array.isArray(newData)){
        alert("Error: No Array Found");
        return null;
    }
    let list = [];
    for(let i = 0;i< newData.length;i++){
        list.push({
            'id' : newData[i].id,
            'accessibilityLabel' : newData[i].accessibilityLabel,
            'src' : {
                'H2641080p' : newData[i]["url-1080-H264"]
            }
            }
        )
    }
    document.getElementById('output').value = beautify(list,null,2,128);
    videos = list;
}

function updateJSON() {
    let newData = JSON.parse(document.getElementById('input').value);
    for (const vid in newData) {
        let index = videos.findIndex((e) => {
            if(vid === e.id){
                return true;
            }
        });
        if(index > -1) {
            videos[index].name = newData[vid].name;
            if (typeof newData[vid].pointsOfInterest === "object") {
                videos[index].pointsOfInterest = newData[vid].pointsOfInterest;
            }
        }
    }
    document.getElementById('output').value = beautify(videos,null,2,128);
}