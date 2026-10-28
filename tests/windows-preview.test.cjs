const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {parsePreviewArguments, startWindowsPreview} = require('../src/windows-preview');

for (const argv of [['/p', '12345'], ['/P:12345'], ['/p', '0x3039']]) {
    test(`Windows preview parses ${argv.join(' ')}`, () => {
        assert.deepEqual(parsePreviewArguments(argv), {requested: true, handle: '12345'});
    });
}

for (const value of [undefined, '0', '-1', 'hello', '123;exit', '18446744073709551616']) {
    test(`Windows preview rejects invalid handle ${value}`, () => {
        assert.deepEqual(parsePreviewArguments(['/p', value]), {requested: true, handle: null});
    });
}

test('Windows preview does not intercept other launch options', () => {
    assert.deepEqual(parsePreviewArguments(['/s', '/t', '/preview']), {requested: false});
});

test('embedded preview ignores keyboard and mouse dismissal', () => {
    const fs = require('node:fs');
    const vm = require('node:vm');
    const source = fs.readFileSync(require.resolve('../web/screensaver.js'), 'utf8');
    vm.runInNewContext(source.slice(source.indexOf('function quitApp()'), source.indexOf('function resetLayer(')), {
        electron: {embeddedPreview: true},
        document: {addEventListener: () => assert.fail('embedded preview must not dismiss on input')},
        setTimeout: () => assert.fail('embedded preview must not register mouse wake timers')
    });
});

function fixture() {
    const helper = new EventEmitter();
    helper.stdout = new EventEmitter();
    helper.stderr = new EventEmitter();
    let killed = 0;
    let quit = 0;
    let invocation;
    let win;
    const errors = [];
    helper.kill = () => { killed++; };
    class Window extends EventEmitter {
        constructor(options) {
            super();
            win = this;
            this.options = options;
            this.webContents = new EventEmitter();
            this.webContents.send = (...args) => { this.message = args; };
        }
        isDestroyed() {
            return !!this.destroyed;
        }
        showInactive() {
            this.shown = (this.shown || 0) + 1;
        }
        destroy() {
            this.destroyed = true;
            this.emit('closed');
        }
        getNativeWindowHandle() {
            const handle = Buffer.alloc(8);
            handle.writeBigUInt64LE(67890n);
            return handle;
        }
        loadFile(file) {
            this.file = file;
            return Promise.resolve();
        }
    }
    startWindowsPreview({
        BrowserWindow: Window, app: {quit: () => { quit++; }}, parentHandle: '12345',
        run: (...args) => { invocation = args; return helper; }, logger: {error: (...args) => errors.push(args)}
    });
    return {win, helper, errors, get invocation() { return invocation; }, quit: () => quit, killed: () => killed};
}

test('Windows preview stays hidden until native attachment and cleans up after its parent closes', {skip: process.platform !== 'win32'}, () => {
    const f = fixture();
    assert.equal(f.win.options.show, false);
    assert.equal(f.win.options.focusable, false);
    assert.equal(f.invocation, undefined);
    assert.equal(f.win.shown, undefined);
    f.win.emit('ready-to-show');
    assert.deepEqual(f.win.message, ['screenNumber', 0]);
    const [executable, args, options] = f.invocation;
    assert.match(executable, /powershell.exe$/);
    assert.equal(options.windowsHide, true);
    const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
    assert.match(script, /-ParentHandle 12345 -ChildHandle 67890/);
    f.helper.stdout.emit('data', 'READY\r\n');
    assert.equal(f.win.shown, 1);
    f.helper.stdout.emit('data', '\r\n');
    assert.equal(f.win.shown, 1);
    f.helper.emit('exit', 0);
    assert.equal(f.win.destroyed, true);
    assert.equal(f.quit(), 1);
    assert.equal(f.killed(), 1);
});

test('Windows preview helper failures terminate the hidden preview without a dialog', {skip: process.platform !== 'win32'}, () => {
    const f = fixture();
    f.win.emit('ready-to-show');
    f.helper.stderr.emit('data', 'Invalid parent window');
    f.helper.emit('exit', 1);
    assert.equal(f.errors.length, 1);
    assert.equal(f.win.destroyed, true);
    assert.equal(f.quit(), 1);
});
