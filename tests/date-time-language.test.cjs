const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(selected, languages) {
    const context = vm.createContext({
        electron: {store: {get: () => selected}, systemLanguages: languages}
    });
    for (const file of ['libraries/js/moment.min.js', 'libraries/js/moment-locales.min.js', 'date-time-language.js']) {
        vm.runInContext(fs.readFileSync(require.resolve(`../web/${file}`), 'utf8'), context);
    }
    return context;
}

test('date/time uses system language and regional fallback by default', () => {
    const context = fixture(undefined, ['fr-FR']);
    assert.equal(vm.runInContext('dateTimeLocale()', context), 'fr');
    assert.equal(vm.runInContext("localizedDateTime([2026, 0, 5]).format('dddd D MMMM')", context), 'lundi 5 janvier');
});

test('manual choice overrides system and preserves custom literals', () => {
    const context = fixture('de', ['fr-FR']);
    assert.equal(vm.runInContext("localizedDateTime([2026, 0, 5, 13, 4]).format('[Time:] HH:mm dddd')", context), 'Time: 13:04 Montag');
});

test('unsupported languages fall back safely and system preferences are ordered', () => {
    assert.equal(vm.runInContext('dateTimeLocale()', fixture('unknown', ['fr'])), 'en');
    assert.equal(vm.runInContext('dateTimeLocale()', fixture('system', ['zz-ZZ', 'pt-BR'])), 'pt-br');
});

test('Apple Norwegian and Chinese script locales also format dates in the selected language', () => {
    assert.equal(vm.runInContext('dateTimeLocale()', fixture('no-NO', [])), 'nb');
    assert.equal(vm.runInContext('dateTimeLocale()', fixture('zh-Hant', [])), 'zh-tw');
    assert.equal(vm.runInContext('dateTimeLocale()', fixture('zh-Hans', [])), 'zh-cn');
});
