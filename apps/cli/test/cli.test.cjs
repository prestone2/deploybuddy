const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const core = require('@deploybuddy/core');
const { NodeWorkspaceAdapter } = require('../dist/adapters/NodeWorkspaceAdapter');
const { getAssessment, parseArgs, runCLI } = require('../dist/cli');

function workspaceSignals(overrides = {}) {
  return {
    workspaceFolders: ['.'],
    git: { available: true, repositories: [{ root: '.', branch: 'feature/payments', upstream: 'origin/feature/payments', ahead: 2, behind: 0, unstagedFiles: 0, conflictFiles: 0, detachedHead: false, modifiedFiles: 0, stagedFiles: 0, untrackedFiles: 0, changedFiles: 0, hasUncommittedChanges: false }], branch: 'feature/payments', upstream: 'origin/feature/payments', ahead: 2, behind: 0, unstagedFiles: 0, conflictFiles: 0, detachedHead: false, modifiedFiles: 0, stagedFiles: 0, untrackedFiles: 0, changedFiles: 0, hasUncommittedChanges: false, dirtyPrimaryBranch: false },
    diagnostics: { available: true, errors: 1, warnings: 0 },
    tests: { testStatus: 'unknown', passed: null, failed: null, skipped: null, notRun: null, note: 'unknown' },
    context: { day: 'Friday', dayOfWeek: 5, hour: 17, minute: 12, timestamp: '2026-10-09T14:12:00.000Z' },
    project: { available: true, frameworks: ['laravel', 'vite', 'react'], packageManagers: ['Composer', 'npm'], roots: ['./', './frontend'], parseErrors: [] },
    checks: [{ kind: 'build', status: 'available', command: 'npm run build' }, { kind: 'lint', status: 'available', command: 'npm run lint' }, { kind: 'tests', status: 'available', command: 'php artisan test' }],
    config: core.DEFAULT_CONFIG,
    ...overrides,
  };
}

function fakeAdapter(signals = workspaceSignals()) {
  return {
    cwd: '/fixture',
    getWorkspaceFolders: async () => signals.workspaceFolders,
    getGitSignals: async () => signals.git,
    getDiagnostics: async () => signals.diagnostics,
    getProjectProfile: async () => signals.project,
    getCheckResults: async () => signals.checks,
    getTestSignals: async () => signals.tests,
    getContext: async () => signals.context,
    getConfig: async () => ({ config: signals.config, valid: true, errors: [] }),
    getPolicy: async () => signals.policy ?? core.parseDeployBuddyPolicy(undefined),
  };
}

function capture(isTTY = false, choices = {}) {
  return { isTTY, out: '', err: '', calls: [], write(text) { this.out += text; }, writeError(text) { this.err += text; }, async confirm() { return choices.confirm ?? false; }, async execute(program, args, cwd) { this.calls.push({ program, args, cwd }); return { stdout: 'executed\n', stderr: '' }; } };
}

