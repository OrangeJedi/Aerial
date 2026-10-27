const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {resolveVideoLocale, createVideoLocalizer} = require('../video-localization');
const videos = require('../videos.json');
const locales = require('../localized/locales.json');
const english = require('../localized/en.json');

test('regional, script, Norwegian and unsupported language selections resolve predictably', () => {
    for (const [requested, expected] of [
        ['fr-FR', 'fr'], ['fr_CA', 'fr-CA'], ['pt', 'pt-BR'], ['pt-PT-u-nu-latn', 'pt-PT'],
        ['zh-Hant', 'zh-TW'], ['zh-Hant-HK', 'zh-HK'], ['zh-Hans-SG', 'zh-CN'],
        ['nb-NO', 'no'], ['nn-NO', 'no'], ['no-NO', 'no'], ['en-US', 'en'], ['unknown', 'en']
    ]) {
        assert.equal(resolveVideoLocale([requested], locales), expected, requested);
    }
    assert.equal(resolveVideoLocale(['unsupported', 'fr-CA'], locales), 'fr-CA');
    assert.equal(resolveVideoLocale(['en-US', 'fr'], locales), 'en');
});

test('all English selections keep every preferred name, group, caption and timestamp', () => {
    const localize = createVideoLocalizer({videos, locales});
    for (const locale of ['en', 'en-AU', 'en-CA', 'en-GB', 'en-IN', 'en-PH', 'en-US', 'unknown']) {
        for (const video of videos) {
            const result = localize(video, [locale]);
            assert.equal(result.name, video.name);
            assert.equal(result.accessibilityLabel, video.accessibilityLabel);
            assert.deepEqual(result.pointsOfInterest, english[video.id].pointsOfInterest);
            assert.equal(video.pointsOfInterest, undefined);
        }
    }
    assert.equal(Object.values(english).reduce((count, value) => count + Object.keys(value.pointsOfInterest).length, 0), 398);
});

test('all packs contain 152 names and complete caption timelines', () => {
    const localize = createVideoLocalizer({videos, locales});
    assert.equal(locales.length, 43);
    let gaps = 0;
    for (const locale of locales) {
        const pack = require(`../localized/${locale}.json`);
        for (const video of videos) {
            const entry = pack[video.id];
            assert.ok(entry.name.trim(), `${locale}: ${video.id}`);
            const text = localize(video, [locale]);
            assert.deepEqual(Object.keys(text.pointsOfInterest), Object.keys(english[video.id].pointsOfInterest));
            for (const [timestamp, fallback] of Object.entries(english[video.id].pointsOfInterest)) {
                assert.equal(text.pointsOfInterest[timestamp], entry.pointsOfInterest[timestamp] || fallback);
                if (!entry.pointsOfInterest[timestamp]) {
                    gaps++;
                }
            }
        }
    }
    assert.equal(gaps, 0);
    const report = require('../localized/import-report.json');
    assert.equal(report.remainingGaps.length, 0);
    assert.equal(report.sourceGaps.length, 333);
});

test('localized metadata leaves sources, IDs and custom videos untouched and caches packs', () => {
    const loaded = [];
    const localize = createVideoLocalizer({videos, locales, load: locale => {
        loaded.push(locale);
        return require(`../localized/${locale}.json`);
    }});
    const original = structuredClone(videos[0]);
    const french = localize(videos[0], ['fr']);
    assert.equal(french.name, require('../localized/fr.json')[original.id].name);
    assert.notEqual(french.name, original.name);
    localize(videos[1], ['fr']);
    assert.deepEqual(loaded, ['en', 'fr']);
    assert.deepEqual(videos[0], original);
    const custom = {id: '_custom', name: 'My film', accessibilityLabel: 'My label', pointsOfInterest: {'0': 'My caption'}};
    assert.deepEqual(localize(custom, ['fr']), {name: custom.name, accessibilityLabel: custom.accessibilityLabel, pointsOfInterest: custom.pointsOfInterest});
    const india = videos.find(video => video.accessibilityLabel === 'India');
    assert.equal(localize(india, ['fr']).accessibilityLabel, new Intl.DisplayNames(['fr'], {type: 'region'}).of('IN'));
});

test('partial manual translations merge captions by timestamp without blanking names', () => {
    const video = {id: 'a', name: 'Preferred title', accessibilityLabel: 'Preferred group'};
    const packs = {en: {a: {pointsOfInterest: {'0': 'First', '10': 'Second'}}},
        fr: {a: {name: ' ', pointsOfInterest: {'0': 'Manually filled', '10': ''}}}};
    const localize = createVideoLocalizer({videos: [video], locales: ['en', 'fr'], load: locale => packs[locale]});
    assert.deepEqual(localize(video, ['fr']), {
        name: 'Preferred title', accessibilityLabel: 'Preferred group', pointsOfInterest: {'0': 'Manually filled', '10': 'Second'}
    });
});

test('video list retains translated labels and raw text for safe DOM rendering', async () => {
    const {visibleVideos} = await import('../web/config/video-model.js');
    const result = visibleVideos([videos[0]], () => ['source'], () => ({name: 'Texte <test> & "titre"', accessibilityLabel: 'Chine'}));
    assert.equal(result[0].text.name, 'Texte <test> & "titre"');
    assert.equal(result[0].text.accessibilityLabel, 'Chine');
    assert.equal(result[0].index, 0);
});
