const videoPlayback = (() => {
    const loads = new WeakMap();
    const failures = new Map();
    const compatibleSources = new Map();
    const failureCooldown = 5 * 60 * 1000;

    function markFailed(id, source) {
        if (!source) {
            return;
        }
        if (!failures.has(id)) {
            failures.set(id, new Map());
        }
        const expires = Date.now() + failureCooldown;
        failures.get(id).set(source, expires);
        const compatible = compatibleSources.get(id);
        if (compatible?.source === source) {
            compatible.failedUntil = expires;
        }
    }

    function failedSources(id) {
        const sources = failures.get(id);
        if (!sources) {
            return [];
        }
        const now = Date.now();
        for (const [source, expires] of sources) {
            if (expires <= now) {
                sources.delete(source);
            }
        }
        if (!sources.size) {
            failures.delete(id);
        }
        return [...sources.keys()];
    }

    function bufferedAhead(player) {
        const ranges = player.buffered;
        for (let i = 0; i < ranges.length; i++) {
            if (ranges.start(i) <= player.currentTime && ranges.end(i) > player.currentTime) {
                return ranges.end(i) - player.currentTime;
            }
        }
        return 0;
    }

    function releaseMedia(player) {
        player.pause?.();
        player.removeAttribute('src');
        player.load();
        player.playbackSource = null;
    }

    // Settled loads may still supply a visible frozen frame; cancel preserves them.
    function cancel(player) {
        const state = loads.get(player);
        if (state && !state.cancelled) {
            state.cancel();
            if (state.pending) {
                releaseMedia(player);
            }
        }
    }

    function release(player) {
        const pending = loads.get(player)?.pending;
        cancel(player);
        if (!pending) {
            releaseMedia(player);
        }
    }

    async function load(player, video, onStatus = () => {}, options = {}) {
        cancel(player);
        if (!video || typeof video.id !== 'string' || !video.id) {
            throw new Error('Video metadata is missing or invalid');
        }
        const state = {pending: true, cancelled: false, abortAttempt: null};
        const cancelled = new Promise((resolve, reject) => {
            state.cancel = () => {
                state.cancelled = true;
                const error = new Error('Playback cancelled');
                state.abortAttempt?.(error);
                reject(error);
            };
        });
        loads.set(player, state);
        player.pause?.();
        player.playbackSource = null;

        async function attempt(source) {
            if (state.cancelled || loads.get(player) !== state) {
                throw new Error('Playback cancelled');
            }
            try {
                await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => finish(new Error('Video loading timed out')), 45000);
                    const failed = () => finish(new Error(player.error ? player.error.message : 'Video failed'));
                    let bufferDeadline;
                    const readinessEvents = ['loadeddata', 'progress', 'canplay', 'durationchange'];
                    const ready = () => {
                        if (player.readyState < 2) {
                            return;
                        }
                        const remaining = Number.isFinite(player.duration)
                            ? Math.max(0, player.duration - player.currentTime) : Infinity;
                        if (bufferedAhead(player) >= Math.min(2 * (player.playbackRate || 1), remaining)) {
                            finish();
                        } else if (!bufferDeadline) {
                            // Do not hold up playback indefinitely if the browser limits paused buffering.
                            bufferDeadline = setTimeout(() => finish(), 3000);
                        }
                    };
                    function finish(error) {
                        clearTimeout(timer);
                        clearTimeout(bufferDeadline);
                        readinessEvents.forEach(event => player.removeEventListener(event, ready));
                        player.removeEventListener('error', failed);
                        state.abortAttempt = null;
                        error ? reject(error) : resolve();
                    }
                    state.abortAttempt = finish;
                    player.playbackSource = source;
                    readinessEvents.forEach(event => player.addEventListener(event, ready));
                    player.addEventListener('error', failed);
                    try {
                        player.src = source;
                        player.load();
                    } catch (error) {
                        finish(error);
                    }
                });
            } catch (error) {
                if (!state.cancelled) {
                    markFailed(video.id, source);
                }
                throw error;
            }
        }

        async function prepare() {
            const skipped = new Set([...failedSources(video.id), ...(options.skipSources || [])]);
            const available = electron.videoSources(video);
            if (!available.length) {
                throw new Error('Video is excluded by playback settings');
            }
            const converted = electron.convertedVideo?.(video)
                ? await electron.ipcRenderer.invoke('compatibleVideo', video.id) : null;
            const sources = converted ? [converted] : video.path ? available : [
                ...((electron.store.get('downloadedVideos') || []).includes(video.id)
                    ? [`${electron.store.get('cachePath')}/${video.id}.mov`] : []),
                ...available
            ].filter(Boolean);
            for (const source of new Set(sources.filter(source => !skipped.has(source)))) {
                try {
                    await attempt(source);
                    onStatus('');
                    return;
                } catch (error) {
                    if (state.cancelled) {
                        throw error;
                    }
                }
            }
            if (!electron.store.get('prepareCompatibleVideos')) {
                throw new Error('No playable video source; compatible video preparation is disabled');
            }
            const compatible = compatibleSources.get(video.id);
            let source = compatible && (!compatible.failedUntil || compatible.failedUntil > Date.now())
                ? compatible.source : null;
            if (!source) {
                onStatus('Preparing a compatible video. This may take a few minutes the first time.');
                source = await electron.ipcRenderer.invoke('compatibleVideo', video.id);
                if (state.cancelled || loads.get(player) !== state) {
                    throw new Error('Playback cancelled');
                }
                compatibleSources.set(video.id, {source});
            }
            if (skipped.has(source)) {
                throw new Error('Compatible video could not play smoothly');
            }
            await attempt(source);
            onStatus('');
        }

        try {
            await Promise.race([prepare(), cancelled]);
        } finally {
            state.pending = false;
        }
    }

    return {load, cancel, release, markFailed, bufferedAhead};
})();
