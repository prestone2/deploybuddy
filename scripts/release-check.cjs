const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'deploybuddy-release-check-'));

function run(command, args, cwd = root, expected = [0], options = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024, shell: false, windowsHide: true, ...options });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (!expected.includes(result.status)) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}.`);
  return result;
}

const originalWorktree = run('git', ['status', '--porcelain'], root).stdout;
run(npm, ['run', 'validate:platform']);
run(process.execPath, [path.join(root, 'scripts/pack-artifacts.cjs')], root, [0], { env: { ...process.env, DEPLOYBUDDY_ARTIFACT_DIR: artifacts } });

const manifests = [
  ['packages/core/package.json', '@deploybuddy/core', '0.1.0'],
  ['packages/node-adapter/package.json', '@deploybuddy/node-adapter', '0.1.0'],
  ['apps/cli/package.json', 'deploybuddy', '0.1.0'],
  ['deploybuddy-extension/package.json', 'deploybuddy', '0.2.0'],
];
for (const [relative, name, version] of manifests) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  if (pkg.name !== name || pkg.version !== version || !pkg.license || !pkg.repository?.url) throw new Error(`Public metadata/version check failed for ${relative}.`);
}
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/deploybuddy.schema.json'), 'utf8'));
if (schema.properties?.version?.const !== 1 || !schema.properties?.release) throw new Error('The repository configuration schema is missing its v1 boundary or release rules.');
if (fs.readFileSync(path.join(root, 'schemas/deploybuddy.schema.json'), 'utf8') !== fs.readFileSync(path.join(root, 'deploybuddy-extension/schemas/deploybuddy.schema.json'), 'utf8')) throw new Error('The VS Code schema copy is out of sync with the canonical repository schema.');
const action = JSON.parse(fs.readFileSync(path.join(root, 'apps/github-action/package.json'), 'utf8'));
if (!/^0\./.test(action.version) || !fs.existsSync(path.join(root, 'apps/github-action/dist/index.js'))) throw new Error('GitHub Action version or runtime bundle is missing.');

const cliTarball = path.join(artifacts, 'deploybuddy-0.1.0.tgz');
if (!fs.existsSync(cliTarball)) throw new Error('CLI tarball was not produced.');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'deploybuddy-cli-install-'));
const globalPrefix = path.join(scratch, 'global');
const project = path.join(scratch, 'project');
fs.mkdirSync(project);
run(npm, ['install', '--global', '--prefix', globalPrefix, '--offline', path.join(artifacts, 'deploybuddy-core-0.1.0.tgz'), path.join(artifacts, 'deploybuddy-node-adapter-0.1.0.tgz'), cliTarball], root);
const binary = path.join(globalPrefix, 'bin', process.platform === 'win32' ? 'deploybuddy.cmd' : 'deploybuddy');
const cliEnv = { env: { ...process.env, XDG_CACHE_HOME: path.join(scratch, 'cache') } };
run(binary, ['--help'], project, [0], cliEnv);
run(binary, ['doctor'], project, [0], cliEnv);
run(binary, ['release'], project, [0], cliEnv);
const jsonCheck = run(binary, ['check', '--json'], project, [0, 1], cliEnv);
JSON.parse(jsonCheck.stdout);
process.stdout.write('Packed CLI global-install smoke test passed (help, doctor, check --json, release).\n');

const currentWorktree = run('git', ['status', '--porcelain'], root).stdout;
if (originalWorktree !== currentWorktree) throw new Error('Release validation mutated tracked/untracked repository state.');
process.stdout.write(originalWorktree.trim() ? 'Release worktree check: warning — pre-existing Git changes remain; release checks added none.\n' : 'Release worktree check: clean.\n');
process.stdout.write(`\nRelease check passed. Artifacts: ${artifacts}\n`);
