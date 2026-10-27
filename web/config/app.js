import {api, ask, send, notify} from './shared.js';
import {initSettings} from './settings.js';
import {refreshControls} from './settings-controls.js';
import {initVideoSidebar} from './video-sidebar.js';
import {initVideoDisplay} from './video-display.js';
import {initTextSettings} from './text-settings.js';
import {initCustomVideos} from './custom-videos.js';

document.documentElement.classList.toggle('has-backdrop', Boolean(api.configBackdrop));

const main = document.getElementById('main-content');
const title = document.getElementById('page-title');
let page = 'settings';
let selectedVideo = -1;
const scrollPositions = new Map();
const display = initVideoDisplay(document.getElementById('video-page'));
const sidebar = initVideoSidebar(document.getElementById('video-list'), index => navigate('video', index));
initSettings(document.getElementById('settings-page'));
const overlay = initTextSettings(document.getElementById('overlay-page'));
const custom = initCustomVideos(document.getElementById('custom-page'));

function navigate(next, index = -1) {
    scrollPositions.set(page, main.scrollTop);
    display.stop();
    page = next;
    document.getElementById('settings-search').hidden = next !== 'settings';
    selectedVideo = next === 'video' ? index : -1;
    for (const name of ['settings', 'overlay', 'custom', 'video']) {
        document.getElementById(`${name}-page`).hidden = name !== next;
    }
    document.querySelectorAll('[data-page]').forEach(control => {
        if (control.dataset.page === next) {
            control.setAttribute('aria-current', 'page');
        } else {
            control.removeAttribute('aria-current');
        }
    });
    document.getElementById('videos-header').setAttribute('aria-current', next === 'video' && index < 0 ? 'page' : 'false');
    sidebar.select(next === 'video' ? index : null);
    title.textContent = next === 'settings' ? 'Settings' : next === 'overlay' ? 'Overlay' : next === 'custom' ? 'Custom Videos' : index < 0 ? 'Video settings' : api.videoText(api.videos[index]).name || api.videoText(api.videos[index]).accessibilityLabel;
    if (next === 'video') {
        display.show(index);
    }
    main.scrollTop = next === 'video' ? 0 : scrollPositions.get(next) || 0;
    main.focus({preventScroll: true});
}

document.getElementById('videos-header').addEventListener('click', () => navigate('video'));
document.querySelectorAll('[data-page]').forEach(control => control.addEventListener('click', () => navigate(control.dataset.page)));
const previewMenu = document.getElementById('preview-menu');
const previewToggle = document.getElementById('preview-menu-toggle');
function closePreviewMenu(restoreFocus = false) {
    previewMenu.hidden = true;
    previewToggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) {
        previewToggle.focus();
    }
}
document.getElementById('preview').addEventListener('click', () => {
    closePreviewMenu();
    send('openFullscreenPreview');
});
previewToggle.addEventListener('click', () => {
    previewMenu.hidden = !previewMenu.hidden;
    previewToggle.setAttribute('aria-expanded', String(!previewMenu.hidden));
});
previewToggle.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        previewMenu.hidden = false;
        previewToggle.setAttribute('aria-expanded', 'true');
        document.getElementById('preview-window').focus();
    }
});
document.getElementById('preview-window').addEventListener('click', () => {
    closePreviewMenu(true);
    send('openPreview');
});
document.addEventListener('click', event => {
    if (!event.target.closest('.preview-split')) {
        closePreviewMenu();
    }
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !previewMenu.hidden) {
        event.preventDefault();
        closePreviewMenu(true);
    }
});
document.addEventListener('focusin', event => {
    if (!event.target.closest('.preview-split')) {
        closePreviewMenu();
    }
});

document.addEventListener('settings-changed', event => {
    const keys = event.detail;
    refreshControls();
    if (keys.some(key => ['allowedVideos', 'allowH265', 'allow4K', 'prefer4K240', 'dateTimeLanguage'].includes(key))) {
        sidebar.render();
    }
    if (keys.some(key => ['allowH265', 'allow4K', 'prefer4K240', 'dateTimeLanguage'].includes(key)) && page === 'video') {
        navigate('video', selectedVideo);
    }
});

api.ipcRenderer.on('displaySettings', () => {
    refreshControls();
    sidebar.render();
    custom.render();
    overlay.refresh();
    if (page === 'video') {
        display.refresh();
    }
});
api.ipcRenderer.on('updateAttribute', ([id, value]) => {
    if (id === 'imageFileName') {
        overlay.refresh();
    } else {
        const node = document.getElementById(`setting-${id}`);
        if (node) {
            refreshControls();
        }
    }
});
api.ipcRenderer.on('showWelcome', () => ask('Welcome to Aerial', 'Aerial is ready. Choose videos in the sidebar, add an overlay, and fine-tune your screen saver in Settings. Changes save automatically.', {confirm: 'Get started', cancel: false}));

export function applyAccent(color) {
    const hex = String(color || '').replace(/^#/, '').slice(0, 6);
    if (!/^[0-9a-f]{6}$/i.test(hex)) {
        return;
    }
    const rgb = hex.match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    document.documentElement.style.setProperty('--accent', `#${hex}`);
    document.documentElement.style.setProperty('--on-accent', luminance > .179 ? '#101114' : '#ffffff');
}

api.ipcRenderer.on('configAccentChanged', applyAccent);
api.ipcRenderer.invoke('getConfigAccent').then(applyAccent).catch(() => notify('Windows accent color is unavailable; using the default accent.'));
navigate('settings');