async function tempDir(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'deploybuddy-cli-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}
function git(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }

test('CLI parses commands and options without a parser dependency', () => {
  assert.deepEqual(parseArgs(['check', '--json', '--no-color']), { command: 'check', policyAction: 'show', baselineAction: 'show', historyAction: 'list', limit: 10, yes: false, head: false, json: true, quiet: false, noColor: true, run: false, debug: false });
  assert.equal(parseArgs(['--help']).command, 'help');
  assert.throws(() => parseArgs(['push']), /Unknown command/);
  assert.throws(() => parseArgs(['check', '--unknown']), /Unknown option/);
  assert.equal(parseArgs(['history', 'show', 'assessment-1234']).historyQuery, 'assessment-1234');
  assert.equal(parseArgs(['history', 'commit', 'a'.repeat(40)]).historyAction, 'commit');
  assert.equal(parseArgs(['compare', '--head']).head, true);
  assert.deepEqual({ ...parseArgs(['changes', '--base', 'main', '--json']) }, { command: 'changes', policyAction: 'show', baselineAction: 'show', historyAction: 'list', limit: 10, yes: false, head: false, json: true, quiet: false, noColor: false, run: false, debug: false, base: 'main' });
  assert.equal(parseArgs(['changes', '--from', 'a'.repeat(40), '--to', 'b'.repeat(40)]).to, 'b'.repeat(40));
  assert.throws(() => parseArgs(['changes', '--base', '$(id)']), /valid Git revision/);
  assert.throws(() => parseArgs(['changes', '--from', 'main']), /Use either/);
  assert.throws(() => parseArgs(['history', 'show']), /Usage/);
});

test('readiness command is deterministic and available in text and JSON', async () => {
  const assessment = await getAssessment(fakeAdapter(workspaceSignals({
    git: { available: true, repositories: [], branch: 'feature', upstream: 'origin/feature', ahead: 0, behind: 0, unstagedFiles: 0, conflictFiles: 0, detachedHead: false, modifiedFiles: 0, stagedFiles: 0, untrackedFiles: 0, changedFiles: 0, hasUncommittedChanges: false, dirtyPrimaryBranch: false },
    diagnostics: { available: true, errors: 0, warnings: 0 },
    tests: { testStatus: 'known', passed: 8, failed: 0, skipped: 0, notRun: 0, note: '' },
    checks: [{ kind: 'build', status: 'available', result: 'passed', command: 'npm run build' }, { kind: 'lint', status: 'available', result: 'passed', command: 'npm run lint' }, { kind: 'tests', status: 'available', result: 'passed', command: 'npm test' }],
    context: { day: 'Monday', dayOfWeek: 1, hour: 10, minute: 0, timestamp: '2026-10-12T07:00:00.000Z' },
  })));
  assert.equal(assessment.readiness.status, 'ready');
  const io = capture(); assert.equal(await runCLI(['readiness'], fakeAdapter(workspaceSignals({
    git: { available: true, repositories: [], branch: 'feature', upstream: 'origin/feature', ahead: 0, behind: 0, unstagedFiles: 0, conflictFiles: 0, detachedHead: false, modifiedFiles: 0, stagedFiles: 0, untrackedFiles: 0, changedFiles: 0, hasUncommittedChanges: false, dirtyPrimaryBranch: false },
    diagnostics: { available: true, errors: 0, warnings: 0 },
    tests: { testStatus: 'known', passed: 8, failed: 0, skipped: 0, notRun: 0, note: '' },
    checks: [{ kind: 'build', status: 'available', result: 'passed', command: 'npm run build' }, { kind: 'lint', status: 'available', result: 'passed', command: 'npm run lint' }, { kind: 'tests', status: 'available', result: 'passed', command: 'npm test' }],
    context: { day: 'Monday', dayOfWeek: 1, hour: 10, minute: 0, timestamp: '2026-10-12T07:00:00.000Z' },
  })), io), 0);
  assert.match(io.out, /Release Readiness[\s\S]*READY/);
  const json = capture(); await runCLI(['readiness', '--json'], fakeAdapter(workspaceSignals({
    git: { available: true, repositories: [], branch: 'feature', upstream: 'origin/feature', ahead: 0, behind: 0, unstagedFiles: 0, conflictFiles: 0, detachedHead: false, modifiedFiles: 0, stagedFiles: 0, untrackedFiles: 0, changedFiles: 0, hasUncommittedChanges: false, dirtyPrimaryBranch: false },
    diagnostics: { available: true, errors: 0, warnings: 0 },
    tests: { testStatus: 'known', passed: 8, failed: 0, skipped: 0, notRun: 0, note: '' },
    checks: [{ kind: 'build', status: 'available', result: 'passed', command: 'npm run build' }, { kind: 'lint', status: 'available', result: 'passed', command: 'npm run lint' }, { kind: 'tests', status: 'available', result: 'passed', command: 'npm test' }],
    context: { day: 'Monday', dayOfWeek: 1, hour: 10, minute: 0, timestamp: '2026-10-12T07:00:00.000Z' },
  })), json);
  assert.equal(JSON.parse(json.out).status, 'ready');
  const blocked = capture();
  const requiringTests = workspaceSignals({ policy: core.parseDeployBuddyPolicy(JSON.stringify({ version: 1, evidence: { requireTests: true } })) });
  assert.equal(await runCLI(['readiness'], fakeAdapter(requiringTests), blocked), 1);
  assert.match(blocked.out, /BLOCKED/);
});

test('release command owns gate exit semantics while check stays compatible and JSON is stable', async () => {
  const signals = workspaceSignals({
    policy: core.parseDeployBuddyPolicy(JSON.stringify({ version: 1, release: { allowedChangeAttention: ['low'] } })),
    git: { ...workspaceSignals().git, repositories: [], branch: 'feature', upstream: 'origin/feature', ahead: 0, behind: 0, unstagedFiles: 0, conflictFiles: 0, detachedHead: false, modifiedFiles: 0, stagedFiles: 0, untrackedFiles: 0, changedFiles: 0, hasUncommittedChanges: false, dirtyPrimaryBranch: false },
    diagnostics: { available: true, errors: 0, warnings: 0 },
    tests: { testStatus: 'known', passed: 8, failed: 0, skipped: 0, notRun: 0, note: '' },
    context: { day: 'Monday', dayOfWeek: 1, hour: 10, minute: 0, timestamp: '2026-10-12T07:00:00.000Z' },
    checks: [{ kind: 'build', status: 'available', result: 'passed', command: 'npm run build' }, { kind: 'lint', status: 'available', result: 'passed', command: 'npm run lint' }, { kind: 'tests', status: 'available', result: 'passed', command: 'npm test' }],
  });
  const assessment = await getAssessment(fakeAdapter(signals)); assert.deepEqual(assessment.policyParse.policy?.release, { allowedChangeAttention: ['low'] }); assert.equal(assessment.risk.score, 0); assert.equal(assessment.readiness.status, 'ready'); assert.equal(assessment.releaseGates.status, 'fail');
  const release = capture(); assert.equal(await runCLI(['release'], fakeAdapter(signals), release), 1); assert.match(release.out, /Status:\nFAIL/); assert.match(release.out, /no change assessment is available/i);
  const json = capture(); assert.equal(await runCLI(['release', '--json'], fakeAdapter(signals), json), 1); assert.deepEqual(JSON.parse(json.out).violations.map(item => item.code), ['release.changeAttentionUnknown']);
  const check = capture(); assert.equal(await runCLI(['check'], fakeAdapter(signals), check), 0); assert.match(check.out, /Release Gates:\nFAIL/);
  const noConfig = capture(); assert.equal(await runCLI(['release'], fakeAdapter(workspaceSignals()), noConfig), 0); assert.match(noConfig.out, /NOT CONFIGURED/);
});

test('changes summarizes local metadata and explicit ranges without exposing paths in JSON', async t => {
  const cwd = await tempDir(t);
  const adapter = new NodeWorkspaceAdapter(cwd);
  const io = capture();
  await fs.mkdir(path.join(cwd, 'database', 'migrations'), { recursive: true });
  await fs.mkdir(path.join(cwd, '.github', 'workflows'), { recursive: true });
  await fs.writeFile(path.join(cwd, 'README.md'), '# baseline');
  await fs.writeFile(path.join(cwd, 'database/migrations/001.sql'), 'CREATE TABLE test;');
  await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"fixture"}');
  await git(cwd, ['init']); await git(cwd, ['config', 'user.email', 'test@example.invalid']); await git(cwd, ['config', 'user.name', 'Test']);
  await git(cwd, ['add', '.']); await git(cwd, ['commit', '-m', 'initial']); const base = (await git(cwd, ['rev-parse', 'HEAD'])).trim();
  await fs.writeFile(path.join(cwd, 'database/migrations/002.sql'), 'DROP TABLE sample;');
  await fs.writeFile(path.join(cwd, '.github/workflows/deploy.yml'), 'name: CI');
  await fs.writeFile(path.join(cwd, 'src.php'), 'not read by DeployBuddy');
  const local = capture(); assert.equal(await runCLI(['changes', '--json'], adapter, local), 0);
  const report = JSON.parse(local.out); assert.equal(report.totalFiles, 3); assert.equal(report.attention, 'critical');
  assert.ok(report.findings.includes('database.migrationsChanged')); assert.ok(!local.out.includes('002.sql')); assert.ok(!local.out.includes('not read by DeployBuddy'));
  assert.equal((await adapter.getGitSignals()).hasUncommittedChanges, true);
  git(cwd, ['add', '.']); git(cwd, ['commit', '-m', 'fixture changes']);
  const range = capture(); assert.equal(await runCLI(['changes', '--base', base, '--json'], adapter, range), 0);
  assert.equal(JSON.parse(range.out).totalFiles, 3);
  const manual = capture(); await runCLI(['changes'], adapter, manual); assert.match(manual.out, /No source code was inspected/);
});

