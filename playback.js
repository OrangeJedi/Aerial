const fs = require('fs');
const path = require('path');
const {createHash, randomUUID} = require('crypto');
const {execFile} = require('child_process');
const {pathToFileURL, fileURLToPath} = require('url');

async function deleteConvertedOriginal(source, original) {
    const output = fileURLToPath(source);
    if ((await fs.promises.stat(output)).size === 0 || path.resolve(output) === path.resolve(original)) {
        throw new Error('No completed conversion available');
    }
    await fs.promises.rm(original, {force: true});
}

function convertedPath(directory, video) {
    const identity = video.id || video.path;
    return path.join(directory, `${createHash('sha256').update(identity).digest('hex')}.mp4`);
}

function createCompatibilityPlayer(location) {
    const pending = new Map();
    let queue = Promise.resolve();
    return function compatibleSource(video) {
        const input = video.path || video.src.H2641080p || video.src.H2651080p || video.src.H2654k || video.src.H2654k240;
        if (!input) {
            return Promise.reject(new Error('No video source available'));
        }
        const directory = typeof location === 'function' ? location() : location;
        const output = convertedPath(directory, {...video, path: input});
        const key = output;
        if (fs.existsSync(output)) {
            return Promise.resolve(pathToFileURL(output).href);
        }
        if (pending.has(key)) {
            return pending.get(key);
        }
        const task = queue.then(async () => {
            await fs.promises.mkdir(directory, {recursive: true});
            // Each attempt owns its temporary file, including after an abrupt app exit.
            const temporary = `${output}.${randomUUID()}.partial.mp4`;
            const executable = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
            try {
                const prefix = path.basename(output);
                for (const file of await fs.promises.readdir(directory)) {
                    if (file.startsWith(`${prefix}.`) && file.endsWith('.partial.mp4')) {
                        try {
                            await fs.promises.rm(path.join(directory, file), {force: true});
                        } catch (error) {
                            // An orphaned encoder may still hold its file open on Windows.
                            if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) {
                                throw error;
                            }
                        }
                    }
                }
                await new Promise((resolve, reject) => {
                    execFile(executable, ['-nostdin', '-y', '-v', 'error', '-threads', '2', '-i', input,
                        '-map', '0:v:0', '-an', '-vf', 'fps=30,scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2',
                        '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
                        '-movflags', '+faststart', temporary],
                    {windowsHide: true, timeout: 15 * 60 * 1000}, (error) => error ? reject(error) : resolve());
                });
                if ((await fs.promises.stat(temporary)).size === 0) {
                    throw new Error('Conversion produced an empty video');
                }
                await fs.promises.rename(temporary, output);
                return pathToFileURL(output).href;
            } finally {
                await fs.promises.rm(temporary, {force: true});
            }
        });
        // Rapid preview selections must not launch multiple CPU-heavy encoders.
        queue = task.catch(() => {});
        pending.set(key, task);
        task.finally(() => pending.delete(key)).catch(() => {});
        return task;
    };
}

module.exports = {createCompatibilityPlayer, convertedPath, deleteConvertedOriginal};
