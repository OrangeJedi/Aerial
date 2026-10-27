let localFontFaces = {};

function cssString(value) {
    return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function fontAlias(font) {
    let hash = 0;
    for (let i = 0; i < font.length; i++) {
        hash = ((hash << 5) - hash) + font.charCodeAt(i);
        hash |= 0;
    }
    return `AerialLocalFont-${Math.abs(hash)}`;
}

function ensureLocalFontFace(font) {
    let fontName = String(font || "").trim().replace(/^["']|["']$/g, "");

    if (!fontName) {
        return "";
    }

    let alias = fontAlias(fontName);

    if (!localFontFaces[alias]) {
        let fontSources = [fontName];
        let fontNameWithoutRegular = fontName.replace(/\s+Regular$/i, "");
        if (fontNameWithoutRegular !== fontName) {
            fontSources.push(fontNameWithoutRegular);
        }

        let style = document.getElementById("aerial-local-font-faces");
        if (!style) {
            style = document.createElement("style");
            style.id = "aerial-local-font-faces";
            document.head.appendChild(style);
        }

        style.appendChild(document.createTextNode(`@font-face { font-family: ${cssString(alias)}; src: ${fontSources.map(fontSource => `local(${cssString(fontSource)})`).join(", ")}; font-display: swap; }\n`));
        localFontFaces[alias] = true;
    }

    return alias;
}

export function cssFontFamily(font) {
    let fontName = String(font || "").trim().replace(/^["']|["']$/g, "");
    let alias = ensureLocalFontFace(fontName);

    if (!fontName) {
        return `"Segoe UI", sans-serif`;
    }

    return `${cssString(alias)}, ${cssString(fontName)}, "Segoe UI", sans-serif`;
}

