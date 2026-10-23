const fs = require('node:fs');

const tags = ['day', 'night', 'twilight'];

function readCatalog(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveTag(file, id, tag) {
    if (!tags.includes(tag)) {
        throw new Error('Invalid time of day');
    }
    // Read again so unrelated changes made while the classifier is open survive.
    const original = fs.readFileSync(file, 'utf8');
    const videos = JSON.parse(original);
    const video = videos.find(item => item.id === id);
    if (!video) {
        throw new Error('Video no longer exists');
    }
    video.timeOfDay = tag;
    const newline = original.includes('\r\n') ? '\r\n' : '\n';
    const output = JSON.stringify(videos, null, 2).replace(/\n/g, newline) + (original.endsWith('\n') ? newline : '');
    const temporary = file + '.classifier.tmp';
    fs.writeFileSync(temporary, output);
    fs.renameSync(temporary, file);
    return videos;
}

module.exports = {readCatalog, saveTag};
