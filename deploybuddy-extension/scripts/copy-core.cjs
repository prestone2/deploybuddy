const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.resolve(root, '../packages/core');
const destination = path.join(root, 'out/node_modules/@deploybuddy/core');
fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
fs.copyFileSync(path.join(source, 'package.json'), path.join(destination, 'package.json'));
fs.cpSync(path.join(source, 'dist'), path.join(destination, 'dist'), { recursive: true });
