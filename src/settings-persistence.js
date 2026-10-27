const fs = require('node:fs');
const path = require('node:path');
const {isDeepStrictEqual} = require('node:util');

// Only the main process owns this store. Reads and edits never wait for disk.
function createPersistentSettings(file, options = {}) {
    const io = options.io || fs.promises;
    const schedule = options.schedule || setTimeout;
    const cancel = options.cancel || clearTimeout;
    const report = options.report || console.error;
    let data = {};
    let saved;
    let timer;
    let running;
    let delay = 250;
    let lastError;
    let blocked = false;

    function parse(text) {
        const value = JSON.parse(text);
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new SyntaxError('Settings must contain a JSON object');
        }
        return value;
    }

    try {
        saved = fs.readFileSync(file, 'utf8');
        data = parse(saved);
    } catch (error) {
        if (error instanceof SyntaxError) {
            try {
                fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
                saved = undefined;
                try {
                    data = parse(fs.readFileSync(`${file}.bak`, 'utf8'));
                } catch {
                    data = {};
                }
                report('Aerial recovered damaged settings; the original file was preserved.', error);
            } catch (backupError) {
                blocked = true;
                report('Aerial could not preserve damaged settings. Saving is disabled for this session.', backupError);
            }
        } else if (error.code !== 'ENOENT') {
            // Never overwrite a file whose contents we could not read.
            blocked = true;
            report('Aerial could not read settings. Saving is disabled for this session.', error);
        }
    }

    function queue(wait = 50) {
        if (!timer && !running && !blocked) {
            timer = schedule(() => {
                timer = undefined;
                flush();
            }, wait);
            timer?.unref?.();
        }
    }

    async function writeAtomic(destination, text) {
        const temporary = `${destination}.tmp-${process.pid}`;
        try {
            const handle = await io.open(temporary, 'w');
            try {
                await handle.writeFile(text, 'utf8');
                await handle.sync();
            } finally {
                await handle.close();
            }
            await io.rename(temporary, destination);
        } finally {
            await io.unlink(temporary).catch(() => {});
        }
    }

    function flush() {
        if (timer) {
            cancel(timer);
            timer = undefined;
        }
        if (running) {
            return running;
        }
        if (blocked) {
            return Promise.resolve(false);
        }
        running = (async () => {
            try {
                await io.mkdir(path.dirname(file), {recursive: true});
                while (JSON.stringify(data, null, '\t') !== saved) {
                    const next = JSON.stringify(data, null, '\t');
                    if (saved !== undefined) {
                        await writeAtomic(`${file}.bak`, saved);
                    }
                    await writeAtomic(file, next);
                    saved = next;
                }
                lastError = undefined;
                delay = 250;
                return true;
            } catch (error) {
                if (lastError !== error.code) {
                    report(`Aerial could not save settings to ${file}. Changes remain in memory and saving will retry.`, error);
                }
                lastError = error.code;
                return false;
            }
        })().finally(() => {
            running = undefined;
            if (lastError) {
                queue(delay);
                delay = Math.min(delay * 2, 30000);
            }
        });
        return running;
    }

    return {
        get store() {
            return structuredClone(data);
        },
        get(key) {
            return structuredClone(data[key]);
        },
        set(key, value) {
            const changes = typeof key === 'string' ? {[key]: value} : key;
            if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
                throw new TypeError('Settings changes must be an object');
            }
            const next = {...data, ...structuredClone(changes)};
            // Reject values that cannot be persisted before accepting the edit.
            JSON.stringify(next);
            if (!isDeepStrictEqual(data, next)) {
                data = next;
                queue();
            }
        },
        clear() {
            data = {};
            queue();
        },
        flush
    };
}

module.exports = {createPersistentSettings};
