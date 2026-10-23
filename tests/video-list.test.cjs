const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {getVideoSources} = require('../video-sources');
const videos = require('../videos.json');

test('video list hides unavailable entries without changing indices or selections', () => {
    const script = fs.readFileSync(path.join(__dirname, '../web/config.js'), 'utf8');
    const start = script.indexOf('function makeList()');
    const end = script.indexOf('$(document).ready', start);
    for (const settings of [{}, {allowH265: false}, {allow4K: false}]) {
        let html;
        const allowedVideos = videos.map(video => video.id);
        const context = vm.createContext({
            videos, allowedVideos,
            electron: {videoSources: video => getVideoSources(video, {get: key => settings[key]})},
            $: () => ({html: value => { html = value; }})
        });
        vm.runInContext(script.slice(start, end) + '\nmakeList();', context);
        let expected = 0;
        videos.forEach((video, index) => {
            const visible = getVideoSources(video, {get: key => settings[key]}).length > 0;
            assert.equal(html.includes(`id="videoList-${index}"`), visible);
            if (visible) {
                expected++;
            }
        });
        assert.equal((html.match(/id="videoList-\d+"/g) || []).length, expected);
        assert.equal(allowedVideos.length, videos.length);
    }
});