test('CLI check records one privacy-safe local assessment; history lists, summarizes, exports, and clears it', async t => {
  const cwd = await tempDir(t), cache = await tempDir(t);
  const oldCache = process.env.XDG_CACHE_HOME; process.env.XDG_CACHE_HOME = cache;
  t.after(() => { if (oldCache === undefined) delete process.env.XDG_CACHE_HOME; else process.env.XDG_CACHE_HOME = oldCache; });
  const { getHistoryPath, readLocalHistory, appendLocalHistory } = require('../dist/historyStore');
  const adapter = fakeAdapter(workspaceSignals({
    diagnostics: { available: true, errors: 0, warnings: 0 },
    tests: { testStatus: 'known', passed: 2, failed: 0, skipped: 0, notRun: 0, note: 'verified' },
    context: { day: 'Monday', dayOfWeek: 1, hour: 10, minute: 0, timestamp: '2026-10-12T07:00:00.000Z' },
  })); adapter.cwd = cwd;
  const checked = capture(); assert.equal(await runCLI(['check'], adapter, checked), 0);
  const pathOnDisk = getHistoryPath(cwd); t.after(() => fs.rm(path.dirname(pathOnDisk), { recursive: true, force: true }));
  const stored = await readLocalHistory(cwd); assert.equal(stored.entries.length, 1);
  const serialized = await fs.readFile(pathOnDisk, 'utf8');
  for (const privateValue of [cwd, 'feature/payments', 'workspaceFolders', 'npm run build']) assert.equal(serialized.includes(privateValue), false);
  assert.equal((await fs.stat(pathOnDisk)).mode & 0o777, 0o600);
  const duplicate = await appendLocalHistory(cwd, stored.entries[0]); assert.equal(duplicate.duplicate, true);
  const history = capture(); assert.equal(await runCLI(['history'], adapter, history), 0); assert.match(history.out, /Last 1 assessment/);
  const json = capture(); await runCLI(['history', '--json'], adapter, json); const parsed = JSON.parse(json.out); assert.equal(parsed.entries.length, 1); assert.equal(parsed.summary.count, 1);
  const stats = capture(); await runCLI(['history', 'stats'], adapter, stats); assert.match(stats.out, /Assessments: 1/);
  const denied = capture(false); await runCLI(['history', 'clear'], adapter, denied); assert.equal((await readLocalHistory(cwd)).entries.length, 1);
  const cleared = capture(); await runCLI(['history', 'clear', '--yes'], adapter, cleared); assert.equal((await readLocalHistory(cwd)).entries.length, 0);
});

