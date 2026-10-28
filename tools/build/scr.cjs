const {build, Platform, Arch} = require('electron-builder');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createScrPackager} = require('./scr-cache.cjs');

async function main() {
    const architecture = process.argv[2] || 'x64';
    if (!['x64', 'arm64'].includes(architecture)) {
        throw new Error('SCR architecture must be x64 or arm64.');
    }
    const artifacts = await build({
        targets: Platform.WINDOWS.createTarget('portable', Arch[architecture]),
        publish: 'never',
        platformPackagerFactory: info => createScrPackager(info),
        config: {
            extraMetadata: {aerialScr: true},
            directories: {output: 'dist/scr'},
            portable: {artifactName: `Aerial-${architecture}.exe`}
        }
    });
    const executable = artifacts.find(file => path.basename(file) === `Aerial-${architecture}.exe`);
    if (!executable) {
        throw new Error('The portable SCR build did not produce an executable.');
    }
    const destination = executable.replace(/\.exe$/i, '.scr');
    await fs.rename(executable, destination);
    console.log(`Built ${destination}`);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
