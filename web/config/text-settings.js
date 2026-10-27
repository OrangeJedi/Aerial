import {api, element, button, section, ask, notify, send, setSetting, locale} from './shared.js';
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
    const grid = element('div', {className: 'position-preview', role: 'group', 'aria-label': 'Overlay position'},
        element('img', {src: '../images/B8F204CE-6024-49AB-85F9-7CA2F6DCD226.jpeg', alt: 'Aerial landscape showing overlay positions', draggable: false}));
    const lines = element('div', {className: 'overlay-lines'});
    const random = element('input', {type: 'radio', name: 'overlay-position', value: 'random'});
    random.addEventListener('change', () => choose('random'));
    const fontList = element('datalist', {id: 'installed-fonts'});
    const positionButtons = new Map();
    root.append(element('p', {}, 'Place text, clocks, images, and video information over your screen saver.'),
        element('div', {className: 'overlay-editor-layout'},
            section('Position', element('div', {className: 'card padded'}, grid,
                element('div', {className: 'overlay-position-tools'}, element('label', {}, random, 'Random position'),
                    element('span', {className: 'help'}, 'Each position supports four lines.')))),
            section('Overlay content', lines)), fontList);

    function data() {
        return api.store.get('displayText');
    }

    function update(line, key, value) {
        const text = data();
        text[selected][line][key] = value;
        const entry = text[selected][line];
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
        }
        if (key === 'onlyShowOnScreen' && value === '') {
            delete entry.onlyShowOnScreen;
        }
        api.store.set('displayText', text);
        highlight();
    }

    function highlight() {
        const text = data();
        for (const [position, control] of positionButtons) {
            control.checked = selected === position;
            control.parentElement.classList.toggle('has-content', text[position].some(line => line.type !== 'none'));
        }
        random.checked = selected === 'random';
    }

    function choose(position) {
        selected = position;
        renderLines();
        highlight();
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
        return element('div', {className: 'overlay-fields'}, field('Date / time format', control), preview, button('Formatting reference', showFormatting));
    }

    function renderLines() {
        const text = data();
        lines.replaceChildren();
        text[selected].forEach((line, index) => {
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
                fields.append(element('div', {className: 'actions'}, button('Choose image', () => send('selectFile', ['image', selected, String(index)])),
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
            const screens = [['', 'All screens'], ...Array.from({length: api.store.get('numDisplays') || 0}, (_, index) => [String(index), `Screen ${index + 1}`])];
            fields.append(field('Display on', select(screens, String(line.onlyShowOnScreen ?? ''), value => update(index, 'onlyShowOnScreen', value), 'Display on screen')));
            const defaultFont = element('input', {type: 'checkbox', checked: line.defaultFont !== false});
            defaultFont.addEventListener('change', () => {
                update(index, 'defaultFont', defaultFont.checked);
                renderLines();
            });
            fields.append(field('Use default font', defaultFont, true));
            if (line.defaultFont === false) {
                fields.append(fontField(line.font || api.store.get('textFont'), value => update(index, 'font', value)),
                    field('Font size (viewport width)', input('number', line.fontSize || api.store.get('textSize'), value => update(index, 'fontSize', value), {min: .25, step: .25})),
                    field('Text color', input('color', line.fontColor || api.store.get('textColor'), value => update(index, 'fontColor', value))));
            }
            fields.append(field('Custom CSS', input('text', line.customCSS, value => update(index, 'customCSS', value))));
        });
    }

    for (const [position, name] of positions) {
        const control = element('input', {type: 'radio', name: 'overlay-position', value: position, 'aria-label': name});
        control.addEventListener('change', () => choose(position));
        positionButtons.set(position, control);
        grid.append(element('label', {className: `position-radio position-${position}`, title: name}, control));
    }

    const options = element('div', {className: 'card padded overlay-fields'});
    function renderDefaults() {
        options.replaceChildren(
            fontField(api.store.get('textFont'), value => setSetting('textFont', value)),
            field('Font size (viewport width)', input('number', api.store.get('textSize'), value => setSetting('textSize', value), {min: .25, step: .25})),
            field('Text color', input('color', api.store.get('textColor'), value => setSetting('textColor', value))),
            field('Change random position every (seconds)', input('number', api.store.get('randomSpeed'), value => setSetting('randomSpeed', value), {min: 1, step: 1}))
        );
    }
    root.append(section('Text options', options));
    api.fontListUniversal.getFonts().then(values => {
        fonts = values;
        fontList.replaceChildren(...fonts.map(value => element('option', {value})));
    }).catch(() => notify('Installed fonts could not be loaded. You can still enter a font name.'));
    renderLines();
    renderDefaults();
    highlight();
    return {refresh() { renderLines(); renderDefaults(); highlight(); }};
}
