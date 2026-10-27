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
