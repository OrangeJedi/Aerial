// Select an installed Moment locale, falling back from regional tags to language.
function dateTimeLocale() {
    const selected = electron.store.get('dateTimeLanguage');
    const languages = selected && selected !== 'system'
        ? [selected] : electron.systemLanguages;
    const available = new Set(moment.locales());
    for (const language of languages || []) {
        let candidate = language.toLowerCase().replace(/_/g, '-');
        if (/^no(-|$)/.test(candidate)) {
            candidate = candidate.replace(/^no/, 'nb');
        }
        if (/^zh-(hant|hans)(-|$)/.test(candidate)) {
            candidate = /-(hk|mo)(-|$)/.test(candidate) ? 'zh-hk' : candidate.includes('hant') ? 'zh-tw' : 'zh-cn';
        }
        while (candidate) {
            if (available.has(candidate)) {
                return candidate;
            }
            candidate = candidate.includes('-') ? candidate.slice(0, candidate.lastIndexOf('-')) : '';
        }
    }
    return 'en';
}

function localizedDateTime(value) {
    return moment(value).locale(dateTimeLocale());
}

function displayDateTimeLanguages() {
    const select = document.getElementById('dateTimeLanguage');
    select.replaceChildren(new Option('System default', 'system'));
    const names = new Intl.DisplayNames(electron.systemLanguages, {type: 'language'});
    const available = [...new Set([...moment.locales(), ...(electron.videoLocales || []).map(locale => locale.toLowerCase())])];
    const languages = available.map(locale => {
        let name = locale;
        try {
            name = names.of(locale);
        } catch (error) {
            // Some historical Moment locale identifiers are not BCP 47 tags.
        }
        return {locale, name};
    }).sort((a, b) => a.name.localeCompare(b.name));
    for (const {locale, name} of languages) {
        select.add(new Option(`${name} (${locale})`, locale));
    }
    const selected = electron.store.get('dateTimeLanguage') || 'system';
    select.value = available.includes(selected.toLowerCase()) ? selected.toLowerCase() : 'system';
}
