'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist', 'firefox');
const assets = ['src', 'popup', 'icons'];

fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(root, 'manifest.firefox.json'), path.join(out, 'manifest.json'));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(out, 'LICENSE'));
for (const asset of assets) {
  fs.cpSync(path.join(root, asset), path.join(out, asset), { recursive: true });
}

console.log(`Firefox extension built in ${path.relative(root, out)}`);