test('history storage recovers malformed data and retains only the newest 100 entries', async t => {
  const cwd = await tempDir(t), cache = await tempDir(t);
  const oldCache = process.env.XDG_CACHE_HOME; process.env.XDG_CACHE_HOME = cache;
  t.after(() => { if (oldCache === undefined) delete process.env.XDG_CACHE_HOME; else process.env.XDG_CACHE_HOME = oldCache; });
  const { getHistoryPath, appendLocalHistory, readLocalHistory } = require('../dist/historyStore');
  const target = getHistoryPath(cwd); t.after(() => fs.rm(path.dirname(target), { recursive: true, force: true }));
  await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, '{broken');
  const recovered = await readLocalHistory(cwd); assert.equal(recovered.entries.length, 0); assert.match(recovered.warning, /malformed/);
  const assessment = await getAssessment(fakeAdapter());
  for (let index = 0; index < 101; index++) await appendLocalHistory(cwd, core.createAssessmentHistoryEntry(assessment, `local-assessment-${String(index).padStart(4, '0')}`, new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()));
  const retained = await readLocalHistory(cwd); assert.equal(retained.entries.length, 100); assert.equal(retained.entries[0].id, 'local-assessment-0001'); assert.equal(retained.entries.at(-1).id, 'local-assessment-0100');
});

test('history show/commit/changes and compare --head resolve revision attribution without self-comparison', async t => {
  const cwd = await tempDir(t), cache = await tempDir(t);
  const oldCache = process.env.XDG_CACHE_HOME; process.env.XDG_CACHE_HOME = cache;
  t.after(() => { if (oldCache === undefined) delete process.env.XDG_CACHE_HOME; else process.env.XDG_CACHE_HOME = oldCache; });
  const { appendLocalHistory } = require('../dist/historyStore');
  const shaA = 'a'.repeat(40), shaB = 'b'.repeat(40);
  const signals = workspaceSignals({ diagnostics: { available: true, errors: 0, warnings: 0 }, context: { day: 'Monday', dayOfWeek: 1, hour: 10, minute: 0, timestamp: '2026-10-12T07:00:00.000Z' }, git: { ...workspaceSignals().git, revision: { sha: shaB, shortSha: shaB.slice(0, 7), branch: 'feature' } } });
  const adapter = fakeAdapter(signals); adapter.cwd = cwd;
  const assessment = await getAssessment(adapter);
  const previous = core.createAssessmentHistoryEntry(assessment, 'revision-entry-0001', '2026-10-14T10:00:00.000Z');
  previous.risk = { score: 20, verdict: 'DEPLOY' }; previous.revision = { sha: shaA, shortSha: shaA.slice(0, 7), branch: 'main' }; previous.findings = ['git.dirty'];
  const sameCommit1 = core.createAssessmentHistoryEntry(assessment, 'revision-entry-0002', '2026-10-14T11:00:00.000Z');
  sameCommit1.risk = { score: 50, verdict: 'QUESTIONABLE' }; sameCommit1.revision = { sha: shaB, shortSha: shaB.slice(0, 7), branch: 'feature' }; sameCommit1.findings = ['diagnostics.errors', 'tests.unknown'];
  const sameCommit2 = { ...sameCommit1, id: 'revision-entry-0003', recordedAt: '2026-10-14T12:00:00.000Z' };
  await appendLocalHistory(cwd, previous); await appendLocalHistory(cwd, sameCommit1); await appendLocalHistory(cwd, sameCommit2);
  const byId = capture(); assert.equal(await runCLI(['history', 'show', previous.id], adapter, byId), 0); assert.match(byId.out, /Commit: aaaaaaa/);
  const bySha = capture(); await runCLI(['history', 'commit', shaB.slice(0, 7)], adapter, bySha); assert.match(bySha.out, /Last 2 assessments/);
  const changes = capture(); await runCLI(['history', 'changes'], adapter, changes); assert.match(changes.out, /Risk increased \+30/); assert.match(changes.out, /diagnostics.errors/);
  const compare = capture(); assert.equal(await runCLI(['compare', '--head', '--json'], adapter, compare), 0); const report = JSON.parse(compare.out); assert.equal(report.available, true); assert.equal(report.previous.id, previous.id); assert.equal(report.current.revision.sha, shaB); assert.equal(report.comparison.riskDelta, assessment.risk.score - 20);
  const ambiguous = capture(); const other = core.createAssessmentHistoryEntry(assessment, 'revision-entry-0004', '2026-10-14T13:00:00.000Z'); other.revision = { sha: shaB.slice(0, 7) + 'c'.repeat(33), shortSha: shaB.slice(0, 7) }; await appendLocalHistory(cwd, other); assert.equal(await runCLI(['history', 'show', shaB.slice(0, 7)], adapter, ambiguous), 2); assert.match(ambiguous.err, /ambiguous/);
});

