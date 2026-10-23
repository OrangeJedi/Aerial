const {isDeepStrictEqual} = require('util');

// Reuse one disk snapshot during a renderer task. The next task reads fresh data,
// including changes made by the main process or the JSON editor.
function createSettingsStore(store, schedule = setTimeout) {
    let snapshot;
    let scheduled = false;

    function read() {
        if (!snapshot) {
            snapshot = store.store;
        }
        if (!scheduled) {
            scheduled = true;
            schedule(() => {
                snapshot = undefined;
                scheduled = false;
            }, 0);
        }
        return snapshot;
    }

    return {
        get(key) {
            return structuredClone(read()[key]);
        },
        invalidate() {
            snapshot = undefined;
        },
        set(key, value) {
            const changes = typeof key === 'string' ? {[key]: value} : key;
            // Merge against disk so unrelated changes from other processes survive.
            const current = store.store;
            if (Object.entries(changes).some(([name, next]) => !isDeepStrictEqual(current[name], next))) {
                store.store = {...current, ...structuredClone(changes)};
            }
            snapshot = {...current, ...structuredClone(changes)};
            read();
        }
    };
}

module.exports = {createSettingsStore};
