'use strict';

const fs = require('fs');
const path = require('path');
const { ZipArchive } = require('archiver');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const out = path.join(dist, 'firefox');
const xpi = path.join(dist, 'fidelity-dark-mode-firefox.xpi');
const assets = ['src', 'popup', 'icons'];

fs.mkdirSync(dist, { recursive: true });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
fs.copyFileSync(path.join(root, 'manifest.firefox.json'), path.join(out, 'manifest.json'));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(out, 'LICENSE'));
for (const asset of assets) {
  fs.cpSync(path.join(root, asset), path.join(out, asset), { recursive: true });
}

async function packageXpi() {
  const output = fs.createWriteStream(xpi);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const written = new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });

  archive.pipe(output);
  archive.directory(out, false);
  archive.finalize();
  await written;
  console.log(`Firefox extension built at ${path.relative(root, xpi)}`);
}

packageXpi().catch(error => {
  console.error('Failed to package Firefox extension:', error);
  process.exitCode = 1;
});
