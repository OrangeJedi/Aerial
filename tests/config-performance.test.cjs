const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

test('leaving the video tab and hiding the window release preview media', () => {
    const script = fs.readFileSync(require.resolve('../web/config.js'), 'utf8');
    const start = script.indexOf('function stopVideoPreview()');
    const end = script.indexOf('//Functions to run the side menus', start);
    const player = {};
    const tabs = Array.from({length: 3}, () => ({style: {}}));
    const links = Array.from({length: 4}, () => ({className: 'tablink w3-blue'}));
    let released = 0;
    let hidden = 0;
    let onVisibility;
    const context = vm.createContext({
        videoPlayback: {release: actual => { assert.equal(actual, player); released++; }},
        $: () => ({text() {}, hide() { hidden++; }}),
        document: {
            hidden: false,
            getElementById: id => id === 'videoPlayer' ? player : tabs[0],
            getElementsByClassName: name => name === 'tab' ? tabs : links,
            addEventListener: (name, callback) => { onVisibility = callback; }
        }
    });
    vm.runInContext(script.slice(start, end), context);
    context.changeTab({currentTarget: links[0]}, 'settingsTab');
    assert.equal(released, 1);
    assert.equal(hidden, 1);
    context.changeTab({currentTarget: links[1]}, 'videoTab');
    assert.equal(released, 1);
    context.document.hidden = true;
    onVisibility();
    assert.equal(released, 2);
});

test('font autocomplete browses all fonts and bounds substring search results', () => {
    const script = fs.readFileSync(require.resolve('../web/config.js'), 'utf8');
    const start = script.indexOf('function autocomplete(');
    const end = script.indexOf('\nfunction closeAllLists(elmnt)', start);
    const events = {};
    const element = () => ({
        children: [], style: {},
        setAttribute() {}, addEventListener() {}, querySelector() { return this.preview; },
        appendChild(child) {
            this.children.push(child);
            if (child.className === 'font-preview-sample') {
                this.preview = child;
            }
        }
    });
    const context = vm.createContext({cssFontFamily: font => font, document: {
        getElementsByClassName: () => [],
        createElement: element,
        createTextNode: text => ({textContent: text})
    }});
    vm.runInContext(script.slice(start, end), context);
    const field = {id: 'font', value: '', parentNode: element(), addEventListener: (event, callback) => {
        events[event] = callback;
    }};
    context.autocomplete(field, Array.from({length: 1000}, (_, i) => `Font ${i}`), () => {});
    events.focus.call(field);
    assert.equal(field.parentNode.children.at(-1).children.length, 1000);
    field.value = 'ont';
    events.input.call(field);
    assert.equal(field.parentNode.children.at(-1).children.length, 30);
    const option = field.parentNode.children.at(-1).children[0];
    assert.equal(option.children[0].children[1].textContent, 'ont');
    assert.equal(option.children[1].style.fontFamily, 'Font 0');
    field.value = 'Font 999';
    events.input.call(field);
    assert.equal(field.parentNode.preview.textContent, 'AaBbCc 123');
    assert.equal(field.parentNode.preview.style.fontFamily, 'Font 999');
});

test('cache pruning avoids scans and writes when nothing needs removing', async () => {
    const script = fs.readFileSync(require.resolve('../app.js'), 'utf8');
    const start = script.indexOf('// Cache maintenance runs');
    const end = script.indexOf('//open & close functions', start);
    let operations = 0;
    const context = vm.createContext({
        cachePath: 'cache', downloading: false,
        store: {get store() { return {downloadedVideos: ['a'], neverDownloadVideos: []}; }},
        path: require('node:path'), console,
        fs: {promises: new Proxy({}, {get: () => () => { operations++; throw new Error('Unexpected I/O'); }})}
    });
    vm.runInContext(script.slice(start, end), context);
    await context.pruneVideoCache();
    await context.pruneVideoCache();
    assert.equal(operations, 0);
});
