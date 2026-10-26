const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const {pipeline} = require('node:stream/promises');

async function downloadFile(url, targetPath, redirects = 0) {
    const address = new URL(url);
    if (!['http:', 'https:'].includes(address.protocol)) {
        throw new Error(`Unsupported download protocol: ${address.protocol}`);
    }
    const transport = address.protocol === 'https:' ? https : http;
    const response = await new Promise((resolve, reject) => {
        const request = transport.get(address, {
            // Only Apple's legacy video host needs the certificate exception.
            rejectUnauthorized: address.hostname !== 'sylvan.apple.com'
        }, resolve);
        request.on('error', reject);
        request.setTimeout(60000, () => request.destroy(new Error('Video download timed out')));
    });
    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (!response.headers.location || redirects >= 10) {
            throw new Error('Invalid or excessive video download redirects');
        }
        return downloadFile(new URL(response.headers.location, address), targetPath, redirects + 1);
    }
    if (response.statusCode !== 200) {
        response.resume();
        throw new Error(`Video download returned HTTP ${response.statusCode}`);
    }
    // Wait for the file to finish and propagate network and disk errors.
    await pipeline(response, fs.createWriteStream(targetPath));
}

module.exports = {downloadFile};
