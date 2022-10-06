const {contextBridge} = require("electron");

contextBridge.exposeInMainWorld("electron", {
        videos: require("../videos.json"),
        jsonBeautify: require("json-beautify")
    }
)