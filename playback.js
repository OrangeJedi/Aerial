const fs = require('fs');
const path = require('path');
const {createHash} = require('crypto');
const {execFile} = require('child_process');
const {pathToFileURL} = require('url');

function createCompatibilityPlayer(directory) {
    const pending = new Map();
    return function compatibleSource(video) {
        const input = video.path || video.src.H2641080p || video.src.H2651080p || video.src.H2654k || video.src.H2654k240;
        if (!input) {
            return Promise.reject(new Error('No video source available'));
        }
        const key = createHash('sha256').update(input).digest('hex');
        const output = path.join(directory, `${key}.mp4`);
        if (fs.existsSync(output)) {
            return Promise.resolve(pathToFileURL(output).href);
        }
        if (pending.has(key)) {
            return pending.get(key);
        }
        const task = (async () => {
            await fs.promises.mkdir(directory, {recursive: true});
            const temporary = `${output}.partial.mp4`;
            const executable = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
            try {
                await new Promise((resolve, reject) => {
                    execFile(executable, ['-nostdin', '-y', '-v', 'error', '-i', input,
                        '-map', '0:v:0', '-an', '-vf', 'fps=30,scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2',
                        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
                        '-movflags', '+faststart', temporary],
                    {windowsHide: true, timeout: 15 * 60 * 1000}, (error) => error ? reject(error) : resolve());
                });
                await fs.promises.rename(temporary, output);
                return pathToFileURL(output).href;
            } finally {
                await fs.promises.rm(temporary, {force: true});
            }
        })();
        pending.set(key, task);
        task.finally(() => pending.delete(key)).catch(() => {});
        return task;
    };
}

module.exports = {createCompatibilityPlayer};
