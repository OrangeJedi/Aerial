const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

class Node {
    constructor(tag, props = {}, ...children) {
        this.tag = tag;
        this.children = [];
        this.events = {};
        this.style = {};
        Object.assign(this, props);
        this.append(...children);
    }
    append(...children) {
        for (const child of children.flat().filter(value => value != null)) {
            if (child instanceof Node) {
                child.remove();
                child.parentElement = this;
            }
            this.children.push(child);
        }
    }
    remove() {
        if (this.parentElement) {
            this.parentElement.children = this.parentElement.children.filter(child => child !== this);
            this.parentElement = null;
        }
    }
    querySelector(selector) { return this.find(node => (node.className || '').split(' ').includes(selector.slice(1))); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    addEventListener(name, callback) { this.events[name] = callback; }
    setAttribute(name, value) { this[name] = value; }
    setCustomValidity() {}
    checkValidity() { return true; }
    showModal() { this.open = true; }
    close() { this.open = false; this.events.close?.(); }
    change(value) { this.value = value; this.events.change(); }
    find(predicate) {
        if (predicate(this)) { return this; }
        for (const child of this.children) {
            const result = child instanceof Node && child.find(predicate);
            if (result) { return result; }
        }
    }
}
function setup() {
    const positions = ['topleft', 'topmiddle', 'topright', 'left', 'middle', 'right', 'bottomleft', 'bottommiddle', 'bottomright', 'random'];
    const displayText = {positionList: positions};
    for (const key of positions) {
        displayText[key] = Array.from({length: 4}, () => ({type: 'none', defaultFont: true}));
    }
    displayText.topleft[0] = {type: 'text', text: 'Legacy', onlyShowOnScreen: '1', customCSS: 'opacity:.7'};
    displayText.topleft[2] = {type: 'time', timeString: 'HH:mm', defaultFont: false, font: 'Arial'};
    const values = {displayText, numDisplays: 3, textFont: 'Arial', textSize: '2', textColor: '#ffffff', randomSpeed: 30};
    const writes = [];
    const api = {store: {get: key => structuredClone(values[key]), set(key, value) { values[key] = structuredClone(value); writes.push(key); }}, fontListUniversal: {getFonts: async () => []}};
    const element = (tag, props, ...children) => new Node(tag, props, ...children);
    const context = vm.createContext({crypto: require('node:crypto').webcrypto, structuredClone, api, element, button: (name, action, className) => new Node('button', {className, events: {click: action}}, name), cssFontFamily: value => value, notify() {}, setSetting: (key, value) => api.store.set(key, value), ask() {}, send() {}, locale: () => 'en', window: {aerialTextStyle: require('../web/text-style'), moment: () => ({locale() { return this; }, format: () => '12:00'})}});
    const source = fs.readFileSync(require.resolve('../web/config/text-settings.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export function', 'function');
    vm.runInContext(source, context);
    const root = new Node('div');
    const controller = context.initTextSettings(root);
    const find = label => root.find(node => node['aria-label'] === label);
    return {root, values, writes, find, controller};
}

test('legacy overlay initialization and opening preserve every saved field and sparse line', () => {
    const ui = setup();
    const before = structuredClone(ui.values);
    assert.deepEqual(ui.writes, []);
    ui.find('Edit Top left').events.click();
    assert.deepEqual(ui.values, before);
    assert(ui.find('Line 4 type'));
    assert.equal(ui.root.find(node => node.className === 'section default-font').open, undefined);
    ui.find('Bottom center').change('bottommiddle');
    assert.deepEqual(ui.values.displayText.bottommiddle.map(({overlayId, ...line}) => line), before.displayText.topleft);
    assert(ui.values.displayText.topleft.every(line => line.type === 'none'));
    assert.deepEqual(ui.values.displayText.positionList, before.displayText.positionList);
});

test('new overlay progressively reveals four lines and shows the random timer only at random', () => {
    const ui = setup();
    ui.find('Add overlay').events.click();
    assert(ui.find('Line 1 type'));
    assert.equal(ui.find('Line 2 type'), undefined);
    for (let line = 1; line <= 4; line++) {
        ui.find('Line ' + line + ' type').change('text');
    }
    assert.equal(ui.find('Line 5 type'), undefined);
    ui.find('Random').change('random');
    const timer = ui.root.find(node => node.tag === 'label' && node.children.includes('Change random position every (seconds)'));
    assert(timer);
    timer.children[1].change('45');
    assert.equal(ui.values.randomSpeed, '45');
});


test('monitor changes apply to all lines and removing an overlay leaves other settings intact', () => {
    const ui = setup();
    ui.find('Edit Top left').events.click();
    const initial = ui.root.find(node => node.className === 'overlay-monitors');
    initial.children[2].children[0].checked = true;
    initial.children[2].children[0].events.change();
    const monitors = ui.root.find(node => node.className === 'overlay-monitors');
    const monitor3 = monitors.children[3].children[0];
    monitor3.checked = true;
    monitor3.events.change();
    for (const line of ui.values.displayText.topleft) {
        assert.deepEqual(line.onlyShowOnScreen, ['1', '2']);
    }
    ui.find('Done editing Top left').events.click();
    const remove = ui.root.find(node => node.tag === 'button' && node.children.includes('Remove'));
    remove.events.click();
    assert(ui.values.displayText.topleft.every(line => line.type === 'none'));
    assert.equal(ui.values.textFont, 'Arial');
});

test('position radios follow monitor occupancy and shared positions preserve both overlays', () => {
    const ui = setup();
    ui.values.displayText.topleft[2].onlyShowOnScreen = '1';
    const legacy = structuredClone(ui.values.displayText.topleft);
    ui.find('Add overlay').events.click();
    assert.equal(ui.find('Top left'), undefined);
    assert(ui.find('Overlay position').children.some(node => node.tag === 'img'));
    const monitors = ui.root.find(node => node.className === 'overlay-monitors');
    const monitor1 = monitors.children[1].children[0];
    monitor1.checked = true;
    monitor1.events.change();
    assert(ui.find('Top left'));
    ui.find('Top left').change('topleft');
    ui.find('Line 1 type').change('text');
    assert.deepEqual(ui.values.displayText.topleft.slice(0, 4), legacy);
    const newLines = ui.values.displayText.topleft.filter(line => line.overlayId);
    assert.equal(newLines.length, 4);
    assert.equal(newLines[0].onlyShowOnScreen, '0');
    const id = newLines[0].overlayId;
    ui.find('Bottom center').change('bottommiddle');
    assert.deepEqual(ui.values.displayText.topleft, legacy);
    assert.equal(ui.values.displayText.bottommiddle[0].overlayId, id);
    ui.find('Top left').change('topleft');
    // Expanding onto monitor 2 would collide, so the editor moves to a free position.
    const currentMonitors = ui.root.find(node => node.className === 'overlay-monitors');
    const monitor2 = currentMonitors.children[2].children[0];
    monitor2.checked = true;
    monitor2.events.change();
    assert.equal(ui.find('Top left'), undefined);
    assert.deepEqual(ui.values.displayText.topleft, legacy);
    assert(ui.values.displayText.topmiddle.some(line => line.overlayId === id));
});

test('display on appears only once and before the image picker', () => {
    const ui = setup();
    ui.find('Edit Top left').events.click();
    const body = ui.root.find(node => node.className === 'overlay-editor').children[0];
    assert(body.children[1].find(node => node.className === 'overlay-monitors'));
    assert(body.children[2].find(node => node.className === 'position-preview'));
    const lines = ui.root.find(node => node.className === 'overlay-lines');
    assert.equal(lines.find(node => node.className === 'overlay-monitors'), undefined);
});

test('default and custom font style controls persist independently and shadow controls follow the enable switch', () => {
    const ui = setup();
    ui.find('Bold').events.click();
    assert.equal(ui.values.textStyle.bold, true);
    assert.equal(ui.find('Bold')['aria-pressed'], 'true');
    assert.equal(ui.find('Opacity').value, 20);
    ui.find('Opacity').change('65');
    assert.equal(ui.values.textStyle.opacity, 65);
    const shadow = ui.find('Enable drop shadow');
    shadow.checked = false;
    shadow.events.change();
    assert.equal(ui.values.textStyle.shadowEnabled, false);
    assert.equal(ui.root.find(node => node.className === 'shadow-settings').hidden, true);
    ui.find('Edit Top left').events.click();
    const lines = ui.root.find(node => node.className === 'overlay-lines');
    const italic = lines.find(node => node['aria-label'] === 'Italic');
    italic.events.click();
    const custom = ui.values.displayText.topleft.find(line => line.type === 'time');
    assert.equal(custom.fontStyle.italic, true);
    assert.equal(custom.fontStyle.bold, true);
    assert.equal(custom.fontStyle.opacity, 65);
    assert.equal(ui.values.textStyle.italic, false);
    assert.equal(italic.title, 'Italic');
});

test('accordion check closes edits and opening another overlay keeps only one inline editor', () => {
    const ui = setup();
    ui.find('Add overlay').events.click();
    ui.find('Line 1 type').change('text');
    assert.equal(ui.find('Done editing Top center')['aria-expanded'], 'true');
    const firstEditor = ui.root.find(node => node.className === 'overlay-editor');
    ui.find('Edit Top left').events.click();
    assert.equal(ui.find('Edit Top center')['aria-expanded'], 'false');
    assert.equal(ui.find('Done editing Top left')['aria-expanded'], 'true');
    assert.equal(ui.root.find(node => node.className === 'overlay-editor'), firstEditor);
    assert.equal(ui.root.find(node => node.tag === 'dialog'), undefined);
    ui.find('Done editing Top left').events.click();
    assert.equal(ui.root.find(node => node.className === 'overlay-editor'), undefined);
    assert.equal(ui.find('Edit Top left')['aria-expanded'], 'false');
    assert.equal(ui.values.displayText.topmiddle[0].type, 'text');
});

test('inline edits keep the editor attached while saving font changes', () => {
    const ui = setup();
    ui.find('Edit Top left').events.click();
    const editor = ui.root.find(node => node.className === 'overlay-editor');
    const parent = editor.parentElement;
    const italic = editor.find(node => node['aria-label'] === 'Italic');
    italic.events.click();
    assert.equal(editor.parentElement, parent);
    assert.equal(editor.find(node => node['aria-label'] === 'Italic'), italic);
});

test('overlay monitor controls ignore stale later-line targets for named overlays', () => {
    const ui = setup();
    for (const line of ui.values.displayText.topleft) {
        line.overlayId = 'named';
    }
    ui.values.overlayNames = {named: 'Clock'};
    ui.controller.refresh();
    ui.find('Edit Clock').events.click();
    const monitors = ui.root.find(node => node.className === 'overlay-monitors');
    assert.equal(monitors.children[0].children[0].checked, false);
    assert.equal(monitors.children[2].children[0].checked, true);
});

test('line spacing saves independently for the default font and individual custom lines', () => {
    const ui = setup();
    assert.equal(ui.find('Line spacing').value, 100);
    assert.equal(ui.find('Line spacing').min, 50);
    assert.equal(ui.find('Line spacing').max, 200);
    ui.find('Line spacing').change('125');
    assert.equal(ui.values.textStyle.lineSpacing, 125);
    ui.find('Edit Top left').events.click();
    const editor = ui.root.find(node => node.className === 'overlay-editor');
    const spacing = editor.find(node => node['aria-label'] === 'Line spacing');
    assert.equal(spacing.value, 125);
    spacing.change('75');
    assert.equal(ui.values.displayText.topleft.find(line => line.type === 'time').fontStyle.lineSpacing, 75);
    assert.equal(ui.values.textStyle.lineSpacing, 125);
});

