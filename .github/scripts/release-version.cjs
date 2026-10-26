const fs = require('node:fs');
const semver = require('semver');

const tag = process.env.RELEASE_TAG || '';
const version = tag.replace(/^v/, '');
if (semver.valid(version) !== version) {
    throw new Error(`Release tag must be a semantic version, optionally prefixed with v: ${tag}`);
}

fs.appendFileSync(process.env.GITHUB_ENV, [
    `RELEASE_VERSION=${version}`,
    `RELEASE_PRERELEASE=${semver.prerelease(version) !== null}`,
    ''
].join('\n'));
