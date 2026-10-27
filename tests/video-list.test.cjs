const assert = require('node:assert/strict');
const {test} = require('node:test');
const {getVideoSources} = require('../video-sources');
const videos = require('../videos.json');

test('video list hides unavailable entries without changing indices or selections', async () => {
    const {visibleVideos} = await import('../web/config/video-model.js');
    for (const settings of [{}, {allowH265: false}, {allow4K: false}]) {
        const before = structuredClone(videos);
        const available = video => getVideoSources(video, {get: key => settings[key]});
        const result = visibleVideos(videos, available, video => video);
        const expected = videos.map((video, index) => available(video).length ? index : -1).filter(index => index >= 0);
        assert.deepEqual(result.map(item => item.index), expected);
        assert.deepEqual(videos, before);
    }
});

test('video search matches localized names and locations while preserving source filters and indices', async () => {
    const {visibleVideos} = await import('../web/config/video-model.js');
    const entries = [
        {name: 'Bridge', accessibilityLabel: 'London'},
        {name: 'River', accessibilityLabel: 'London'},
        {name: 'Bridge', accessibilityLabel: 'New York'}
    ];
    const sources = video => video === entries[1] ? [] : ['source'];
    const localize = video => ({...video, name: video.name === 'Bridge' ? 'Pont' : video.name});
    const search = query => visibleVideos(entries, sources, localize, query).map(item => item.index);
    assert.deepEqual(search('  LONDON pont  '), [0]);
    assert.deepEqual(search('bridge'), [0, 2]);
    assert.deepEqual(search('river'), []);
    assert.deepEqual(search('missing'), []);
    assert.deepEqual(search('  '), [0, 2]);
});

test('loading a profile preserves custom selection without mutating the profile', async () => {
    const {loadProfileVideos} = await import('../web/config/video-model.js');
    const profile = {videos: ['a', 'b', '_old-custom']};
    const result = loadProfileVideos(profile, ['c', '_custom'], new Set(['a', 'b', 'c']));
    assert.deepEqual(result, ['a', 'b', '_custom']);
    assert.deepEqual(profile.videos, ['a', 'b', '_old-custom']);
});

test('download policy removes opposing policies and preserves other videos', async () => {
    const {downloadChanges} = await import('../web/config/video-model.js');
    const values = {alwaysDownloadVideos: ['a', 'b'], neverDownloadVideos: ['a', 'c']};
    assert.deepEqual(downloadChanges('a', 'never', key => values[key]), {alwaysDownloadVideos: ['b'], neverDownloadVideos: ['c', 'a']});
    assert.deepEqual(downloadChanges('a', 'whenChecked', key => values[key]), {alwaysDownloadVideos: ['b'], neverDownloadVideos: ['c']});
    assert.deepEqual(values, {alwaysDownloadVideos: ['a', 'b'], neverDownloadVideos: ['a', 'c']});
});
