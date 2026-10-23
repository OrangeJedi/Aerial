const videoPlayback = (() => {
    const loads = new WeakMap();

    async function load(player, video, onStatus = () => {}, options = {}) {
        const previous = loads.get(player);
        if (previous) {
            previous.cancel();
        }
        const state = {cancel: () => {}, cancelled: false};
        loads.set(player, state);
        player.pause?.();
        player.playbackSource = null;
        const skipped = new Set(options.skipSources || []);
        const available = electron.videoSources(video);
        if (!available.length) {
            throw new Error('Video is excluded by playback settings');
        }
        const sources = video.path ? [video.path] : [
            ...((electron.store.get('downloadedVideos') || []).includes(video.id) ? [`${electron.store.get('cachePath')}/${video.id}.mov`] : []),
            ...available
        ].filter(Boolean);

        async function attempt(source) {
            if (state.cancelled || loads.get(player) !== state) {
                throw new Error('Playback cancelled');
            }
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => finish(new Error('Video loading timed out')), 45000);
                const failed = () => finish(new Error(player.error ? player.error.message : 'Video failed'));
                const ready = () => finish();
                function finish(error) {
                    clearTimeout(timer);
                    player.removeEventListener('loadeddata', ready);
                    player.removeEventListener('error', failed);
                    state.cancel = () => { state.cancelled = true; };
                    error ? reject(error) : resolve();
                }
                state.cancel = () => {
                    state.cancelled = true;
                    finish(new Error('Playback cancelled'));
                };
                player.playbackSource = source;
                player.addEventListener('loadeddata', ready);
                player.addEventListener('error', failed);
                player.src = source;
                player.load();
            });
        }

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
        onStatus('Preparing a compatible video. This may take a few minutes the first time.');
        const source = await electron.ipcRenderer.invoke('compatibleVideo', video.id);
        if (state.cancelled || loads.get(player) !== state) {
            throw new Error('Playback cancelled');
        }
        if (skipped.has(source)) {
            throw new Error('Compatible video could not play smoothly');
        }
        await attempt(source);
        onStatus('');
    }

    function cancel(player) {
        const state = loads.get(player);
        if (state) {
            state.cancel();
        }
    }

    return {load, cancel};
})();
