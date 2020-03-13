const Store = require('electron-store');
const videos = require("../videos.json");
const store = new Store();

if(store.get('clock')){
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
    for(let i = 0; i < videos.length;i++){
        console.log(videos[i].name);
        videoList += `<a href="#" class="w3-bar-item w3-button videoMenuItem"><input type="checkbox" class="w3-check">${videos[i].name ? videos[i].name : videos[i].accessibilityLabel}</a>`;
    }
    videoList += "<br>";
    $('#videoList').html(videoList);
});