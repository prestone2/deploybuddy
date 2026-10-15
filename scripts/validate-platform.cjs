const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const checks = [
  ['Core', ['--prefix', 'packages/core', 'test']],
  ['Node adapter', ['--prefix', 'packages/node-adapter', 'test']],
  ['VS Code build', ['--prefix', 'deploybuddy-extension', 'run', 'compile']],
  ['CLI build', ['--prefix', 'apps/cli', 'run', 'build']],
  ['Action', ['--prefix', 'apps/github-action', 'test']],
  ['Website build', ['run', 'build']],
  ['Root lint', ['run', 'lint']],
  ['VS Code lint', ['--prefix', 'deploybuddy-extension', 'run', 'lint']],
  ['VS Code', ['--prefix', 'deploybuddy-extension', 'test']],
  ['CLI', ['--prefix', 'apps/cli', 'test']],
];

const totals = new Map();
for (const [label, args] of checks) {
  const command = npm;
  process.stdout.write(`\n> ${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, shell: false, windowsHide: true });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) { process.stderr.write(`${result.error.message}\n`); process.exit(result.status ?? 1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
  const found = [...`${result.stdout}\n${result.stderr}`.matchAll(/^(?:#|ℹ)\s*tests\s+(\d+)\s*$/gm)].map(match => Number(match[1]));
  if (found.length) totals.set(label, found.at(-1));
}

const actionDirectory = path.join(root, 'apps/github-action');
const actionBundle = path.join(actionDirectory, 'dist/index.js');
const bundleStat = fs.statSync(actionBundle);
if (bundleStat.size > 1024 * 1024 || bundleStat.size < 50 * 1024) throw new Error(`GitHub Action bundle has an unexpected size: ${bundleStat.size} bytes.`);
const bundleSource = fs.readFileSync(actionBundle, 'utf8');
if (!bundleSource.includes('deploybuddy-report') || !bundleSource.includes('Observed risk is low') || !bundleSource.includes('Release Readiness')) throw new Error('GitHub Action bundle is missing readiness, PR reporting, or confidence messaging.');
const manualWorkflow = fs.readFileSync(path.join(root, '.github/workflows/deploybuddy-manual.yml'), 'utf8');
if (!manualWorkflow.includes('workflow_dispatch') || !manualWorkflow.includes('contents: read') || manualWorkflow.includes('pull-requests: write')) throw new Error('The manual DeployBuddy workflow must remain manual and read-only.');
process.stdout.write(`GitHub Action bundle sanity OK (${Math.round(bundleStat.size / 1024)} KB).\n`);

const cliEntry = path.join(root, 'apps/cli/dist/cli.js');
function cli(cwd, args) {
  const result = spawnSync(process.execPath, [cliEntry, ...args], { cwd, encoding: 'utf8', shell: false, windowsHide: true });
  if (result.error) throw result.error;
  return result;
}
const nodeProject = cli(root, ['framework']);
if (nodeProject.status !== 0 || !nodeProject.stdout.includes('Vite')) throw new Error('CLI framework smoke test failed in the existing Node/Vite project.');
const nodeJson = cli(root, ['check', '--json']);
if (![0, 1].includes(nodeJson.status)) throw new Error('CLI check smoke test failed in the existing Node/Vite project.');
JSON.parse(nodeJson.stdout);
const readinessJson = cli(root, ['readiness', '--json']);
if (![0, 1].includes(readinessJson.status)) throw new Error('CLI readiness smoke test failed in the existing Node/Vite project.');
if (!['ready', 'needs_attention', 'blocked', 'insufficient_evidence'].includes(JSON.parse(readinessJson.stdout).status)) throw new Error('CLI readiness smoke test returned an invalid status.');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'deploybuddy-platform-'));
try {
  const laravel = path.join(scratch, 'laravel'); fs.mkdirSync(laravel);
  fs.writeFileSync(path.join(laravel, 'composer.json'), JSON.stringify({ require: { 'laravel/framework': '^12' } }));
  fs.writeFileSync(path.join(laravel, 'artisan'), '');
  const laravelResult = cli(laravel, ['framework']);
  if (laravelResult.status !== 0 || !laravelResult.stdout.includes('Laravel')) throw new Error('CLI Laravel smoke test failed.');
  const empty = path.join(scratch, 'empty'); fs.mkdirSync(empty);
  const emptyResult = cli(empty, ['check', '--json']);
  if (![0, 1].includes(emptyResult.status)) throw new Error('CLI empty-directory smoke test failed.');
  if (JSON.parse(emptyResult.stdout).git.available !== false) throw new Error('CLI empty-directory Git state is not gracefully handled.');
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }
const testTotal = [...totals.values()].reduce((sum, value) => sum + value, 0);
process.stdout.write('\nDeployBuddy platform validation passed.\n');
for (const [label, total] of totals) process.stdout.write(`${label} tests: ${total}\n`);
process.stdout.write(`Total automated tests: ${testTotal}\n`);
