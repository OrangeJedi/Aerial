import {api, element, setSetting, send} from './shared.js';
import {visibleVideos} from './video-model.js';

export function initVideoSidebar(root, onSelect) {
    let selected = null;
    let cacheTimer;
    const search = document.getElementById('video-search');
    function render() {
        const scroll = root.scrollTop;
        const focused = document.activeElement?.id;
        const allowed = new Set(api.store.get('allowedVideos') || []);
        const visible = visibleVideos(api.videos, api.videoSources, api.videoText, search.value);
        const nodes = [];
        let lastGroup;
        for (const {video, index, text} of visible) {
            if (lastGroup !== video.accessibilityLabel) {
                nodes.push(element('h2', {className: 'video-group', dir: 'auto'}, text.accessibilityLabel));
                lastGroup = video.accessibilityLabel;
            }
            const check = element('input', {type: 'checkbox', checked: allowed.has(video.id), id: `video-check-${index}`, 'aria-label': `Include ${text.name || text.accessibilityLabel}`});
            check.addEventListener('change', () => {
                const next = new Set(api.store.get('allowedVideos') || []);
                if (check.checked) {
                    next.add(video.id);
                } else {
                    next.delete(video.id);
                }
                setSetting('allowedVideos', [...next]);
                clearTimeout(cacheTimer);
                cacheTimer = setTimeout(() => send('refreshCache'), 150);
            });
            const link = element('button', {type: 'button', id: `video-list-${index}`, onClick: () => onSelect(index)}, element('bdi', {}, text.name || text.accessibilityLabel));
            nodes.push(element('div', {className: 'video-row', 'aria-current': String(selected === index)}, check, link));
        }
        if (!nodes.length) {
            nodes.push(element('p', {className: 'empty-state', role: 'status'}, search.value.trim() ? 'No videos match your search.' : 'No videos match your video resolution settings.'));
        }
        root.replaceChildren(...nodes);
        root.scrollTop = scroll;
        if (focused?.startsWith('video-')) {
            document.getElementById(focused)?.focus({preventScroll: true});
        }
    }
    function select(index) {
        selected = index;
        root.querySelectorAll('.video-row').forEach(row => {
            row.setAttribute('aria-current', String(row.querySelector('button').id === `video-list-${index}`));
        });
    }
    search.addEventListener('input', () => {
        render();
        root.scrollTop = 0;
    });
    render();
    return {render, select};
}