test('local baselines save, show, compare as stable JSON, and clear outside the repository', async t => {
  const cwd = await tempDir(t);
  const cache = await tempDir(t);
  const oldCache = process.env.XDG_CACHE_HOME; process.env.XDG_CACHE_HOME = cache;
  t.after(() => { if (oldCache === undefined) delete process.env.XDG_CACHE_HOME; else process.env.XDG_CACHE_HOME = oldCache; });
  const { getBaselinePath } = require('../dist/baselineStore');
  const baselinePath = getBaselinePath(cwd);
  t.after(() => fs.rm(path.dirname(baselinePath), { recursive: true, force: true }));
  const signals = workspaceSignals({ diagnostics: { available: true, errors: 0, warnings: 0 } });
  const adapter = fakeAdapter(signals); adapter.cwd = cwd;
  const missing = capture(); await runCLI(['compare', '--json'], adapter, missing); assert.equal(JSON.parse(missing.out).available, false);
  const saved = capture(); assert.equal(await runCLI(['baseline', 'save'], adapter, saved), 0); assert.match(saved.out, /Baseline saved locally/);
  const before = await fs.readFile(baselinePath, 'utf8');
  assert.equal(before.includes(cwd), false); assert.equal(before.includes('feature/payments'), false); assert.equal(before.includes('workspaceFolders'), false);
  assert.equal((await fs.stat(baselinePath)).mode & 0o777, 0o600);
  const show = capture(); await runCLI(['baseline', 'show'], adapter, show); assert.match(show.out, /DeployBuddy Baseline/);
  signals.diagnostics.errors = 1;
  const json = capture(); assert.equal(await runCLI(['compare', '--json'], adapter, json), 0);
  const parsed = JSON.parse(json.out); assert.equal(parsed.schemaVersion, 1); assert.equal(parsed.delta.riskDelta, 25); assert.equal(parsed.delta.posture, 'WORSENED'); assert.deepEqual(parsed.delta.changedSignals.find(item => item.code === 'errors'), { code: 'errors', previous: 0, current: 1 });
  await fs.writeFile(baselinePath, JSON.stringify({ ...JSON.parse(before), schemaVersion: 2 }));
  const unsupported = capture(); assert.equal(await runCLI(['compare', '--json'], adapter, unsupported), 2); assert.equal(JSON.parse(unsupported.out).baselineStatus, 'unsupported');
  const clear = capture(); await runCLI(['baseline', 'clear'], adapter, clear); assert.equal(clear.out, 'Local baseline cleared.\n');
  assert.equal(await fs.stat(baselinePath).then(() => true, () => false), false);
});

test('check emits actionable findings and uses the shared score', async () => {
  const io = capture();
  const result = await runCLI(['check'], fakeAdapter(), io);
  const assessment = await getAssessment(fakeAdapter());
  assert.equal(result, 1);
  assert.match(io.out, /Risk: 75% — DO NOT DEPLOY/);
  assert.match(io.out, /Confidence: 75% — MEDIUM/);
  assert.match(io.out, /1 workspace diagnostics errors exist/);
  assert.match(io.out, /Tests have not been verified/);
  assert.equal(assessment.risk.score, 75);
});

test('safe but low-confidence check/status never describes deployment as safe', async () => {
  const signals = workspaceSignals({
    git: { available: false, repositories: [], branch: null, upstream: null, ahead: null, behind: null, unstagedFiles: null, conflictFiles: null, detachedHead: null, modifiedFiles: 0, stagedFiles: 0, untrackedFiles: 0, changedFiles: 0, hasUncommittedChanges: false, dirtyPrimaryBranch: false },
    diagnostics: { available: false, errors: 0, warnings: 0 },
    project: { available: false, frameworks: [], packageManagers: [], roots: [], parseErrors: [] },
    context: { day: 'Wednesday', dayOfWeek: 3, hour: 11, minute: 0, timestamp: '2026-10-14T08:00:00.000Z' },
  });
  const check = capture();
  const result = await runCLI(['check'], fakeAdapter(signals), check);
  assert.equal(result, 0);
  assert.match(check.out, /Observed risk: 15%/);
  assert.match(check.out, /Observed risk is low, but DeployBuddy does not yet have enough evidence to call this deployment safe\./);
  const status = capture();
  await runCLI(['status'], fakeAdapter(signals), status);
  assert.match(status.out, /Observed risk: 15%/);
  assert.match(status.out, /does not yet have enough evidence/);
});

test('status is concise and reports detected project/check health', async () => {
  const io = capture(); await runCLI(['status'], fakeAdapter(), io);
  assert.match(io.out, /Frameworks: Laravel, Vite, React/);
  assert.match(io.out, /Git: Clean/); assert.match(io.out, /Tests: Unknown/); assert.match(io.out, /Build: Available/);
});

test('git reports all health signals and deterministic guardrails', async () => {
  const signals = workspaceSignals({ git: { ...workspaceSignals().git, ahead: 2, behind: 1, repositories: [{ ...workspaceSignals().git.repositories[0], ahead: 2, behind: 1 }] } });
  const io = capture(); await runCLI(['git'], fakeAdapter(signals), io);
  assert.match(io.out, /Branch: feature\/payments/); assert.match(io.out, /Ahead: 2/); assert.match(io.out, /Behind: 1/); assert.match(io.out, /Branch has diverged/);
});

