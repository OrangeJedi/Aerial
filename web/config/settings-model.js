// Pure configuration rules shared by the renderer and tests.
export function matches(condition, read, sources = {}) {
    if (!condition) {
        return true;
    }
    if (condition.all) {
        return condition.all.every(child => matches(child, read, sources));
    }
    const value = condition.source ? sources[condition.source]?.[condition.property] : read(condition.key);
    if ('equals' in condition) {
        return value === condition.equals;
    }
    if ('notEquals' in condition) {
        return value !== undefined && value !== null && value !== condition.notEquals;
    }
    return condition.in?.includes(value) || false;
}

export function readEntry(entry, read) {
    if (entry.binding?.kind === 'arrayItem') {
        return read(entry.key)?.find(item => Object.entries(entry.binding.match).every(([key, value]) => item[key] === value))?.[entry.binding.property] ?? entry.default;
    }
    return read(entry.key) ?? entry.default;
}

export function entryChanges(entry, value, read, entries) {
    if (entry.binding?.kind === 'arrayItem') {
        const items = structuredClone(read(entry.key) || []);
        let item = items.find(candidate => Object.entries(entry.binding.match).every(([key, expected]) => candidate[key] === expected));
        if (!item) {
            item = {...entry.binding.match, min: entry.min, max: entry.max, suffix: entry.unit, defaultValue: entry.default};
            items.push(item);
        }
        item[entry.binding.property] = Number(value);
        return {[entry.key]: items};
    }
    const changes = {[entry.key]: value};
    if (value === true) {
        for (const id of entry.exclusiveWith || []) {
            const other = entries.find(candidate => candidate.id === id);
            if (other) {
                changes[other.key] = false;
            }
        }
    }
    return changes;
}

export function optionsFor(entry, read, sources = {}) {
    return entry.optionSets?.find(set => matches(set.when, read, sources))?.options || entry.options || [];
}

export function updateMessage(state) {
    const messages = {
        idle: 'Updates download automatically in the background.',
        unsupported: 'Automatic updates are available in installed copies of Aerial.',
        checking: 'Checking for updates…',
        current: 'Aerial is up to date.',
        downloading: `Downloading Aerial ${state.version || ''}… ${Math.round(state.percent || 0)}%`,
        ready: `Aerial ${state.version || ''} is ready. Restart to install the update.`,
        installing: 'Restarting Aerial to install the update…',
        error: 'Aerial could not update automatically. Download an update from GitHub or try again.'
    };
    return messages[state.status] || messages.idle;
}
