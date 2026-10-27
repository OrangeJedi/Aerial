export const api = window.electron;

export function element(tag, attributes = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
        if (key.startsWith('on')) {
            node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'className') {
            node.className = value;
        } else if (key in node && !key.startsWith('aria') && !['list', 'form'].includes(key)) {
            node[key] = value;
        } else {
            node.setAttribute(key, value);
        }
    }
    node.append(...children.flat().filter(child => child !== undefined && child !== null));
    return node;
}

export function button(name, onClick, className = '') {
    return element('button', {type: 'button', className, onClick}, name);
}

export function section(name, ...children) {
    return element('section', {className: 'section'}, element('h2', {}, name), ...children);
}

let noticeTimer;
export function notify(message) {
    document.getElementById('notice').textContent = message;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { document.getElementById('notice').textContent = ''; }, 6000);
}

export function ask(title, message, {input, confirm = 'Continue', danger = false, cancel = true} = {}) {
    const dialog = document.getElementById('app-dialog');
    if (dialog.open) {
        dialog.close();
    }
    document.getElementById('dialog-title').textContent = title;
    const body = document.getElementById('dialog-body');
    body.replaceChildren(typeof message === 'string' ? element('p', {}, message) : message);
    let field;
    if (input !== undefined) {
        field = element('input', {type: 'text', value: input, 'aria-label': title, maxLength: 120});
        body.append(field);
    }
    const actions = document.getElementById('dialog-actions');
    actions.replaceChildren();
    if (cancel) {
        actions.append(element('button', {type: 'submit', value: 'cancel'}, 'Cancel'));
    }
    actions.append(element('button', {type: 'submit', value: 'confirm', className: danger ? 'danger' : 'primary'}, confirm));
    dialog.returnValue = '';
    // Enter in a text field should confirm, rather than activate Cancel.
    const form = dialog.querySelector('form');
    form.onsubmit = event => {
        event.preventDefault();
        dialog.close(event.submitter?.value || 'confirm');
    };
    return new Promise(resolve => {
        dialog.addEventListener('close', () => {
            resolve(dialog.returnValue === 'confirm' ? (field ? field.value : true) : null);
        }, {once: true});
        dialog.showModal();
        if (field) {
            field.focus();
            field.select();
        }
    });
}

export function send(channel, data) {
    api.ipcRenderer.send(channel, data);
}

export function changed(keys) {
    document.dispatchEvent(new CustomEvent('settings-changed', {detail: keys}));
}

export function setSetting(key, value) {
    api.store.set(key, value);
    changed([key]);
}

export function locale() {
    const selected = api.store.get('dateTimeLanguage');
    const languages = selected && selected !== 'system' ? [selected] : api.systemLanguages;
    const available = new Set(window.moment.locales());
    for (let language of languages || []) {
        language = language.toLowerCase().replace(/_/g, '-').replace(/^no(?=-|$)/, 'nb');
        if (/^zh-(hant|hans)(-|$)/.test(language)) {
            language = /-(hk|mo)(-|$)/.test(language) ? 'zh-hk' : language.includes('hant') ? 'zh-tw' : 'zh-cn';
        }
        while (language) {
            if (available.has(language)) {
                return language;
            }
            language = language.includes('-') ? language.slice(0, language.lastIndexOf('-')) : '';
        }
    }
    return 'en';
}
