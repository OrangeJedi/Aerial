const assert = require('node:assert/strict');
const {test} = require('node:test');
const {normalize, properties} = require('../web/text-style');

test('legacy text keeps a subtle shadow and normal opaque styling without mutating saved data', () => {
    const saved = {};
    assert.deepEqual(properties(saved), {'font-weight': '400', 'font-style': 'normal', 'text-decoration': 'none', opacity: '1', 'text-shadow': '0.025em 0.025em 0em #444444', 'line-height': '1'});
    assert.deepEqual(saved, {});
});

test('font styles apply emphasis, transparency and shadows relative to font size', () => {
    const style = properties({bold: true, italic: true, underline: true, transparency: 40, shadowSpread: 10, shadowBlur: 7, shadowColor: '#123456'});
    assert.deepEqual(style, {'font-weight': '700', 'font-style': 'italic', 'text-decoration': 'underline', opacity: '0.6', 'text-shadow': '0.1em 0.1em 0.07em #123456', 'line-height': '1'});
    assert.equal(properties({transparency: 100, shadowEnabled: false}).opacity, '0');
    assert.equal(properties({shadowEnabled: false})['text-shadow'], 'none');
});

test('invalid and out of range style settings fall back or clamp safely', () => {
    const style = normalize({transparency: -2, shadowSpread: 500, shadowBlur: 'invalid', shadowColor: 'red;display:none'});
    assert.equal(style.opacity, 100);
    assert.equal(style.shadowSpread, 10);
    assert.equal(style.shadowBlur, 0);
    assert.equal(style.shadowColor, '#444444');
});

test('opacity defaults to 100 and reads saved transparency without rewriting it', () => {
    assert.equal(normalize().opacity, 100);
    const legacy = {transparency: 35};
    assert.equal(normalize(legacy).opacity, 65);
    assert.equal(properties(legacy).opacity, '0.65');
    assert.deepEqual(legacy, {transparency: 35});
    assert.equal(normalize({opacity: 80, transparency: 35}).opacity, 80);
    assert.equal(properties({opacity: 0}).opacity, '0');
    assert.equal(properties({opacity: 100}).opacity, '1');
});

test('line spacing supports tighter and looser text with a 1x legacy default', () => {
    assert.equal(properties({})['line-height'], '1');
    assert.equal(properties({lineSpacing: 50})['line-height'], '0.5');
    assert.equal(properties({lineSpacing: 150})['line-height'], '1.5');
    assert.equal(properties({lineSpacing: 250})['line-height'], '2');
    assert.equal(properties({lineSpacing: -5})['line-height'], '0.5');
    assert.equal(properties({lineSpacing: 'invalid'})['line-height'], '1');
});
