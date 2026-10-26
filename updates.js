const RELEASES_URL = 'https://github.com/AerialWindows/Aerial/releases';

function createAppUpdater({updater, app, Notification, onState, beforeInstall, cancelInstall = () => {}, openExternal, logger = console}) {
    let state = {status: app.isPackaged ? 'idle' : 'unsupported'};
    let checking = false;
    let installing = false;
    let notification;

    function publish(status, details = {}) {
        state = {status, ...details};
        onState({...state});
    }

    function notify(title, body, click) {
        try {
            notification = new Notification({title, body});
            notification.on('click', click);
            notification.show();
        } catch (error) {
            logger.error('Unable to show update notification', error);
        }
    }

    function fail(error) {
        logger.error('Aerial update failed', error);
        if (installing) {
            cancelInstall();
        }
        installing = false;
        const alreadyFailed = state.status === 'error';
        publish('error');
        if (!alreadyFailed) {
            notify('Aerial could not update automatically',
                'Click to download the latest version from GitHub.',
                () => Promise.resolve(openExternal(RELEASES_URL)).catch(error => logger.error(error)));
        }
    }

    async function restart() {
        if (state.status !== 'ready' || installing) {
            return;
        }
        installing = true;
        publish('installing', {version: state.version});
        try {
            await beforeInstall();
            updater.quitAndInstall(false, true);
        } catch (error) {
            fail(error);
        }
    }

    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.autoRunAppAfterInstall = true;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.on('error', fail);
    updater.on('checking-for-update', () => publish('checking'));
    updater.on('update-not-available', () => publish('current'));
    updater.on('update-available', info => publish('downloading', {version: info.version, percent: 0}));
    updater.on('download-progress', progress => {
        if (state.status === 'downloading') {
            const percent = Math.max(0, Math.min(100, Math.floor(progress.percent || 0)));
            if (percent !== state.percent) {
                publish('downloading', {version: state.version, percent});
            }
        }
    });
    updater.on('update-downloaded', info => {
        if (state.status === 'ready' && state.version === info.version) {
            return;
        }
        publish('ready', {version: info.version});
        notify('Aerial update ready',
            `Version ${info.version} has downloaded. Click to restart Aerial and install it.`, restart);
    });

    async function check() {
        if (!app.isPackaged || checking || ['ready', 'installing', 'downloading'].includes(state.status)) {
            return;
        }
        checking = true;
        try {
            const result = await updater.checkForUpdates();
            // Automatic downloads have their own promise, separate from the check.
            if (result && result.downloadPromise) {
                await result.downloadPromise;
            }
        } catch (error) {
            fail(error);
        } finally {
            checking = false;
        }
    }

    return {check, restart, getState: () => ({...state})};
}

module.exports = {createAppUpdater};
