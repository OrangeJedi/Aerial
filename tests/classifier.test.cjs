const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {readCatalog, saveTag} = require('../tools/classifier/catalog.cjs');

test('classifier persists every tag and preserves unrelated catalog data across saves', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aerial-classifier-'));
    const file = path.join(directory, 'videos.json');
    try {
        fs.writeFileSync(file, JSON.stringify([{id: 'a', src: {H2641080p: 'source'}}, {id: 'b', name: 'Original'}], null, 2));
        for (const tag of ['day', 'night', 'twilight']) {
            saveTag(file, 'a', tag);
            assert.equal(readCatalog(file)[0].timeOfDay, tag);
        }
        const external = readCatalog(file);
        external[1].name = 'Edited elsewhere';
        fs.writeFileSync(file, JSON.stringify(external));
        saveTag(file, 'a', 'day');
        assert.equal(readCatalog(file)[1].name, 'Edited elsewhere');
        assert.deepEqual(readCatalog(file)[0].src, {H2641080p: 'source'});
        const before = fs.readFileSync(file, 'utf8');
        assert.throws(() => saveTag(file, 'a', 'invalid'), /Invalid/);
        assert.throws(() => saveTag(file, 'missing', 'day'), /no longer exists/);
        assert.equal(fs.readFileSync(file, 'utf8'), before);
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});
