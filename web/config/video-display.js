import {api, element, button, section, ask, notify, send, changed} from './shared.js';
import {downloadChanges, loadProfileVideos} from './video-model.js';

export function initVideoDisplay(root) {
    let player;
    let selected = -1;
    let generation = 0;
    const builtInIds = new Set(api.videos.map(video => video.id));

    function stop() {
        generation++;
        if (player) {
            videoPlayback.release(player);
            player = null;
        }
    }

    function saveAllowed(ids) {
        api.store.set('allowedVideos', [...new Set(ids)]);
        changed(['allowedVideos']);
        send('refreshCache');
    }

    function general() {
        const current = () => api.store.get('allowedVideos') || [];
        const playable = () => api.videos.filter(video => api.videoSources(video).length).map(video => video.id);
        const categories = element('select', {'aria-label': 'Video category'}, ...['cityscape', 'landscape', 'space', 'underwater'].map(value => element('option', {value}, value[0].toUpperCase() + value.slice(1))));
        const matching = () => api.videos.filter(video => video.type === categories.value && api.videoSources(video).length).map(video => video.id);
        const selection = section('Video selection', element('div', {className: 'card padded'},
            element('p', {}, 'Choose the videos Aerial plays. Your selection is shared across screens.'),
            element('div', {className: 'actions'},
                button('Select all', () => saveAllowed([...current(), ...playable()])),
                button('Deselect all', () => saveAllowed(current().filter(id => !builtInIds.has(id))))),
            element('br'),
            element('div', {className: 'actions'}, categories,
                button('Select category', () => saveAllowed([...current(), ...matching()])),
                button('Deselect category', () => { const ids = new Set(matching()); saveAllowed(current().filter(id => !ids.has(id))); }))));

        const profiles = element('select', {id: 'video-profiles', className: 'profile-name', 'aria-label': 'Saved profile'});
        const profileButtons = [];
        function refreshProfiles() {
            const previous = profiles.value;
            const saved = api.store.get('videoProfiles') || [];
            profiles.replaceChildren(...saved.map((profile, index) => element('option', {value: String(index)}, profile.name)));
            if (!saved.length) {
                profiles.append(element('option', {value: ''}, 'No saved profiles'));
            } else if (Number(previous) < saved.length) {
                profiles.value = previous || '0';
            }
            profiles.disabled = !saved.length;
            profileButtons.forEach(control => { control.disabled = !saved.length; });
        }
        function chosen() {
            return (api.store.get('videoProfiles') || [])[Number(profiles.value)];
        }
        const load = button('Load', () => {
            const profile = chosen();
            if (profile) {
                saveAllowed(loadProfileVideos(profile, current(), builtInIds));
                notify(`Loaded ${profile.name}.`);
            }
        });
        const update = button('Update', () => {
            const saved = api.store.get('videoProfiles') || [];
            const profile = saved[Number(profiles.value)];
            if (profile) {
                profile.videos = current().filter(id => builtInIds.has(id));
                api.store.set('videoProfiles', saved);
                notify(`Updated ${profile.name}.`);
            }
        });
        const remove = button('Delete', async () => {
            const profile = chosen();
            if (profile && await ask('Delete profile?', `Delete “${profile.name}”? Your current video selection will be kept.`, {confirm: 'Delete', danger: true})) {
                const saved = api.store.get('videoProfiles') || [];
                saved.splice(Number(profiles.value), 1);
                api.store.set('videoProfiles', saved);
                refreshProfiles();
            }
        }, 'danger');
        profileButtons.push(load, update, remove);
        const create = button('Create profile', async () => {
            const name = await ask('Create profile', 'Save your current video selection.', {input: '', confirm: 'Create'});
            if (name === null) {
                return;
            }
            const saved = api.store.get('videoProfiles') || [];
            if (!name.trim() || saved.some(profile => profile.name.toLowerCase() === name.trim().toLowerCase())) {
                notify('Enter a unique profile name.');
                return;
            }
            saved.push({name: name.trim(), videos: current().filter(id => builtInIds.has(id))});
            api.store.set('videoProfiles', saved);
            refreshProfiles();
            profiles.value = String(saved.length - 1);
        }, 'primary');
        refreshProfiles();
        const profileSection = section('Profiles', element('div', {className: 'card padded'},
            element('p', {}, 'Save and recall a selection of videos. Custom video selections are kept when loading a profile.'),
            profiles, element('br'), element('br'), element('div', {className: 'actions'}, load, update, remove, create)));
        const mode = element('select', {'aria-label': 'Download policy for all videos'},
            element('option', {value: 'whenChecked'}, 'Download when checked'),
            element('option', {value: 'always'}, 'Always download'),
            element('option', {value: 'never'}, 'Never download'));
        const downloads = section('Downloads', element('div', {className: 'card padded'},
            element('p', {}, 'Apply a download policy to all built-in videos.'),
            element('div', {className: 'actions'}, mode, button('Apply to all', () => {
                const ids = api.videos.map(video => video.id);
                api.store.set({alwaysDownloadVideos: mode.value === 'always' ? ids : [], neverDownloadVideos: mode.value === 'never' ? ids : []});
                send('refreshCache');
                notify('Download policy updated.');
            }))));
        root.append(selection, profileSection, downloads);
    }

    function show(index) {
        stop();
        selected = index;
        root.replaceChildren();
        if (index < 0) {
            general();
            return;
        }
        const video = api.videos[index];
        const token = generation;
        player = element('video', {className: 'video-preview', controls: true, loop: true, playsInline: true, 'aria-label': api.videoText(video).name || api.videoText(video).accessibilityLabel});
        const media = player;
        const status = element('p', {className: 'help preview-status', role: 'status'}, 'Loading video…');
        root.append(media, status);
        const speedValue = element('output', {htmlFor: 'video-speed'});
        const speedSteps = [
            ...Array.from({length: 19}, (_, index) => (10 + index * 5) / 100),
            ...Array.from({length: 15}, (_, index) => (11 + index) / 10),
            ...Array.from({length: 15}, (_, index) => (6 + index) / 2)
        ];
        const speedSlider = element('input', {id: 'video-speed', type: 'range', min: '-100', max: '100', step: 'any', 'aria-label': 'Playback speed for this video'});
        function refreshSpeed(rate = videoPlayback.speed(video.id)) {
            speedSlider.value = String(Math.log10(Math.max(0.1, Math.min(10, rate))) * 100);
            speedValue.textContent = `${Number(rate.toFixed(2))}×`;
            speedSlider.setAttribute('aria-valuetext', `${Number(rate.toFixed(2))}×`);
            media.defaultPlaybackRate = rate;
            media.playbackRate = rate;
        }
        function saveSpeed(rate) {
            api.store.set('videoPlaybackSpeeds', {...api.store.get('videoPlaybackSpeeds'), [video.id]: rate});
            refreshSpeed(rate);
            changed(['videoPlaybackSpeeds']);
        }
        speedSlider.addEventListener('input', () => {
            const requested = 10 ** (Number(speedSlider.value) / 100);
            const rate = speedSteps.reduce((closest, value) => Math.abs(value - requested) < Math.abs(closest - requested) ? value : closest);
            saveSpeed(rate);
        });
        speedSlider.addEventListener('keydown', event => {
            const direction = {ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5}[event.key];
            if (!direction && event.key !== 'Home' && event.key !== 'End') {
                return;
            }
            event.preventDefault();
            const current = media.playbackRate;
            const index = direction > 0 ? speedSteps.findIndex(value => value > current + 0.001)
                : speedSteps.findLastIndex(value => value < current - 0.001);
            const next = direction > 0 ? (index < 0 ? speedSteps.length - 1 : index) + direction - 1
                : (index < 0 ? 0 : index) + direction + 1;
            saveSpeed(event.key === 'Home' ? 0.1 : event.key === 'End' ? 10
                : speedSteps[Math.max(0, Math.min(speedSteps.length - 1, next))]);
        });
        const resetSpeed = button('', () => {
            const speeds = {...api.store.get('videoPlaybackSpeeds')};
            delete speeds[video.id];
            api.store.set('videoPlaybackSpeeds', speeds);
            refreshSpeed();
            changed(['videoPlaybackSpeeds']);
        });
        resetSpeed.className = 'video-speed-reset';
        resetSpeed.setAttribute('aria-label', 'Reset to global playback speed');
        resetSpeed.title = 'Reset to global playback speed';
        resetSpeed.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 1 1 9 9 9.75 9.75 0 0 1-6.74-2.74"/><path d="M3 3v8h8"/></svg>';
        refreshSpeed();
        root.append(element('section', {className: 'section video-speed-section'},
            element('div', {className: 'video-speed-heading'}, element('h2', {}, 'Playback Speed'), speedValue),
            element('div', {className: 'video-speed-control'}, speedSlider, resetSpeed)));
        const cached = (api.store.get('downloadedVideos') || []).includes(video.id);
        const downloadCard = element('div', {className: 'card padded'}, element('p', {}, cached ? 'Downloaded to cache' : 'Not downloaded to cache'));
        let mode = (api.store.get('alwaysDownloadVideos') || []).includes(video.id) ? 'always' : (api.store.get('neverDownloadVideos') || []).includes(video.id) ? 'never' : 'whenChecked';
        for (const [value, name] of [['whenChecked', 'Download when checked and cache is enabled'], ['always', 'Always download'], ['never', 'Never download']]) {
            const radio = element('input', {type: 'radio', name: 'video-download', value, checked: mode === value});
            radio.addEventListener('change', () => {
                api.store.set(downloadChanges(video.id, value, key => api.store.get(key)));
                send('refreshCache');
            });
            downloadCard.append(element('label', {className: 'download-choice'}, radio, name));
        }
        root.append(section('Download policy', downloadCard));
        videoPlayback.load(media, video, message => { if (token === generation) { status.textContent = message; } }).then(() => {
            if (token === generation) {
                return media.play();
            }
        }).catch(error => {
            if (token === generation && error.message !== 'Playback cancelled') {
                status.textContent = `Unable to play video: ${error.message}`;
            }
        });
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stop();
        } else if (!root.hidden && selected >= 0) {
            show(selected);
        }
    });
    window.addEventListener('pagehide', stop);
    return {show, stop, refresh() { if (!root.hidden) { show(selected); } }};
}
