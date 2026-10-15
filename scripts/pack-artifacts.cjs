const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const out = process.env.DEPLOYBUDDY_ARTIFACT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'deploybuddy-release-'));
fs.mkdirSync(out, { recursive: true });

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, shell: false, windowsHide: true });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}.`);
  return result.stdout;
}

const packages = [
  ['packages/core', '@deploybuddy/core', '0.1.0'],
  ['packages/node-adapter', '@deploybuddy/node-adapter', '0.1.0'],
  ['apps/cli', 'deploybuddy', '0.1.0'],
];
for (const [directory, name, version] of packages) {
  const source = path.join(root, directory);
  const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  if (pkg.name !== name || pkg.version !== version || !pkg.license || !pkg.repository?.url) throw new Error(`Release metadata mismatch in ${directory}/package.json.`);
  if (!fs.existsSync(path.join(source, 'dist'))) throw new Error(`Missing built output for ${name}; run validate:platform first.`);
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'deploybuddy-pack-stage-'));
  fs.cpSync(path.join(source, 'dist'), path.join(stage, 'dist'), { recursive: true });
  for (const file of ['README.md', 'LICENSE']) fs.copyFileSync(path.join(source, file), path.join(stage, file));
  if (name === '@deploybuddy/node-adapter') pkg.dependencies = { '@deploybuddy/core': '^0.1.0' };
  if (name === 'deploybuddy') pkg.dependencies = { '@deploybuddy/core': '^0.1.0', '@deploybuddy/node-adapter': '^0.1.0' };
  delete pkg.bundledDependencies;
  fs.writeFileSync(path.join(stage, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  run(npm, ['pack', '--pack-destination', out], stage);
}

for (const file of fs.readdirSync(out).filter(name => name.endsWith('.tgz'))) {
  const entries = run('tar', ['-tzf', path.join(out, file)]).split(/\r?\n/).filter(Boolean);
  if (!entries.some(name => /(^|\/)package\/package\.json$/.test(name)) || !entries.some(name => /(^|\/)package\/dist\//.test(name))) throw new Error(`${file} does not contain package metadata and built runtime files.`);
  if (entries.some(name => name.split('/').includes('..'))) throw new Error(`${file} contains a parent-relative archive path.`);
  if (entries.some(name => /(^|\/)(test|tests|src|node_modules)\//.test(name))) throw new Error(`${file} includes development-only files or bundled dependencies.`);
}

const extensionRoot = path.join(root, 'deploybuddy-extension');
const extension = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
if (extension.version !== '0.2.0' || !fs.existsSync(path.join(extensionRoot, 'out/extension.js'))) throw new Error('VS Code release version/build does not match the expected 0.2.0 package.');
run(npm, ['run', 'package:vsix', '--', '--out', path.join(out, `deploybuddy-${extension.version}.vsix`)], extensionRoot);
const vsix = path.join(out, `deploybuddy-${extension.version}.vsix`);
const vsixEntries = run('unzip', ['-Z1', vsix]).split(/\r?\n/).filter(Boolean);
for (const required of ['extension/package.json', 'extension/readme.md', 'extension/LICENSE.txt', 'extension/icon.png', 'extension/out/extension.js', 'extension/schemas/deploybuddy.schema.json']) {
  if (!vsixEntries.includes(required)) throw new Error(`VSIX is missing required file ${required}.`);
}
if (vsixEntries.some(name => /extension\/(src|test|node_modules|coverage)\//.test(name))) throw new Error('VSIX includes development-only files.');

const actionPackage = JSON.parse(fs.readFileSync(path.join(root, 'apps/github-action/package.json'), 'utf8'));
const actionBundle = path.join(root, 'apps/github-action/dist/index.js');
if (!fs.existsSync(actionBundle) || fs.statSync(actionBundle).size < 50 * 1024) throw new Error('GitHub Action bundle is missing or unexpectedly small.');
fs.copyFileSync(actionBundle, path.join(out, `${actionPackage.name}-${actionPackage.version}-bundle.js`));

process.stdout.write(`\nArtifacts: ${out}\n`);
const budgets = new Map([
  ['deploybuddy-core-0.1.0.tgz', 256 * 1024],
  ['deploybuddy-node-adapter-0.1.0.tgz', 512 * 1024],
  ['deploybuddy-0.1.0.tgz', 1024 * 1024],
  ['deploybuddy-0.2.0.vsix', 5 * 1024 * 1024],
  [`${actionPackage.name}-${actionPackage.version}-bundle.js`, 1024 * 1024],
]);
for (const file of fs.readdirSync(out).sort()) {
  const full = path.join(out, file);
  if (!fs.statSync(full).isFile()) continue;
  const size = fs.statSync(full).size;
  process.stdout.write(`${file}\t${size} bytes\n`);
  const budget = budgets.get(file);
  if (budget !== undefined && size > budget) process.stderr.write(`Warning: ${file} exceeds the soft size budget (${budget} bytes).\n`);
}
