const Store = require('electron-store');
const videos = require("../videos.json");
const store = new Store();

let allowedVideos = store.get("allowedVideos");

if(store.get('clock')){
    console.log('hello');
    document.getElementById("showClock").checked = true;
}

function updateClock() {
    store.set('clock', document.getElementById("showClock").checked)
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

$(document).ready(()=>{
     let videoList = "<h3 class=\"w3-bar-item\"><i class=\"fa fa-film\"></i> Videos</h3>";
     console.log(videos.length);
    for(let i = 0; i < videos.length;i++){
        videoList += `<span><input type="checkbox" ${allowedVideos.includes(videos[i].id) ? "checked" : ""} class="w3-check" onclick="checkVideo(event,${i})">
                      <a style="display: inline;" href="#" id="videoList-${i}" onclick="selectVideo(${i})" class="w3-bar-item w3-button videoListItem">
                      ${videos[i].name ? videos[i].name : videos[i].accessibilityLabel}
                      </a><br>`;
    }
    videoList += "<br><br><br><br><br>";
    $('#videoList').html(videoList);
});

function selectVideo(index) {
    let x = document.getElementsByClassName("videoListItem");
    for (i = 0; i < x.length; i++) {
        x[i].className = x[i].className.replace("w3-deep-orange", "");
    }
    document.getElementById("videoList-" + index).className += " w3-deep-orange";
    $('#videoPlayer').attr("src", videos[index].src.H2641080p);
    $('#videoName').text(videos[index].accessibilityLabel);
}

function checkVideo(e,index) {
    if(e.currentTarget.checked){
        allowedVideos.push(videos[index].id);
    }else{
        allowedVideos.splice(allowedVideos.indexOf(videos[index].id),1);
    }
    store.set("allowedVideos", allowedVideos);
    console.log(allowedVideos.length, store.get('allowedVideos').length);
}