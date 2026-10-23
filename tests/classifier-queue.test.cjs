const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createFrameQueue} = require('../tools/classifier/frame-queue.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('frame queue limits concurrency, shares requests and prioritizes the current frame', async () => {
    const started = [];
    const finish = new Map();
    const queue = createFrameQueue(id => {
        started.push(id);
        return new Promise(resolve => finish.set(id, resolve));
    }, 2);
    const a = queue.request('a', true);
    const b = queue.request('b', true);
    const c = queue.request('c', true);
    const d = queue.request('d', true);
    assert.equal(queue.request('d'), d);
    assert.equal(queue.request('a'), a);
    await tick();
    assert.deepEqual(started, ['a', 'b']);
    finish.get('a')('frame-a');
    await tick();
    assert.deepEqual(started, ['a', 'b', 'd']);
    finish.get('b')('frame-b');
    await tick();
    assert.deepEqual(started, ['a', 'b', 'd', 'c']);
    finish.get('c')('frame-c');
    finish.get('d')('frame-d');
    assert.deepEqual(await Promise.all([a, b, c, d]), ['frame-a', 'frame-b', 'frame-c', 'frame-d']);
});

test('failed background work releases its slot and allows retry', async () => {
    let attempts = 0;
    const queue = createFrameQueue(async () => {
        if (++attempts === 1) {
            throw new Error('Offline');
        }
        return 'frame';
    }, 1);
    await assert.rejects(queue.request('a', true), /Offline/);
    await tick();
    assert.equal(await queue.request('a'), 'frame');
    queue.stop();
    await assert.rejects(queue.request('b'), /closing/);
});
