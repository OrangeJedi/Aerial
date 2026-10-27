const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

test('different previews serialize encoders and a failed conversion releases the queue', async () => {
    const launches = [];
    const context = vm.createContext({
        module: {exports: {}},
        require: name => {
            if (name === 'fs') {
                return {existsSync: () => false, promises: {
                    mkdir: async () => {}, readdir: async () => [], rm: async () => {},
                    stat: async () => ({size: 1}), rename: async () => {}
                }};
            }
            if (name === 'child_process') {
                return {execFile: (executable, args, options, callback) => launches.push({args, callback})};
            }
            if (name === 'ffmpeg-static') {
                return 'ffmpeg';
            }
            return require(name);
        }
    });
    vm.runInContext(fs.readFileSync(require.resolve('../src/playback.js'), 'utf8'), context);
    const convert = context.module.exports.createCompatibilityPlayer(require('node:path').resolve('cache'));
    const first = convert({id: 'a', path: 'a.mov'});
    const failed = assert.rejects(first, /Encoder failed/);
    const second = convert({id: 'b', path: 'b.mov'});
    assert.equal(second, convert({id: 'b', path: 'b.mov'}));
    await new Promise(setImmediate);
    assert.equal(launches.length, 1);
    launches[0].callback(new Error('Encoder failed'));
    await failed;
    await new Promise(setImmediate);
    assert.equal(launches.length, 2);
    for (const {args} of launches) {
        const limits = args.flatMap((value, index) => value === '-threads' ? [args[index + 1]] : []);
        assert.deepEqual(Array.from(limits), ['2', '2']);
    }
    launches[1].callback();
    assert.match(await second, /^file:/);
});
