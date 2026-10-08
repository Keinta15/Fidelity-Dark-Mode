'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const chrome = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const firefox = JSON.parse(fs.readFileSync(path.join(root, 'manifest.firefox.json'), 'utf8'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

assert.equal(chrome.background.service_worker, 'src/background.js');
assert.equal(firefox.background.scripts[0], 'src/background.js');
assert.equal(firefox.browser_specific_settings.gecko.strict_min_version, '142.0');
assert.equal(firefox.browser_specific_settings.gecko.id, 'fidelity-dark-mode@keinta15.github.io');
assert.deepEqual(firefox.browser_specific_settings.gecko.data_collection_permissions, { required: ['none'] });
assert.equal(firefox.minimum_chrome_version, undefined);
assert.deepEqual(firefox.permissions, chrome.permissions);
assert.deepEqual(firefox.host_permissions, chrome.host_permissions);
assert.deepEqual(firefox.content_scripts, chrome.content_scripts);
assert.deepEqual(firefox.action, chrome.action);
assert.deepEqual(firefox.icons, chrome.icons);
assert.ok(read('src/background.js').includes('chrome.scripting.registerContentScripts'));
assert.ok(read('src/canvas.js').includes('manifest.json, "world": "MAIN"'));

console.log('Browser manifests are consistent and Firefox uses supported entry points.');
