const assert = require('node:assert/strict');
const {test} = require('node:test');
const {createSettingsStore} = require('../src/settings-store');
const {getVideoSources} = require('../src/video-sources');
const videos = require('../videos.json');

function fixture(initial = {}) {
    let data = structuredClone(initial);
    let reads = 0;
    let writes = 0;
    let expire;
    const settings = createSettingsStore({
        get store() {
            reads++;
            return structuredClone(data);
        },
        set store(value) {
            writes++;
            data = structuredClone(value);
        }
    }, callback => { expire = callback; });
    return {settings, expire: () => expire(), external: changes => Object.assign(data, changes),
        counts: () => ({reads, writes}), data: () => data};
}

test('the entire video catalog and settings fields share one read per task', () => {
    const f = fixture({allow4K: true, allowH265: true, allowedVideos: ['a']});
    for (const video of videos) {
        getVideoSources(video, f.settings);
    }
    f.settings.get('allowedVideos');
    assert.equal(f.counts().reads, 1);
    f.external({allow4K: false});
    f.expire();
    assert.equal(f.settings.get('allow4K'), false);
    assert.equal(f.counts().reads, 2);
});

test('unchanged saves do not write and a grouped save writes once', () => {
    const f = fixture({allowedVideos: ['a'], allow4K: true});
    f.settings.set('allowedVideos', ['a']);
    assert.equal(f.counts().writes, 0);
    f.settings.set({allowedVideos: ['a', 'b'], allow4K: false});
    assert.equal(f.counts().writes, 1);
    assert.equal(f.settings.get('allow4K'), false);
});

test('saving merges external changes and returned arrays cannot mutate the read cache', () => {
    const f = fixture({allowedVideos: ['a'], videoCacheSize: 1});
    const allowed = f.settings.get('allowedVideos');
    allowed.push('b');
    assert.deepEqual(f.settings.get('allowedVideos'), ['a']);
    f.external({videoCacheSize: 50});
    f.settings.set('allowedVideos', allowed);
    assert.equal(f.data().videoCacheSize, 50);
    assert.deepEqual(f.data().allowedVideos, ['a', 'b']);
});
