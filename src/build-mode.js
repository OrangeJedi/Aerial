const isScr = require('../package.json').aerialScr === true;
const disabledSettings = new Set([
    'useTray', 'startAfter', 'runOnBattery', 'QUNS_BUSY', 'ES_DISPLAY_REQUIRED',
    'sleepAfterBlank', 'sleepAfterBlankDelay', 'lockAfterRun', 'lockAfterRunAfter',
    'restartForUpdate', 'checkForUpdates',
    'enableGlobalShortcut', 'globalShortcutModifier1', 'globalShortcutModifier2', 'globalShortcutKey'
]);

function settingsDefinition(definition) {
    if (!isScr) {
        return definition;
    }
    return definition.map(group => ({
        ...group,
        entries: group.entries.filter(entry => !disabledSettings.has(entry.id)).map(entry => {
            if (entry.id === 'manualUpdate') {
                return {...entry, name: 'Download new version from GitHub', visibleWhen: {
                    source: 'updateStatus', property: 'status', in: ['available', 'error']
                }};
            }
            if (entry.id === 'updateStatus') {
                return {...entry, visibleWhen: {
                    source: 'updateStatus', property: 'status', in: ['checking', 'current']
                }};
            }
            return entry;
        })
    })).filter(group => group.entries.length);
}

module.exports = {isScr, settingsDefinition};
