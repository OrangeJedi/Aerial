import '../text-style.js';
import {api, element, button, ask, notify, send, setSetting, locale} from './shared.js';
import {cssFontFamily} from './fonts.js';

const positions = [
    ['topleft', 'Top left'], ['topmiddle', 'Top center'], ['topright', 'Top right'],
    ['left', 'Left'], ['middle', 'Center'], ['right', 'Right'],
    ['bottomleft', 'Bottom left'], ['bottommiddle', 'Bottom center'], ['bottomright', 'Bottom right']
];
const types = [['none', 'None'], ['text', 'Text'], ['html', 'HTML'], ['image', 'Image'], ['time', 'Time / date'], ['information', 'Information'], ['astronomy', 'Astronomy']];

export function initTextSettings(root) {
    let selected = 'topleft';
    let fonts = [];
    const lines = element('div', {className: 'overlay-lines'});
    const list = element('div', {className: 'overlay-list'});
    const fontList = element('datalist', {id: 'installed-fonts'});
    const editor = element('div', {className: 'overlay-editor', id: 'overlay-editor', role: 'region', 'aria-label': 'Overlay editor'});
    const rows = new Map();
    let editing = false;
    let overlayId;
    let content = [];
    let renderPicker = () => {};
    const labels = () => api.store.get('overlayNames') || {};
    const data = () => api.store.get('displayText');
    const empty = () => Array.from({length: 4}, () => ({type: 'none', defaultFont: true}));
    const locations = [...positions, ['random', 'Random']];
    function icon(name) {
        const paths = {check: '<path d="m20 6-11 11-5-5"/>', bold: '<path d="M6 12h8a4 4 0 0 1 0 8H6zM6 4h7a4 4 0 0 1 0 8H6z"/>', italic: '<path d="M19 4h-9M14 20H5M15 4 9 20"/>', underline: '<path d="M6 3v7a6 6 0 0 0 12 0V3M4 21h16"/>', x: '<path d="m18 6-12 12M6 6l12 12"/>', plus: '<path d="M12 5v14M5 12h14"/>', pencil: '<path d="m16 3 5 5M4 16 16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1z"/>', ellipsis: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>', trash: '<path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/>'};
        const node = element('span', {className: 'overlay-icon', 'aria-hidden': 'true'});
        node.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths[name] + '</svg>';
        return node;
    }
    function action(name, glyph, handler) {
        const control = button('', handler);
        control.title = name;
        control.setAttribute('aria-label', name);
        control.append(icon(glyph));
        return control;
    }
    function overlays() {
        const text = data();
        return locations.flatMap(([position, title]) => {
            const ids = [...new Set(text[position].filter(line => line.type !== 'none').map(line => line.overlayId || position))];
            return ids.map(id => ({id, position, title, lines: text[position].filter(line => (line.overlayId || position) === id)}));
        });
    }

    function monitorTargets(entries) {
        const used = entries.filter(line => line.type !== 'none');
        if (used.length && entries.some(line => line.overlayId)) {
            return used[0].onlyShowOnScreen === undefined ? undefined : [].concat(used[0].onlyShowOnScreen).map(String);
        }
        const targets = (used.length ? used : entries).map(line => line.onlyShowOnScreen);
        return targets.includes(undefined) ? undefined : [...new Set(targets.flat().map(String))];
    }

    function overlaps(first, second) {
        return first === undefined || second === undefined || first.some(value => second.includes(value));
    }

    function blocked(position, targets = monitorTargets(content)) {
        return overlays().some(overlay => overlay.id !== overlayId && overlay.position === position && overlaps(targets, monitorTargets(overlay.lines)));
    }

    function saveContent(next = selected) {
        const text = data();
        for (const [position] of locations) {
            // Keep other overlays and the legacy position arrays intact.
            if (position !== next && !text[position].some(line => (line.overlayId || position) === overlayId)) {
                continue;
            }
            let remaining = text[position].filter(line => (line.overlayId || position) !== overlayId);
            if (!remaining.some(line => line.type !== 'none')) {
                remaining = [];
            }
            if (position === next) {
                remaining.push(...content.map(line => ({...line, overlayId})));
            }
            while (remaining.length < 4) {
                remaining.push({type: 'none', defaultFont: true});
            }
            text[position] = remaining;
        }
        selected = next;
        api.store.set('displayText', text);
        renderList();
    }

    function closeEditor() {
        editing = false;
        editor.remove();
        renderList();
    }

    function renderList() {
        const entries = overlays();
        if (editing && !entries.some(overlay => overlay.id === overlayId)) {
            entries.push({id: overlayId, position: selected, title: 'New overlay', lines: content});
        }
        const ids = new Set(entries.map(overlay => overlay.id));
        for (const [id, row] of rows) {
            if (!ids.has(id)) {
                row.container.remove();
                rows.delete(id);
            }
        }
        list.querySelector('.overlay-empty')?.remove();
        for (const overlay of entries) {
            const {id, position, title, lines: entries} = overlay;
            const name = labels()[id] || title;
            const summary = element('summary', {'aria-label': 'Overlay options', title: 'Overlay options'}, icon('ellipsis'));
            const remove = button('', () => {
                const text = data();
                if (text[position]) {
                    text[position] = text[position].filter(line => (line.overlayId || position) !== id);
                    while (text[position].length < 4) {
                        text[position].push({type: 'none', defaultFont: true});
                    }
                    api.store.set('displayText', text);
                }
                const names = labels();
                delete names[id];
                api.store.set('overlayNames', names);
                if (editing && overlayId === id) {
                    editing = false;
                    editor.remove();
                }
                renderList();
            });
            remove.append(icon('trash'), 'Remove');
            const enabled = element('input', {type: 'checkbox', checked: entries.find(line => line.type !== 'none')?.enabled !== false, 'aria-label': 'Show ' + name + ' on screensaver'});
            enabled.addEventListener('change', () => {
                const text = data();
                for (const line of text[position].filter(line => (line.overlayId || position) === id)) {
                    line.enabled = enabled.checked;
                }
                if (editing && overlayId === id) {
                    content.forEach(line => { line.enabled = enabled.checked; });
                }
                api.store.set('displayText', text);
                renderList();
            });
            const row = element('div', {className: 'card overlay-row'}, element('label', {className: 'overlay-enabled'}, enabled, element('span', {className: 'overlay-description'}, element('strong', {}, name), element('span', {className: 'help'}, types.find(([type]) => type === entries[0].type)?.[1] || 'None'))), element('span', {}, title));
            if ((api.store.get('numDisplays') || 1) > 1) {
                const targets = monitorTargets(entries);
                row.append(element('span', {className: 'help'}, targets === undefined ? 'All monitors' : targets.map(id => 'Monitor ' + (Number(id) + 1)).join(', ')));
            }
            const expanded = editing && overlayId === id;
            const edit = action((expanded ? 'Done editing ' : 'Edit ') + name, expanded ? 'check' : 'pencil', () => {
                if (editing && overlayId === id) {
                    closeEditor();
                } else {
                    openEditor(overlay);
                }
            });
            edit.setAttribute('aria-expanded', String(expanded));
            edit.setAttribute('aria-controls', 'overlay-editor');
            row.append(element('div', {className: 'actions'}, edit, element('details', {className: 'overlay-menu'}, summary, element('div', {className: 'overlay-menu-items'}, remove))));
            let entry = rows.get(id);
            if (!entry) {
                const heading = element('div');
                const container = element('div', {className: 'overlay-item'}, heading);
                entry = {heading, container};
                rows.set(id, entry);
                list.append(container);
            }
            entry.heading.replaceChildren(row);
            if (expanded && editor.parentElement !== entry.container) {
                entry.container.append(editor);
            }
        }
        if (!entries.length) {
            list.append(element('p', {className: 'help overlay-empty'}, 'No overlays yet. Use + to add one.'));
        }
    }

    function openEditor(overlay) {
        overlayId = overlay?.id || 'overlay-' + crypto.randomUUID();
        content = overlay ? structuredClone(overlay.lines) : empty();
        selected = overlay?.position || locations.find(([position]) => !blocked(position))?.[0];
        editing = true;
        const name = input('text', labels()[overlayId] || '', value => {
            const names = labels();
            names[overlayId] = value;
            api.store.set('overlayNames', names);
            renderList();
        }, {maxLength: 120});
        const randomOptions = element('div');
        const positionSection = element('div');
        function renderRandom() {
            randomOptions.replaceChildren();
            if (selected === 'random') {
                randomOptions.append(field('Change random position every (seconds)', input('number', api.store.get('randomSpeed'), value => setSetting('randomSpeed', value), {min: 1, step: 1})));
            }
        }
        renderPicker = () => {
            const grid = element('div', {className: 'position-preview', role: 'group', 'aria-label': 'Overlay position'},
                element('img', {src: '../images/B8F204CE-6024-49AB-85F9-7CA2F6DCD226.jpeg', alt: 'Aerial landscape showing overlay positions', draggable: false}));
            const random = element('div', {className: 'random-position'});
            for (const [position, title] of locations) {
                if (blocked(position)) {
                    continue;
                }
                const control = element('input', {type: 'radio', name: 'overlay-position', value: position, checked: selected === position, 'aria-label': title});
                control.addEventListener('change', () => {
                    if (blocked(position)) {
                        renderPicker();
                        return;
                    }
                    saveContent(position);
                    renderPicker();
                    renderRandom();
                    renderLines();
                });
                if (position === 'random') {
                    random.append(element('label', {className: 'overlay-field inline'}, control, 'Random position'));
                } else {
                    grid.append(element('label', {className: 'position-radio position-' + position, title}, control));
                }
            }
            positionSection.replaceChildren(element('p', {}, 'Position'), grid, random);
        };
        const monitors = element('div');
        if ((api.store.get('numDisplays') || 1) > 1) {
            const renderMonitors = () => {
                monitors.replaceChildren(monitorField(monitorTargets(content), value => {
                    const targets = value === '' ? undefined : [].concat(value).map(String);
                    const next = selected && !blocked(selected, targets) ? selected : locations.find(([position]) => !blocked(position, targets))?.[0];
                    if (!next) {
                        notify('No positions are available on these monitors. Choose different monitors or remove an overlay.');
                        renderMonitors();
                        return;
                    }
                    for (const line of content) {
                        if (value === '') {
                            delete line.onlyShowOnScreen;
                        } else {
                            line.onlyShowOnScreen = value;
                        }
                    }
                    saveContent(next);
                    renderMonitors();
                    renderPicker();
                    renderRandom();
                    renderLines();
                }));
            };
            renderMonitors();
        }
        editor.replaceChildren(element('div', {className: 'overlay-fields'}, field('Name', name), monitors, positionSection, randomOptions, lines));
        renderPicker();
        renderRandom();
        renderLines();
        renderList();
    }
    root.append(element('p', {}, 'Place text, clocks, images, and video information over your screen saver.'), element('div', {className: 'overlay-list-heading'}, element('h2', {}, 'Overlays'), action('Add overlay', 'plus', () => openEditor())), list, fontList);
    function monitorField(value, onChange) {
        const options = [['', 'All monitors'], ...Array.from({length: api.store.get('numDisplays') || 1}, (_, i) => [String(i), 'Monitor ' + (i + 1)])];
        const controls = element('div', {className: 'overlay-monitors'});
        const values = value === undefined ? [''] : [].concat(value).map(String);
        const checks = options.map(([id, title]) => {
            const check = element('input', {type: 'checkbox', checked: values.includes(id)});
            check.addEventListener('change', () => {
                if (id === '') {
                    onChange(check.checked ? '' : '0');
                } else {
                    const next = checks.filter(([key, control]) => key !== '' && control.checked).map(([key]) => key);
                    if (!next.length) {
                        check.checked = true;
                        return;
                    }
                    onChange(next.length === 1 ? next[0] : next);
                }
            });
            controls.append(field(title, check, true));
            return [id, check];
        });
        return element('div', {}, element('p', {}, 'Display on'), controls);
    }
    function update(line, key, value) {
        if (!selected || blocked(selected)) {
            notify('Choose monitors and an available position first.');
            renderLines();
            return;
        }
        const entry = content[line];
        entry[key] = value;
        if (key === 'type') {
            if (value === 'time') {
                entry.timeString ||= 'hh:mm:ss';
            } else if (value === 'information') {
                entry.infoType ||= 'accessibilityLabel';
            } else if (value === 'astronomy') {
                entry.astronomy ||= 'sunrise/set';
                entry.astroTimeString ||= 'hh:mm';
            }
        }
        if (key === 'defaultFont' && value === false) {
            entry.font ||= api.store.get('textFont');
            entry.fontSize ||= api.store.get('textSize');
            entry.fontColor ||= api.store.get('textColor');
            entry.fontStyle ||= window.aerialTextStyle.normalize(api.store.get('textStyle'));
        }
        if (key === 'onlyShowOnScreen' && value === '') {
            delete entry.onlyShowOnScreen;
        }
        saveContent();
    }

    function select(options, value, onChange, label) {
        const control = element('select', {'aria-label': label}, ...options.map(([value, name]) => element('option', {value}, name)));
        control.value = value;
        control.addEventListener('change', () => onChange(control.value));
        return control;
    }

    function field(name, control, inline = false) {
        return element('label', {className: `overlay-field${inline ? ' inline' : ''}`}, inline ? control : name, inline ? name : control);
    }

    function input(type, value, onChange, attributes = {}) {
        const control = element('input', {type, value: value ?? '', ...attributes});
        control.addEventListener('change', () => {
            if (control.checkValidity()) {
                onChange(control.value);
            } else {
                control.reportValidity();
            }
        });
        return control;
    }

    function fontField(value, onChange, label = 'Font') {
        const sample = element('p', {className: 'font-preview'}, 'AaBbCc 123');
        sample.style.fontFamily = cssFontFamily(value);
        const control = input('text', value, value => {
            if (!fonts.length || fonts.includes(value)) {
                onChange(value);
                control.setCustomValidity('');
            } else {
                control.setCustomValidity('Choose an installed font.');
                control.reportValidity();
            }
        }, {className: 'font-input', list: 'installed-fonts'});
        control.addEventListener('input', () => {
            control.setCustomValidity('');
            sample.style.fontFamily = cssFontFamily(control.value);
        });
        return element('div', {}, field(label, control), sample);
    }

    function fontSettings(font, size, color, onChange, savedStyle) {
        const style = window.aerialTextStyle.normalize(savedStyle);
        function saveStyle() {
            onChange('fontStyle', {...style});
        }
        function slider(name, key, maximum, step = 1, minimum = 0) {
            const value = element('output', {}, style[key] + '%');
            const control = input('range', style[key], next => {
                style[key] = Number(next);
                value.textContent = next + '%';
                saveStyle();
            }, {min: minimum, max: maximum, step, 'aria-label': name});
            control.addEventListener('input', () => { value.textContent = control.value + '%'; });
            return field(name, element('div', {className: 'font-slider'}, control, value));
        }
        const emphasis = element('div', {className: 'font-emphasis', role: 'group', 'aria-label': 'Text style'});
        for (const [key, title] of [['bold', 'Bold'], ['italic', 'Italic'], ['underline', 'Underline']]) {
            const control = action(title, key, () => {
                style[key] = !style[key];
                control.setAttribute('aria-pressed', String(style[key]));
                saveStyle();
            });
            control.setAttribute('aria-pressed', String(style[key]));
            emphasis.append(control);
        }
        const shadow = element('input', {type: 'checkbox', checked: style.shadowEnabled, 'aria-label': 'Enable drop shadow'});
        const shadowFields = element('div', {className: 'shadow-settings', hidden: !style.shadowEnabled},
            field('Shadow color', input('color', style.shadowColor, value => {
                style.shadowColor = value;
                saveStyle();
            }, {className: 'font-color', 'aria-label': 'Shadow color'})),
            slider('Spread (% of font size)', 'shadowSpread', 10, .25),
            slider('Blur (% of font size)', 'shadowBlur', 50, .25));
        shadow.addEventListener('change', () => {
            style.shadowEnabled = shadow.checked;
            shadowFields.hidden = !shadow.checked;
            saveStyle();
        });
        return element('div', {className: 'overlay-fields font-settings'},
            element('div', {className: 'font-settings-row'},
                fontField(font, value => onChange('font', value)),
                field(api.store.get('textSizeUnit') === 'vh' ? 'Font size (viewport height)' : 'Font size (viewport width)', input('number', size, value => onChange('fontSize', value), {min: .25, step: .25}))),
            element('div', {className: 'font-appearance-row'},
                field('Text color', input('color', color, value => onChange('fontColor', value), {className: 'font-color', 'aria-label': 'Text color'})),
                slider('Opacity', 'opacity', 100), emphasis),
            slider('Line spacing', 'lineSpacing', 200, 5, 50),
            element('div', {className: 'font-shadow'}, field('Drop shadow', shadow, true), shadowFields));
    }

    function showFormatting() {
        const rows = [['Month', 'M, MM, MMM, MMMM'], ['Day of month', 'D, DD, Do'], ['Day of week', 'ddd, dddd'], ['Year', 'YY, YYYY'], ['Hour (12 / 24)', 'h, hh / H, HH'], ['Minutes / seconds', 'mm / ss'], ['AM / PM', 'a, A']];
        ask('Date and time formatting', element('div', {},
            element('p', {}, 'Combine these tokens to format dates and times. For example: h:mm A or dddd, MMMM D.'),
            element('table', {className: 'format-reference'}, element('tbody', {}, ...rows.map(([name, tokens]) => element('tr', {}, element('td', {}, name), element('td', {}, tokens)))))), {confirm: 'Done', cancel: false});
    }

    function formatField(value, onChange) {
        const preview = element('span', {className: 'help'}, window.moment().locale(locale()).format(value));
        const control = input('text', value, onChange);
        control.addEventListener('input', () => { preview.textContent = window.moment().locale(locale()).format(control.value); });
        return element('div', {className: 'overlay-fields'},
            element('div', {className: 'time-format-row'}, field('Date / time format', control), button('Formatting reference', showFormatting)), preview);
    }

    function renderLines() {
        lines.replaceChildren();
        const lastUsed = content.reduce((last, line, index) => line.type !== 'none' ? index : last, -1);
        content.slice(0, Math.min(4, lastUsed + 2)).forEach((line, index) => {
            const fields = element('div', {className: 'overlay-fields'});
            const type = select(types, line.type, value => {
                if (value === 'astronomy' && (api.store.get('latitude') === '' || api.store.get('longitude') === '')) {
                    notify('Set latitude and longitude in Settings before adding astronomy.');
                    type.value = line.type;
                    return;
                }
                update(index, 'type', value);
                renderLines();
            }, `Line ${index + 1} type`);
            const card = element('div', {className: 'card overlay-line'},
                element('div', {className: 'line-heading'}, element('h3', {}, `Line ${index + 1}`), type), fields);
            lines.append(card);
            if (line.type === 'none') {
                fields.append(element('span', {className: 'help'}, 'Choose a type to add content to this line.'));
                return;
            }
            if (line.type === 'text') {
                fields.append(field('Text', input('text', line.text, value => update(index, 'text', value))));
            } else if (line.type === 'html') {
                const control = element('textarea', {value: line.html || '', spellcheck: false});
                control.addEventListener('change', () => update(index, 'html', control.value));
                fields.append(field('HTML', control));
            } else if (line.type === 'image') {
                fields.append(element('div', {className: 'actions'}, button('Choose image', () => {
                    saveContent();
                    const offset = data()[selected].findIndex(entry => entry.overlayId === overlayId);
                    send('selectFile', ['image', selected, String(offset + index)]);
                }),
                    element('span', {className: 'help'}, line.imagePath || 'No image selected')),
                field('Image width (for example, 200px or 20%)', input('text', line.imageWidth, value => update(index, 'imageWidth', value))));
            } else if (line.type === 'time') {
                fields.append(formatField(line.timeString || 'hh:mm:ss', value => update(index, 'timeString', value)));
            } else if (line.type === 'information') {
                const options = [['accessibilityLabel', 'Label'], ['name', 'Video name']];
                if (selected !== 'random') {
                    options.push(['poi', 'Location information']);
                }
                fields.append(field('Information', select(options, line.infoType || 'accessibilityLabel', value => update(index, 'infoType', value), 'Information type')));
            } else if (line.type === 'astronomy') {
                fields.append(field('Astronomy', select([['sunrise/set', 'Sunrise / sunset'], ['moonrise/set', 'Moonrise / moonset'], ['sunrise', 'Sunrise'], ['sunset', 'Sunset'], ['moonrise', 'Moonrise'], ['moonset', 'Moonset']], line.astronomy || 'sunrise/set', value => update(index, 'astronomy', value), 'Astronomy type')),
                    formatField(line.astroTimeString || 'hh:mm', value => update(index, 'astroTimeString', value)));
            }
            fields.append(field('Maximum width', select(['33%', '50%', '66%', '100%'].map(value => [value, value]), line.maxWidth || '50%', value => update(index, 'maxWidth', value), 'Maximum width')));
            const defaultFont = element('input', {type: 'checkbox', checked: line.defaultFont !== false});
            defaultFont.addEventListener('change', () => {
                update(index, 'defaultFont', defaultFont.checked);
                renderLines();
            });
            fields.append(field('Use default font', defaultFont, true));
            if (line.defaultFont === false) {
                fields.append(fontSettings(line.font || api.store.get('textFont'),
                    line.fontSize || api.store.get('textSize'),
                    line.fontColor || api.store.get('textColor'),
                    (key, value) => update(index, key, value), line.fontStyle || api.store.get('textStyle')));
            }
            fields.append(field('Custom CSS', input('text', line.customCSS, value => update(index, 'customCSS', value))));
        });
    }

    const options = element('div', {className: 'card padded overlay-fields'});
    function renderDefaults() {
        const keys = {font: 'textFont', fontSize: 'textSize', fontColor: 'textColor', fontStyle: 'textStyle'};
        options.replaceChildren(fontSettings(api.store.get('textFont'), api.store.get('textSize'), api.store.get('textColor'),
            (key, value) => setSetting(keys[key], value), api.store.get('textStyle')));
    }
    root.append(element('details', {className: 'section default-font'}, element('summary', {}, 'Default font'), options));
    api.fontListUniversal.getFonts().then(values => {
        fonts = values;
        fontList.replaceChildren(...fonts.map(value => element('option', {value})));
    }).catch(() => notify('Installed fonts could not be loaded. You can still enter a font name.'));
    renderList();
    renderDefaults();
    return {refresh() { if (editing) { const saved = overlays().find(overlay => overlay.id === overlayId); if (saved) { content = structuredClone(saved.lines); } renderLines(); renderPicker(); } renderDefaults(); renderList(); }};
}