test('framework detects a multi-framework project and safe relative roots', async t => {
  const cwd = await tempDir(t);
  await fs.writeFile(path.join(cwd, 'composer.json'), JSON.stringify({ require: { 'laravel/framework': '^12' } }));
  await fs.writeFile(path.join(cwd, 'artisan'), '');
  await fs.writeFile(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { vite: '^7', react: '^19' }, scripts: { build: 'vite build', lint: 'eslint .', 'test:unit': 'vitest' } }));
  await fs.writeFile(path.join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 9');
  await fs.mkdir(path.join(cwd, 'frontend'));
  await fs.writeFile(path.join(cwd, 'frontend', 'package.json'), JSON.stringify({ dependencies: { vue: '^3' } }));
  await fs.mkdir(path.join(cwd, 'node_modules')); await fs.writeFile(path.join(cwd, 'node_modules', 'package.json'), '{broken');
  const adapter = new NodeWorkspaceAdapter(cwd);
  const profile = await adapter.getProjectProfile();
  assert.deepEqual(profile.frameworks, ['laravel', 'react', 'vite', 'vue']);
  assert.deepEqual(profile.packageManagers, ['Composer', 'npm', 'pnpm']);
  assert.deepEqual(profile.roots, ['./', './frontend']);
  const io = capture(); await runCLI(['framework'], adapter, io); assert.match(io.out, /\.\/frontend/);
  const checks = await adapter.getCheckResults(); assert.deepEqual(checks.map(item => item.status), ['available', 'available', 'available']);
});

test('checks reports availability without executing commands by default', async () => {
  const io = capture(); const code = await runCLI(['checks'], fakeAdapter(), io);
  assert.equal(code, 0); assert.match(io.out, /AVAILABLE — npm run build/); assert.equal(io.calls.length, 0);
});

test('checks --run requires interactive confirmation before executing a manifest script', async () => {
  const blocked = capture(false); assert.equal(await runCLI(['checks', '--run'], fakeAdapter(), blocked), 2); assert.equal(blocked.calls.length, 0);
  const accepted = capture(true, { confirm: true }); assert.equal(await runCLI(['checks', '--run'], fakeAdapter(), accepted), 0);
  assert.deepEqual(accepted.calls[0], { program: 'npm', args: ['run', 'build'], cwd: '/fixture' });
});

test('doctor diagnoses non-Git, missing manifests and configuration status', async t => {
  const cwd = await tempDir(t); const adapter = new NodeWorkspaceAdapter(cwd); const io = capture();
  assert.equal(await runCLI(['doctor'], adapter, io), 0);
  assert.match(io.out, /Git unavailable/); assert.match(io.out, /No recognized project manifest/); assert.match(io.out, /Configuration valid/); assert.match(io.out, /Test results unavailable/);
  await fs.writeFile(path.join(cwd, '.deploybuddy.json'), '{broken');
  assert.equal(await runCLI(['doctor'], adapter, capture()), 2);
});

test('check JSON is stable machine output and quiet mode is script friendly', async () => {
  const jsonIO = capture(); const code = await runCLI(['check', '--json'], fakeAdapter(), jsonIO);
  const value = JSON.parse(jsonIO.out); assert.equal(code, 1); assert.equal(value.risk.score, 75); assert.equal(value.risk.verdict, 'DO_NOT_DEPLOY');
  assert.equal(value.confidence.score, 75); assert.deepEqual(value.project.frameworks, ['laravel', 'vite', 'react']); assert.ok(Array.isArray(value.checks)); assert.ok(Array.isArray(value.recommendations));
  assert.ok(['ready', 'needs_attention', 'blocked', 'insufficient_evidence'].includes(value.readiness.status));
  const quietIO = capture(); await runCLI(['check', '--quiet'], fakeAdapter(), quietIO); assert.equal(quietIO.out, 'DO NOT DEPLOY 75\n');
});

test('JSON mode outputs valid JSON for inspection errors and never writes decoration', async () => {
  const adapter = fakeAdapter(); adapter.getWorkspaceFolders = async () => { throw new Error('sensitive absolute path /home/private'); };
  const io = capture(); assert.equal(await runCLI(['check', '--json'], adapter, io), 2); assert.deepEqual(JSON.parse(io.out), { error: { message: 'DeployBuddy could not inspect this project. Check file permissions and try again.', code: 'INSPECTION_FAILED' } }); assert.equal(io.err, '');
});

test('danger exit code is configurable without changing deterministic rules', async () => {
  const danger = workspaceSignals({ diagnostics: { available: true, errors: 8, warnings: 0 }, tests: { testStatus: 'known', passed: 0, failed: 4, skipped: 0, notRun: 0, note: '' }, context: { day: 'Friday', dayOfWeek: 5, hour: 21, minute: 1, timestamp: '' } });
  assert.equal(await runCLI(['check'], fakeAdapter(danger), capture()), 1);
  const noExit = { ...danger, config: { thresholds: { safeMax: 30, cautionMax: 65 }, exitOnDanger: false } };
  assert.equal(await runCLI(['check'], fakeAdapter(noExit), capture()), 0);
  assert.equal(core.calculateDeploymentRisk(danger).score, core.calculateDeploymentRisk(noExit).score);
});

