const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {downloadFile} = require('../src/download');

test('downloads follow redirects, reject HTTP errors and detect interrupted bodies', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aerial-download-'));
    const server = http.createServer((request, response) => {
        if (request.url === '/redirect') {
            response.writeHead(302, {location: '/video'}).end();
        } else if (request.url === '/loop') {
            response.writeHead(302, {location: '/loop'}).end();
        } else if (request.url === '/missing') {
            response.writeHead(404).end('Not found');
        } else if (request.url === '/broken') {
            response.writeHead(200, {'content-length': '100'});
            response.write('partial');
            setImmediate(() => response.destroy());
        } else {
            response.end('video bytes');
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        await fs.rm(directory, {recursive: true, force: true});
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const target = path.join(directory, 'video.mov');
    await downloadFile(`${base}/redirect`, target);
    assert.equal(await fs.readFile(target, 'utf8'), 'video bytes');
    await assert.rejects(downloadFile(`${base}/missing`, target), /HTTP 404/);
    assert.equal(await fs.readFile(target, 'utf8'), 'video bytes');
    await assert.rejects(downloadFile(`${base}/loop`, target), /redirects/);
    await assert.rejects(downloadFile(`${base}/broken`, target));
    await assert.rejects(downloadFile(`${base}/video`, path.join(directory, 'missing', 'file')), /ENOENT/);
    await assert.rejects(downloadFile('file:///video', target), /Unsupported/);
});
