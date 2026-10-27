(function(root) {
    const defaults = Object.freeze({
        bold: false,
        italic: false,
        underline: false,
        opacity: 100,
        lineSpacing: 100,
        shadowEnabled: true,
        shadowColor: '#444444',
        shadowSpread: 2.5,
        shadowBlur: 0
    });

    function percent(value, maximum, fallback) {
        const number = Number(value);
        return value == null || !Number.isFinite(number) ? fallback : Math.min(maximum, Math.max(0, number));
    }

    function normalize(value = {}) {
        value ||= {};
        return {
            bold: value.bold === true,
            italic: value.italic === true,
            underline: value.underline === true,
            opacity: percent(value.opacity, 100, value.transparency == null ? defaults.opacity : 100 - percent(value.transparency, 100, 0)),
            lineSpacing: Math.max(50, percent(value.lineSpacing, 200, defaults.lineSpacing)),
            shadowEnabled: value.shadowEnabled !== false,
            shadowColor: /^#[\da-f]{6}$/i.test(value.shadowColor) ? value.shadowColor : defaults.shadowColor,
            shadowSpread: percent(value.shadowSpread, 10, defaults.shadowSpread),
            shadowBlur: percent(value.shadowBlur, 10, defaults.shadowBlur)
        };
    }

    function properties(value) {
        const style = normalize(value);
        const offset = style.shadowSpread / 100;
        return {
            'font-weight': style.bold ? '700' : '400',
            'font-style': style.italic ? 'italic' : 'normal',
            'text-decoration': style.underline ? 'underline' : 'none',
            opacity: String(style.opacity / 100),
            'text-shadow': style.shadowEnabled ? `${offset}em ${offset}em ${style.shadowBlur / 100}em ${style.shadowColor}` : 'none',
            'line-height': String(style.lineSpacing / 100)
        };
    }

    function declarations(value) {
        return Object.entries(properties(value)).map(([key, setting]) => `${key}:${setting}`).join(';') + ';';
    }

    const api = {defaults, normalize, properties, declarations};
    root.aerialTextStyle = api;
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
})(globalThis);
