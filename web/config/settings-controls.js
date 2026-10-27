import {api, element, button, ask, notify, send, changed} from './shared.js';
import {matches, readEntry, entryChanges, optionsFor, updateMessage} from './settings-model.js';

export const definition = api.settingsDefinition;
const entries = definition.flatMap(group => group.entries);
const defaults = new Map(entries.filter(entry => entry.key).map(entry => [entry.key, entry.default]));
export const read = key => api.store.get(key) ?? defaults.get(key);
export const sources = {updateStatus: {status: 'checking'}};
const controls = [];
let languages;

function languageOptions() {
    if (languages) {
        return languages;
    }
    const names = new Intl.DisplayNames(api.systemLanguages, {type: 'language'});
    const locales = [...new Set([...window.moment.locales(), ...api.videoLocales.map(value => value.toLowerCase())])];
    languages = [{name: 'System default', value: 'system'}, ...locales.map(value => {
        let name = value;
        try {
            name = names.of(value);
        } catch {
            // Historical Moment locale names need not be valid BCP 47 tags.
        }
        return {name: `${name} (${value})`, value};
    }).sort((a, b) => a.name.localeCompare(b.name))];
    return languages;
}

export async function runAction(handler) {
    switch (handler) {
        case 'resetFilterSettings': {
            const filters = api.store.get('videoFilters') || [];
            api.store.set('videoFilters', filters.map(filter => ({...filter, value: filter.defaultValue})));
            changed(['videoFilters']);
            break;
        }
        case 'deleteCache':
            if (await ask('Delete cached videos?', 'This removes all downloaded videos from the cache. They can be downloaded again.', {confirm: 'Delete videos', danger: true})) {
                send('deleteCache');
            }
            break;
        case 'selectCacheLocation':
            if (await ask('Move cache location?', 'This deletes videos in the current cache before changing its location. Copy downloaded videos to your new folder first if you want to keep them.', {confirm: 'Choose folder'})) {
                send('selectCacheLocation');
            }
            break;
        case 'refreshAerial':
            if (await ask('Refresh Aerial?', 'Rebuild configuration defaults and reopen this window. Your saved settings will be retained.', {confirm: 'Refresh'})) {
                send('refreshConfig');
            }
            break;
        case 'resetAerial':
            if (await ask('Reset Aerial?', 'This clears all saved settings and profiles and restores the defaults. This cannot be undone.', {confirm: 'Reset Aerial', danger: true})) {
                send('resetConfig');
            }
            break;
        default:
            send(handler);
    }
}

function afterSave(keys) {
    if (keys.some(key => key === 'enableGlobalShortcut' || key.startsWith('globalShortcut'))) {
        send('newGlobalShortcut');
    }
    if (keys.some(key => ['latitude', 'longitude', 'useLocationForSunrise'].includes(key)) && read('useLocationForSunrise')) {
        send('updateLocation');
    }
    changed(keys);
}

function save(entry, value) {
    if (value === true && !matches(entry.requiresWhenTrue, read, sources)) {
        notify(entry.onRequirementFailure?.message || 'Set the required settings first.');
        refreshControls();
        return;
    }
    const changes = entryChanges(entry, value, read, entries);
    api.store.set(changes);
    afterSave(Object.keys(changes));
}

function cacheSize(bytes) {
    if (!Number.isFinite(Number(bytes))) {
        return '0 B';
    }
    let size = Number(bytes);
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit++;
    }
    return `${size.toFixed(unit ? 2 : 0)} ${units[unit]}`;
}

