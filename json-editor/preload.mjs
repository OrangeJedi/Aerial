import {contextBridge} from 'electron';
import beautify from 'json-beautify';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

contextBridge.exposeInMainWorld('electron', {
    videos: require('../videos.json'),
    jsonBeautify: beautify
});