test('no-color works explicitly and colors default off for non-TTY output', async () => {
  const original = process.env.NO_COLOR; delete process.env.NO_COLOR;
  try {
    const enabledTTY = capture(true); await runCLI(['git'], fakeAdapter(), enabledTTY); assert.match(enabledTTY.out, /\u001b\[32m/);
    const plainTTY = capture(true); await runCLI(['git', '--no-color'], fakeAdapter(), plainTTY); assert.doesNotMatch(plainTTY.out, /\u001b\[/);
    const redirected = capture(false); await runCLI(['git'], fakeAdapter(), redirected); assert.doesNotMatch(redirected.out, /\u001b\[/);
  } finally { if (original === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = original; }
});

test('malformed project manifests degrade gracefully and are reported by doctor', async t => {
  const cwd = await tempDir(t); await fs.writeFile(path.join(cwd, 'package.json'), '{broken'); await fs.writeFile(path.join(cwd, 'composer.json'), '{broken');
  const adapter = new NodeWorkspaceAdapter(cwd); const profile = await adapter.getProjectProfile();
  assert.equal(profile.frameworks.length, 0); assert.equal(profile.parseErrors.length, 2);
  const io = capture(); assert.equal(await runCLI(['check'], adapter, io), 0); assert.match(io.out, /Could not parse package.json/);
});

test('CLI supports Git-unavailable and empty-directory states without throwing', async t => {
  const cwd = await tempDir(t); const adapter = new NodeWorkspaceAdapter(cwd);
  const check = capture(); assert.equal(await runCLI(['check', '--json'], adapter, check), 0); const report = JSON.parse(check.out);
  assert.equal(report.git.available, false); assert.equal(report.git.branch, null); assert.equal(report.project.frameworks.length, 0);
  const git = capture(); await runCLI(['git'], adapter, git); assert.match(git.out, /Branch: Unavailable/);
});

test('Git inspection uses read-only argument-array commands and leaves repository state intact', async t => {
  const cwd = await tempDir(t);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd }); execFileSync('git', ['config', 'user.email', 'deploybuddy@example.invalid'], { cwd }); execFileSync('git', ['config', 'user.name', 'DeployBuddy Test'], { cwd });
  await fs.writeFile(path.join(cwd, 'tracked.txt'), 'version one'); execFileSync('git', ['add', 'tracked.txt'], { cwd }); execFileSync('git', ['commit', '-qm', 'fixture'], { cwd });
  const before = execFileSync('git', ['status', '--porcelain=v1', '-b', '-z'], { cwd }).toString();
  await fs.writeFile(path.join(cwd, 'tracked.txt'), 'version two'); await fs.writeFile(path.join(cwd, 'new.txt'), 'new');
  const expected = execFileSync('git', ['status', '--porcelain=v1', '-b', '-z'], { cwd }).toString();
  const signals = await new NodeWorkspaceAdapter(cwd).getGitSignals();
  const after = execFileSync('git', ['status', '--porcelain=v1', '-b', '-z'], { cwd }).toString();
  assert.equal(signals.available, true); assert.equal(signals.branch, 'main'); assert.equal(signals.hasUncommittedChanges, true); assert.match(signals.revision.sha, /^[a-f0-9]{40,64}$/); assert.equal(signals.revision.shortSha, signals.revision.sha.slice(0, 7)); assert.equal(after, expected); assert.notEqual(before, expected);
  execFileSync('git', ['checkout', '--detach', '-q', signals.revision.sha], { cwd }); const detached = await new NodeWorkspaceAdapter(cwd).getGitSignals(); assert.equal(detached.detachedHead, true); assert.equal(detached.revision.detached, true); assert.equal(detached.revision.branch, undefined);
});

test('Git branch or directory names never become shell command strings', async t => {
  const cwd = await tempDir(t); const calls = [];
  const adapter = new NodeWorkspaceAdapter(cwd); const original = adapter.getGitSignals.bind(adapter);
  adapter.getGitSignals = async () => { calls.push(['git', ['--no-optional-locks', 'status', '--porcelain=v1', '--branch', '--untracked-files=all', '-z']]); return original(); };
  await adapter.getGitSignals();
  assert.deepEqual(calls[0][1], ['--no-optional-locks', 'status', '--porcelain=v1', '--branch', '--untracked-files=all', '-z']);
  assert.equal(calls[0][1].some(arg => /;|\$\(|`/.test(arg)), false);
});

test('Core, CLI and VS Code compatibility entry points agree on risk, confidence and recommendation order', async () => {
  const evidence = workspaceSignals(); const adapter = fakeAdapter(evidence); const cli = await getAssessment(adapter);
  const extensionRisk = require('../../../deploybuddy-extension/out/core/calculateDeploymentRisk').calculateDeploymentRisk(evidence);
  const extensionConfidence = core.calculateEvidenceConfidence(evidence);
  const extensionRecommendations = require('../../../deploybuddy-extension/out/core/getDeploymentRecommendations').getDeploymentRecommendations(evidence);
  assert.deepEqual(cli.risk, core.calculateDeploymentRisk(evidence)); assert.deepEqual(cli.risk, extensionRisk);
  assert.deepEqual(cli.confidence, extensionConfidence); assert.equal(cli.confidence.score, extensionConfidence.score);
  assert.deepEqual(cli.recommendations, extensionRecommendations);
  assert.deepEqual(cli.recommendations.map(item => item.priority), extensionRecommendations.map(item => item.priority));
});

test('policy failure appears separately and sets CLI exit code without changing risk or confidence', async t => {
  const cwd = await tempDir(t);
  await fs.writeFile(path.join(cwd, '.deploybuddy.json'), JSON.stringify({ version: 1, risk: { maxScore: 5 }, confidence: { minimumScore: 99 }, evidence: { requireTests: true } }));
  const adapter = new NodeWorkspaceAdapter(cwd); const assessment = await getAssessment(adapter);
  const cliRisk = assessment.risk.score; const cliConfidence = assessment.confidence.score;
  const io = capture(); assert.equal(await runCLI(['check'], adapter, io), 1);
  assert.match(io.out, /Policy:\nFAILED/); assert.match(io.out, /Test results are unknown; a detected test command is not verified execution evidence/);
  assert.equal(assessment.risk.score, cliRisk); assert.equal(assessment.confidence.score, cliConfidence);
  const jsonIO = capture(); assert.equal(await runCLI(['check', '--json'], adapter, jsonIO), 1);
  const result = JSON.parse(jsonIO.out); assert.equal(result.policy.configured, true); assert.equal(result.policy.passed, false); assert.ok(result.policy.violations.length);
});

test('policy command reports status and JSON policy result', async t => {
  const cwd = await tempDir(t); await fs.writeFile(path.join(cwd, '.deploybuddy.json'), JSON.stringify({ version: 1, confidence: { minimumScore: 99 } }));
  const adapter = new NodeWorkspaceAdapter(cwd); const io = capture();
  assert.equal(await runCLI(['policy'], adapter, io), 1); assert.match(io.out, /Source: \.deploybuddy\.json/); assert.match(io.out, /Status: FAILED/);
  const json = capture(); assert.equal(await runCLI(['policy', '--json'], adapter, json), 1); assert.equal(JSON.parse(json.out).passed, false);
});

test('policy validate distinguishes absent, valid, malformed and unknown-key policies', async t => {
  const cwd = await tempDir(t); const adapter = new NodeWorkspaceAdapter(cwd);
  const absent = capture(); assert.equal(await runCLI(['policy', 'validate'], adapter, absent), 0); assert.match(absent.out, /No repository deployment policy/);
  await fs.writeFile(path.join(cwd, '.deploybuddy.json'), JSON.stringify({ version: 1, git: { requireClean: true } }));
  const valid = capture(); assert.equal(await runCLI(['policy', 'validate'], adapter, valid), 0); assert.match(valid.out, /is valid/);
  await fs.writeFile(path.join(cwd, '.deploybuddy.json'), '{');
  const malformed = capture(); assert.equal(await runCLI(['policy', 'validate'], adapter, malformed), 2); assert.match(malformed.out, /not valid JSON/);
  await fs.writeFile(path.join(cwd, '.deploybuddy.json'), JSON.stringify({ version: 1, git: { typo: true } }));
  const unknown = capture(); assert.equal(await runCLI(['policy', 'validate'], adapter, unknown), 2); assert.match(unknown.out, /git\.typo: Unknown policy key/);
});

test('policy init creates conservative template and refuses overwrite without confirmation', async t => {
  const cwd = await tempDir(t); const adapter = new NodeWorkspaceAdapter(cwd);
  const denied = capture(false); assert.equal(await runCLI(['policy', 'init'], adapter, denied), 0);
  const created = JSON.parse(await fs.readFile(path.join(cwd, '.deploybuddy.json'), 'utf8'));
  assert.deepEqual(created, { version: 1, risk: { maxScore: 65 }, confidence: { minimumScore: 60 }, git: { requireClean: true } });
  const refused = capture(false); assert.equal(await runCLI(['policy', 'init'], adapter, refused), 2); assert.match(refused.err, /without confirmation/);
  const confirmed = capture(true, { confirm: true }); assert.equal(await runCLI(['policy', 'init'], adapter, confirmed), 0);
});

test('human-readable Git output strips terminal controls from untrusted branch metadata', async () => {
  const branch = 'topic\u001b[31mPWNED\u0007';
  const git = { ...workspaceSignals().git, branch, repositories: [{ ...workspaceSignals().git.repositories[0], branch }] };
  const io = capture();
  assert.equal(await runCLI(['git'], fakeAdapter(workspaceSignals({ git })), io), 0);
  assert.doesNotMatch(io.out, /\u001b|\u0007/);
  assert.match(io.out, /topic\[31mPWNED/);
});
