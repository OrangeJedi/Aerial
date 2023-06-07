let videos = electron.videos;
const beautify = electron.jsonBeautify;

document.getElementById('output').value = beautify(videos, null, 2,128);

function beautifyInput() {
    document.getElementById('input').value = beautify(JSON.parse(document.getElementById('input').value.replace(/(\/\*([\s\S]*?)\*\/)|(\/\/(.*)$)/gm, '')), null, 2,96);
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
                'H2641080p' : newData[i]["url-1080-H264"],
                'H2651080p' : newData[i]["url-1080-SDR"],
                'H2654k' : newData[i]["url-4K-SDR"]
            }
            }
        )
    }
    document.getElementById('output').value = beautify(list.sort(sortVideos),null,2,128);
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
            if(newData[vid].type){
                videos[index].type = newData[vid].type;
            }
            if(newData[vid].timeOfDay){
                videos[index].timeOfDay = newData[vid].timeOfDay;
            }
            if (typeof newData[vid].pointsOfInterest === "object") {
                videos[index].pointsOfInterest = newData[vid].pointsOfInterest;
            }
        }
    }
    document.getElementById('output').value = beautify(videos.sort(sortVideos),null,2,128);
}

function updateSource(){
    let newData = JSON.parse(document.getElementById('input').value);
    let newVideos = [];
    for (const vid in newData) {
        let index = videos.findIndex((e) => {
            if(newData[vid].id === e.id){
                return true;
            }
        });
        if(index > -1) {
            newVideos.push({
                'id' : videos[index].id,
                "accessibilityLabel": videos[index].accessibilityLabel,
                "name": videos[index].name,
                "pointsOfInterest": videos[index].pointsOfInterest,
                "type": videos[index].type,
                "timeOfDay": videos[index].timeOfDay,
                'src': newData[vid].src
            });
        }
    }
    console.log(newVideos.length,videos.length);
    document.getElementById('output').value = beautify(newVideos,null,2,128);
}

function addToJSON() {
    let newData = JSON.parse(document.getElementById('input').value);
    if(!Array.isArray(newData)){
        alert("Error: No Array Found");
        return null;
    }
    for (let i = 0; i < newData.length;i++) {
        let index = videos.findIndex((e) => {
            if(newData[i] === e.id){
                return true;
            }
        });
        if(index > -1) {
            videos[index][document.getElementById('attr').value] = document.getElementById('attrValue').value;
        }
    }
    document.getElementById('output').value = beautify(videos.sort(sortVideos),null,2,128);
}

function addPropertyToJSON() {
    let newData = JSON.parse(document.getElementById('input').value);
    for (const vid in newData) {
        console.log(vid);
        let index = videos.findIndex((e) => {
            if(vid === e.id){
                return true;
            }
        });
        if(index > -1) {
            videos[index][document.getElementById('attr').value] = newData[vid];
        }
    }
    document.getElementById('output').value = beautify(videos.sort(sortVideos),null,2,128);
}

function sortVideos(a,b){
    var nameA = a.accessibilityLabel.toUpperCase(); // ignore upper and lowercase
    var nameB = b.accessibilityLabel.toUpperCase(); // ignore upper and lowercase
    if (nameA < nameB) {
        return -1;
    }
    if (nameA > nameB) {
        return 1;
    }

    // names must be equal
    return 0;
}