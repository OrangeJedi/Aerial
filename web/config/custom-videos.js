import {api, element, button, section, ask, notify, send, changed} from './shared.js';

export function initCustomVideos(root) {
    const list = element('div', {className: 'card'});
    root.append(element('p', {}, 'Add videos from a folder on your computer. These files stay in their original location.'),
        element('div', {className: 'actions'}, button('Add folder', () => send('selectCustomLocation'), 'primary')),
        element('br'), section('Your videos', list));

    function render() {
        const videos = api.store.get('customVideos') || [];
        const allowed = new Set(api.store.get('allowedVideos') || []);
        list.replaceChildren();
        if (!videos.length) {
            list.append(element('div', {className: 'empty-state'}, 'No custom videos yet. Add a folder to get started.'));
        }
        for (const video of videos) {
            const check = element('input', {type: 'checkbox', checked: allowed.has(video.id), 'aria-label': `Include ${video.name}`});
            check.addEventListener('change', () => {
                const next = new Set(api.store.get('allowedVideos') || []);
                if (check.checked) {
                    next.add(video.id);
                } else {
                    next.delete(video.id);
                }
                api.store.set('allowedVideos', [...next]);
                changed(['allowedVideos']);
            });
            const name = element('input', {type: 'text', value: video.name, 'aria-label': 'Video name'});
            name.addEventListener('change', () => {
                const saved = api.store.get('customVideos') || [];
                const item = saved.find(item => item.id === video.id);
                if (item && name.value.trim()) {
                    item.name = name.value.trim();
                    api.store.set('customVideos', saved);
                } else {
                    name.value = video.name;
                }
            });
            const remove = button('Remove', async () => {
                if (await ask('Remove custom video?', `Remove “${video.name}” from Aerial? The file on your computer will be kept.`, {confirm: 'Remove', danger: true})) {
                    api.store.set({customVideos: (api.store.get('customVideos') || []).filter(item => item.id !== video.id), allowedVideos: (api.store.get('allowedVideos') || []).filter(id => id !== video.id)});
                    changed(['customVideos', 'allowedVideos']);
                    render();
                }
            }, 'danger');
            list.append(element('div', {className: 'custom-video-row'}, check,
                element('div', {className: 'custom-name'}, name, element('span', {className: 'custom-path help'}, video.path)), remove));
        }
    }

    api.ipcRenderer.on('newCustomVideos', (files, directory) => {
        const videos = api.store.get('customVideos') || [];
        const allowed = new Set(api.store.get('allowedVideos') || []);
        for (const filename of files) {
            const path = `${directory}\\${filename}`;
            let video = videos.find(video => video.path.toLowerCase() === path.toLowerCase());
            if (!video) {
                video = {id: `_${crypto.randomUUID()}`, path, name: filename, accessibilityLabel: 'Custom Video'};
                videos.push(video);
            }
            allowed.add(video.id);
        }
        api.store.set({customVideos: videos, allowedVideos: [...allowed]});
        changed(['customVideos', 'allowedVideos']);
        render();
        notify(`Added ${files.length} video${files.length === 1 ? '' : 's'}.`);
    });
    render();
    return {render};
}
