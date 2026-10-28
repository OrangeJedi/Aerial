const semver = require('semver');
const yaml = require('js-yaml');
const RELEASES_URL = 'https://github.com/AerialWindows/Aerial/releases';

function createScrUpdater({app, Notification, openExternal, onState = () => {}, fetchRelease = fetch, logger = console}) {
    let state = {status: 'checking'};
    let checking = false;
    let notifiedVersion;
    let notification;

    function publish(status) {
        state = {status};
        onState({...state});
    }

    async function read(url, json = false) {
        const response = await fetchRelease(url, {
            headers: {Accept: json ? 'application/json' : 'text/plain'},
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) {
            throw new Error(`Release check returned HTTP ${response.status}`);
        }
        return json ? response.json() : response.text();
    }

    async function check() {
        if (checking || !app.isPackaged) {
            return;
        }
        checking = true;
        publish('checking');
        try {
            const release = await read(`${RELEASES_URL}/latest`, true);
            const installed = semver.valid(app.getVersion());
            const tag = semver.valid(release.tag_name);
            if (!installed || !tag || release.draft || release.prerelease || semver.prerelease(tag)) {
                throw new Error('Invalid stable release or installed version');
            }
            if (!semver.gt(tag, installed)) {
                publish('current');
                return;
            }
            // electron-builder publishes latest.yml; also accept the .yaml spelling.
            let metadata;
            try {
                metadata = await read(`${RELEASES_URL}/download/${encodeURIComponent(release.tag_name)}/latest.yml`);
            } catch (error) {
                metadata = await read(`${RELEASES_URL}/download/${encodeURIComponent(release.tag_name)}/latest.yaml`);
            }
            const version = semver.valid(yaml.load(metadata)?.version);
            if (!version || semver.prerelease(version) || !semver.eq(version, tag) || !semver.gt(version, installed)) {
                throw new Error('Invalid stable update metadata');
            }
            publish('available');
            if (notifiedVersion === version) {
                return;
            }
            notification = new Notification({
                title: 'Aerial update available',
                body: `Version ${version} is available. Click to download it from GitHub.`
            });
            notification.on('click', () => {
                Promise.resolve(openExternal(RELEASES_URL)).catch(error => logger.error(error));
            });
            notification.show();
            notifiedVersion = version;
        } catch (error) {
            publish('error');
            logger.error('Unable to check for Aerial SCR updates', error);
        } finally {
            checking = false;
        }
    }

    return {check, getState: () => ({...state})};
}

module.exports = {createScrUpdater};