export function createControl(entry) {
    const id = `setting-${entry.id}`;
    const label = element('label', {htmlFor: id}, entry.name);
    const info = element('div', {className: 'setting-info'}, label);
    if (entry.description) {
        info.append(element('p', {className: 'help', id: `${id}-help`}, entry.description));
    }
    const holder = element('div', {className: 'setting-control'});
    const row = element('div', {className: 'setting-row'}, info, holder);
    let input;
    let output;
    let optionSignature;
    if (entry.type === 'action' || entry.type === 'directory') {
        input = button(entry.type === 'directory' ? 'Choose folder' : entry.name, () => runAction(entry.handler), /delete|resetAerial/.test(entry.handler) ? 'danger' : '');
        input.id = id;
        holder.append(input);
        if (entry.type === 'directory') {
            info.append(element('span', {className: 'help', id: `${id}-path`}));
        }
    } else if (entry.type === 'link') {
        input = element('a', {id, href: entry.url, target: '_blank', rel: 'noreferrer'}, 'Open GitHub');
        holder.append(input);
    } else if (entry.type === 'display' || entry.type === 'status') {
        input = element('span', {id, role: entry.type === 'status' ? 'status' : 'note'});
        holder.append(input);
    } else {
        input = element(entry.type === 'select' ? 'select' : 'input', {id});
        if (entry.type !== 'select') {
            input.type = entry.type === 'slider' ? 'range' : entry.type === 'key' ? 'text' : entry.type;
        }
        if (entry.type === 'number' && entry.step === undefined) {
            input.step = 'any';
        }
        for (const attribute of ['min', 'max', 'step']) {
            if (entry[attribute] !== undefined) {
                input[attribute] = entry[attribute];
            }
        }
        if (entry.description) {
            input.setAttribute('aria-describedby', `${id}-help`);
        }
        if (entry.type === 'key') {
            input.readOnly = true;
            input.title = 'Focus this field and press a key';
            input.addEventListener('keydown', event => {
                if (event.key === 'Tab') {
                    return;
                }
                event.preventDefault();
                if (event.repeat) {
                    return;
                }
                const value = entry.key === 'skipKey' ? event.code : event.key.length === 1 ? event.key.toUpperCase() : event.key;
                save(entry, value);
                input.value = value;
            });
        } else {
            input.addEventListener('change', () => {
                if (!input.checkValidity()) {
                    input.reportValidity();
                    return;
                }
                const value = entry.type === 'checkbox' ? input.checked : entry.valueType === 'number' ? Number(input.value) : input.value;
                save(entry, value);
            });
        }
        holder.append(input);
        if (entry.type === 'slider') {
            output = element('output', {htmlFor: id});
            input.addEventListener('input', () => { output.textContent = input.value; });
            holder.append(output);
        }
        if (entry.unit) {
            holder.append(element('span', {className: 'muted'}, entry.unit));
        }
        if (entry.resetValue !== undefined) {
            const reset = button('↺', () => save(entry, entry.resetValue), 'reset-control');
            reset.title = `Reset ${entry.name}`;
            reset.setAttribute('aria-label', reset.title);
            holder.append(reset);
        }
    }
    const refresh = () => {
        row.hidden = !matches(entry.visibleWhen, read, sources);
        const enabled = matches(entry.enabledWhen, read, sources);
        row.classList.toggle('disabled', !enabled);
        holder.querySelectorAll('input, select, button').forEach(control => { control.disabled = !enabled; });
        if (entry.type === 'status') {
            input.textContent = updateMessage(sources.updateStatus);
        } else if (entry.type === 'display') {
            input.textContent = entry.format ? cacheSize(read(entry.key)) : readEntry(entry, read) || '—';
        } else if (entry.type === 'directory') {
            info.querySelector('.help').textContent = read(entry.key) || '';
        } else if (!['action', 'link'].includes(entry.type)) {
            let value = readEntry(entry, read);
            if (entry.type === 'select') {
                const options = entry.optionsSource ? languageOptions() : optionsFor(entry, read, sources);
                const signature = JSON.stringify(options);
                if (signature !== optionSignature) {
                    input.replaceChildren(...options.map(option => element('option', {value: option.value}, option.name)));
                    optionSignature = signature;
                }
                if (entry.optionsSource && !options.some(option => option.value === value)) {
                    value = entry.optionsSource.fallback;
                }
                if (entry.emptyValueSelection && !options.some(option => option.value === value) && options.length && !row.hidden) {
                    value = options[0].value;
                    api.store.set(entry.key, value);
                }
            }
            if (entry.type === 'checkbox') {
                input.checked = Boolean(value);
            } else if (document.activeElement !== input || entry.type === 'select') {
                input.value = value ?? '';
            }
            if (output) {
                output.textContent = value;
            }
        }
    };
    controls.push(refresh);
    refresh();
    return row;
}

export function refreshControls() {
    controls.forEach(refresh => refresh());
}
