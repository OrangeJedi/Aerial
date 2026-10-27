import {api, element, section} from './shared.js';
import {definition, createControl, refreshControls, sources} from './settings-controls.js';

export function initSettings(root) {
    for (const group of definition.filter(group => group.id !== 'customVideo')) {
        const card = element('div', {className: 'card'});
        for (const entry of group.entries) {
            card.append(createControl(entry));
        }
        if (group.id === 'about') {
            card.append(element('div', {className: 'padded card'},
                element('h3', {}, 'Aerial'),
                element('p', {}, 'Apple TV screen saver for Windows. Developed by OrangeJedi and irampton, inspired by the Mac Aerial Screen Saver and Aerial for Windows.'),
                element('p', {className: 'help'}, 'Copyright © 2026 AerialWindows. Released under the MIT license.'),
                element('div', {className: 'about-links'},
                    element('a', {href: 'https://github.com/AerialWindows/Aerial', target: '_blank', rel: 'noreferrer'}, 'GitHub'),
                    element('a', {href: 'https://github.com/AerialWindows/Aerial/wiki', target: '_blank', rel: 'noreferrer'}, 'Help & wiki'),
                    element('a', {href: 'https://github.com/AerialWindows/Aerial/blob/master/LICENSE', target: '_blank', rel: 'noreferrer'}, 'MIT license'))));
        }
        const block = section(group.name, card);
        block.id = `section-${group.id}`;
        root.append(block);
    }
    api.ipcRenderer.on('updateStatus', state => {
        sources.updateStatus = state;
        refreshControls();
    });
    api.ipcRenderer.invoke('getUpdateStatus').then(state => {
        sources.updateStatus = state;
        refreshControls();
    }).catch(() => {
        sources.updateStatus = {status: 'error'};
        refreshControls();
    });
}
