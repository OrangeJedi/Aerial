const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

test('cache pruning avoids scans and writes when nothing needs removing', async () => {
    const script = fs.readFileSync(require.resolve('../app.js'), 'utf8');
    const start = script.indexOf('// Cache maintenance runs');
    const end = script.indexOf('//open & close functions', start);
    let operations = 0;
    const context = vm.createContext({
        cachePath: 'cache', downloading: false,
        store: {get store() { return {downloadedVideos: ['a'], neverDownloadVideos: []}; }},
        path: require('node:path'), console,
        fs: {promises: new Proxy({}, {get: () => () => { operations++; throw new Error('Unexpected I/O'); }})}
    });
    vm.runInContext(script.slice(start, end), context);
    await context.pruneVideoCache();
    await context.pruneVideoCache();
    assert.equal(operations, 0);
});
