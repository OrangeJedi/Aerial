const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../web/screensaver.js'), 'utf8');
const inputSource = source.slice(source.indexOf('function quitApp()'), source.indexOf('function resetLayer('));

for (const movement of [undefined, true, false]) {
    for (const click of [undefined, true, false]) {
        test(`mouse wake switches are independent: movement=${movement}, click=${click}`, () => {
            const handlers = new Map();
            const timers = [];
            const sent = [];
            vm.runInNewContext(inputSource, {
                document: {addEventListener: (event, callback) => handlers.set(event, callback)},
                setTimeout: (callback, delay) => {
                    assert.equal(delay, 1500);
                    timers.push(callback);
                },
                electron: {
                    store: {get: key => key === 'wakeOnMouseMovement' ? movement : click},
                    ipcRenderer: {send: (...args) => sent.push(args)}
                }
            });
            handlers.get('keydown')({code: 'Escape'});
            assert.deepEqual(sent.shift(), ['keyPress', 'Escape']);
            assert.equal(handlers.has('mousedown'), click !== false);
            if (click !== false) {
                handlers.get('mousedown')();
                assert.deepEqual(sent.shift(), ['quitApp']);
            }
            assert.equal(handlers.has('mousemove'), false);
            assert.equal(timers.length, movement !== false ? 1 : 0);
            timers.forEach(callback => callback());
            assert.equal(handlers.has('mousemove'), movement !== false);
            if (movement !== false) {
                handlers.get('mousemove')({movementX: 3, movementY: 4});
                assert.equal(sent.length, 0);
                handlers.get('mousemove')({movementX: 4, movementY: 4});
                assert.deepEqual(sent.shift(), ['quitApp']);
            }
            assert.equal(sent.length, 0);
        });
    }
}
