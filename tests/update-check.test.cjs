const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('update checks handle successful responses, HTTP errors, invalid JSON and network failures', async () => {
    const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
    const start = source.indexOf('function availableUpdate(');
    const end = source.indexOf('//events from browser windows', start);
    for (const outcome of ['success', 'http', 'json', 'network']) {
        const writes = [];
        const errors = [];
        let notifications = 0;
        const context = vm.createContext({
            AbortSignal, semver: require('semver'), configWindow: null,
            fetch: async () => {
                if (outcome === 'network') {
                    throw new Error('Offline');
                }
                return {
                    ok: outcome !== 'http', status: 503,
                    json: async () => {
                        if (outcome === 'json') {
                            throw new SyntaxError('Invalid JSON');
                        }
                        return {tag_name: 'v2.0.0'};
                    }
                };
            },
            store: {set: (...args) => writes.push(args)},
            app: {isPackaged: true, getVersion: () => '1.3.0'},
            Notification: class {
                show() { notifications++; }
            },
            console: {log: (...args) => errors.push(args)}
        });
        vm.runInContext(source.slice(start, end), context);
        await context.checkForUpdate();
        assert.equal(notifications, outcome === 'success' ? 1 : 0);
        assert.equal(errors.length, outcome === 'success' ? 0 : 1);
        assert.equal(writes.length, outcome === 'success' ? 2 : 1);
    }
});
