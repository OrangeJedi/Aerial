const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

for (const file of ['config/fonts.js', 'screensaver.js']) {
    test(`${file} registers local font aliases once and includes the family fallback`, () => {
        const source = fs.readFileSync(require.resolve(`../web/${file}`), 'utf8');
        const styles = new Map();
        const context = vm.createContext({document: {
            getElementById: id => styles.get(id),
            createElement: () => ({rules: [], appendChild(node) { this.rules.push(node); }}),
            createTextNode: text => text,
            head: {appendChild(style) { styles.set(style.id, style); }}
        }});
        const start = source.indexOf('let localFontFaces');
        const end = source.indexOf('\n}', source.indexOf('function cssFontFamily', start)) + 2;
        vm.runInContext(source.slice(start, end).replace('export function', 'function'), context);
        const family = context.cssFontFamily('Helvetica Neue LT Std Regular');
        assert.match(family, /^"AerialLocalFont-\d+", "Helvetica Neue LT Std Regular"/);
        const style = styles.get('aerial-local-font-faces');
        assert.match(style.rules[0], /local\("Helvetica Neue LT Std Regular"\), local\("Helvetica Neue LT Std"\)/);
        assert.equal(context.cssFontFamily('Helvetica Neue LT Std Regular'), family);
        assert.equal(style.rules.length, 1);
        assert.equal(context.cssFontFamily(''), '"Segoe UI", sans-serif');
    });
}
