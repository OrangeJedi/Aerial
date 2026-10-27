const path = require('path');

function resolveVideoLocale(languages, locales) {
    const available = new Map(locales.map(locale => [locale.toLowerCase(), locale]));
    for (const language of languages || []) {
        const tag = String(language).replace(/_/g, '-').toLowerCase();
        if (available.has(tag)) {
            return available.get(tag);
        }
        let regional = tag;
        while (regional.includes('-')) {
            regional = regional.slice(0, regional.lastIndexOf('-'));
            if (available.has(regional)) {
                return available.get(regional);
            }
        }
        const base = tag.split('-')[0];
        if (base === 'zh') {
            const traditional = /-(hant|tw|hk|mo)(-|$)/.test(tag);
            const chinese = traditional ? (tag.includes('-hk') ? 'zh-hk' : 'zh-tw') : 'zh-cn';
            if (available.has(chinese)) {
                return available.get(chinese);
            }
        }
        if (base === 'nb' || base === 'nn') {
            if (available.has('no')) {
                return available.get('no');
            }
        }
        if (available.has(base)) {
            return available.get(base);
        }
        const defaults = {pt: 'pt-br'};
        if (available.has(defaults[base])) {
            return available.get(defaults[base]);
        }
    }
    return 'en';
}

function createVideoLocalizer({videos, locales, load = locale => require(path.join(__dirname, '..', 'localized', `${locale}.json`))}) {
    const builtIn = new Map(videos.map(video => [video.id, video]));
    const cache = new Map();
    function pack(locale) {
        if (!cache.has(locale)) {
            cache.set(locale, load(locale));
        }
        return cache.get(locale);
    }
    function nonempty(value) {
        return typeof value === 'string' && value.trim().length > 0;
    }
    return (video, languages) => {
        const original = builtIn.get(video.id);
        if (!original) {
            return {name: video.name, accessibilityLabel: video.accessibilityLabel,
                pointsOfInterest: video.pointsOfInterest || {}};
        }
        const locale = resolveVideoLocale(languages, locales);
        const english = pack('en')[video.id] || {};
        const isEnglish = locale.split('-')[0] === 'en';
        const translated = isEnglish ? {} : (pack(locale)[video.id] || {});
        const pointsOfInterest = {...(english.pointsOfInterest || original.pointsOfInterest || {})};
        for (const [timestamp, caption] of Object.entries(translated.pointsOfInterest || {})) {
            if (nonempty(caption)) {
                pointsOfInterest[timestamp] = caption;
            }
        }
        let group = nonempty(translated.group) ? translated.group : original.accessibilityLabel;
        if (!isEnglish && original.accessibilityLabel === 'India' && !nonempty(translated.group)) {
            group = new Intl.DisplayNames([locale], {type: 'region'}).of('IN');
        }
        return {
            name: nonempty(translated.name) ? translated.name : original.name,
            accessibilityLabel: group,
            pointsOfInterest
        };
    };
}

module.exports = {resolveVideoLocale, createVideoLocalizer};
