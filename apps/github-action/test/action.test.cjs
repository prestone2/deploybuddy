const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const entry = path.resolve(__dirname, '../dist/index.js');

async function fixture(t, name = 'project') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'deploybuddy-action-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, name);
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({ name: 'action-fixture', devDependencies: { vite: '^8.0.0' }, scripts: { build: 'vite build', test: 'node --test' } }));
  await fs.writeFile(path.join(workspace, 'package-lock.json'), '{}');
  const output = path.join(root, 'outputs');
  const summary = path.join(root, 'summary.md');
  await fs.writeFile(output, '');
  await fs.writeFile(summary, '');
  return { root, workspace, output, summary };
}

function invoke(fixtureData, { threshold = '66', workingDirectory = path.basename(fixtureData.workspace), annotations = 'false', prComment = 'false', failOnReadiness = 'false', failOnReleaseGates = 'true', eventName = 'push', token = '', pullRequestMetadata } = {}) {
  const eventPath = path.join(fixtureData.root, 'event.json');
  if (pullRequestMetadata) require('node:fs').writeFileSync(eventPath, JSON.stringify({ pull_request: { head: { sha: pullRequestMetadata.headSha }, base: { sha: pullRequestMetadata.baseSha } } }));
  const result = spawnSync(process.execPath, [entry], {
    cwd: fixtureData.workspace,
    encoding: 'utf8',
    shell: false,
    env: {
      ...process.env,
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: eventName,
      ...(pullRequestMetadata ? { GITHUB_EVENT_PATH: eventPath } : {}),
      GITHUB_REPOSITORY: 'acme/service',
      GITHUB_WORKSPACE: fixtureData.root,
      GITHUB_OUTPUT: fixtureData.output,
      GITHUB_STEP_SUMMARY: fixtureData.summary,
      'INPUT_WORKING-DIRECTORY': workingDirectory,
      'INPUT_FAIL-ON-RISK': threshold,
      'INPUT_FAIL-ON-READINESS': failOnReadiness,
      'INPUT_FAIL-ON-RELEASE-GATES': failOnReleaseGates,
      'INPUT_CREATE-ANNOTATIONS': annotations,
      'INPUT_PR-COMMENT': prComment,
      'INPUT_GITHUB-TOKEN': token,
    },
  });
  return { ...result, outputText: read(fixtureData.output), summaryText: read(fixtureData.summary) };
}

function read(file) {
  try { return require('node:fs').readFileSync(file, 'utf8'); } catch { return ''; }
}

function outputValues(text) {
  const result = {};
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const match = /^([^<]+)<<(.+)$/.exec(lines[index] ?? '');
    if (!match) continue;
    const key = match[1]; const delimiter = match[2]; const content = [];
    while (++index < lines.length && lines[index] !== delimiter) content.push(lines[index]);
    result[key] = content.join('\n');
  }
  return result;
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
}

test('action manifest publishes a Node runtime, documented inputs, outputs and bundled entrypoint', async () => {
  const yaml = await fs.readFile(path.resolve(__dirname, '../action.yml'), 'utf8');
  assert.match(yaml, /using: node20/);
  assert.match(yaml, /main: dist\/index\.js/);
  assert.match(yaml, /default: 'false'/);
  for (const key of ['working-directory', 'fail-on-risk', 'fail-on-readiness', 'fail-on-release-gates', 'create-annotations', 'pr-comment', 'github-token']) assert.match(yaml, new RegExp(`^  ${key}:`, 'm'));
  for (const key of ['risk-score', 'risk-level', 'verdict', 'confidence-score', 'release-readiness', 'release-gates-status', 'release-gates-violations', 'commit-sha', 'commit-short-sha', 'pull-request-head-sha', 'pull-request-base-sha', 'assessment-json', 'comment-url']) assert.match(yaml, new RegExp(`^  ${key}:`, 'm'));
  await fs.access(entry);
});

test('action writes deterministic Core outputs and a readable job summary', async t => {
  const data = await fixture(t);
  git(data.workspace, ['init', '--initial-branch=main']);
  git(data.workspace, ['config', 'user.email', 'fixture@example.invalid']);
  git(data.workspace, ['config', 'user.name', 'DeployBuddy Fixture']);
  git(data.workspace, ['add', 'package.json', 'package-lock.json']);
  git(data.workspace, ['commit', '-m', 'fixture']);
  const result = invoke(data);
  assert.equal(result.status, 0, result.stderr);
  const values = outputValues(result.outputText);
  const assessment = JSON.parse(values['assessment-json']);
  assert.equal(values.verdict, assessment.risk.verdict);
  assert.equal(Number(values['risk-score']), assessment.risk.score);
  assert.equal(values['risk-level'], assessment.risk.level);
  assert.equal(values['confidence-level'], assessment.confidence.level);
  assert.equal(values['release-readiness'], assessment.readiness.status);
  assert.equal(values['release-gates-status'], 'not_configured');
  assert.deepEqual(JSON.parse(values['release-gates-violations']), []);
  assert.match(result.summaryText, /Release Readiness:/);
  assert.match(values['commit-sha'], /^[a-f0-9]{40,64}$/);
  assert.equal(values['commit-short-sha'], values['commit-sha'].slice(0, 7));
  assert.equal(assessment.revision.sha, values['commit-sha']);
  assert.ok(result.summaryText.includes(`Commit: \`${values['commit-short-sha']}\``));
  assert.match(result.summaryText, /### 🧩 Changed areas/);
  assert.ok(assessment.changes && !JSON.stringify(assessment.changes).includes('package.json'));
  assert.deepEqual(JSON.parse(values.frameworks), ['vite']);
  assert.equal(values['git-dirty'], 'false');
  assert.match(result.summaryText, /DeployBuddy/);
  assert.match(result.summaryText, /Confidence/);
  assert.match(result.summaryText, /Looking good/);
  assert.match(result.summaryText, /Test result unavailable/);
  assert.equal(outputValues(result.outputText)['comment-url'], '');
});

test('configured release gates fail by default and can be advisory without changing assessment outputs', async t => {
  const data = await fixture(t);
  await fs.writeFile(path.join(data.workspace, '.deploybuddy.json'), JSON.stringify({ version: 1, release: { maxRisk: 0 } }));
  const failed = invoke(data, { threshold: '' });
  assert.equal(failed.status, 1);
  const values = outputValues(failed.outputText), assessment = JSON.parse(values['assessment-json']);
  assert.equal(values['release-gates-status'], 'fail');
  assert.equal(assessment.releaseGates.status, 'fail');
  assert.equal(JSON.parse(values['release-gates-violations'])[0].code, 'release.maxRisk');
  assert.match(failed.summaryText, /### 🚦 Release Gates\n❌ FAILED/);
  const advisory = invoke(data, { threshold: '', failOnReleaseGates: 'false' });
  assert.equal(advisory.status, 0, advisory.stderr);
  assert.equal(outputValues(advisory.outputText)['release-gates-status'], 'fail');
});

test('fail-on-readiness is opt-in and rejects insufficient evidence without changing risk output', async t => {
  const data = await fixture(t);
  const result = invoke(data, { threshold: '', failOnReadiness: 'true' });
  assert.equal(result.status, 1);
  const values = outputValues(result.outputText);
  const assessment = JSON.parse(values['assessment-json']);
  assert.equal(values['release-readiness'], 'insufficient_evidence');
  assert.equal(assessment.readiness.status, 'insufficient_evidence');
  assert.equal(Number(values['risk-score']), assessment.risk.score);
  assert.match(result.summaryText, /Release Readiness:.*INSUFFICIENT EVIDENCE/);
});

test('GitHub context includes validated PR head/base SHAs but rejects malformed metadata', () => {
  const { getGitHubContext } = require('../lib/githubContext');
  const payload = { pull_request: { head: { sha: 'A'.repeat(40) }, base: { sha: 'b'.repeat(40) } } };
  const context = getGitHubContext({ GITHUB_EVENT_NAME: 'pull_request' }, payload);
  assert.deepEqual(context.pullRequestRevision, { headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40) });
  assert.equal(getGitHubContext({ GITHUB_EVENT_NAME: 'push' }, payload).pullRequestRevision, undefined);
  assert.equal(getGitHubContext({ GITHUB_EVENT_NAME: 'pull_request' }, { pull_request: { head: { sha: 'token' }, base: {} } }).pullRequestRevision, undefined);
});

test('pull request event revisions appear as context outputs and summary only', async t => {
  const data = await fixture(t);
  git(data.workspace, ['init', '--initial-branch=feature/test']); git(data.workspace, ['config', 'user.email', 'fixture@example.invalid']); git(data.workspace, ['config', 'user.name', 'DeployBuddy Fixture']);
  git(data.workspace, ['add', 'package.json', 'package-lock.json']); git(data.workspace, ['commit', '-m', 'fixture']);
  const headSha = 'c'.repeat(40), baseSha = 'd'.repeat(40);
  const result = invoke(data, { eventName: 'pull_request', pullRequestMetadata: { headSha, baseSha } });
  assert.equal(result.status, 0, result.stderr);
  const values = outputValues(result.outputText); const assessment = JSON.parse(values['assessment-json']);
  assert.equal(values['pull-request-head-sha'], headSha); assert.equal(values['pull-request-base-sha'], baseSha);
  assert.deepEqual(assessment.pullRequest, { headSha, baseSha });
  assert.match(result.summaryText, new RegExp(`Pull request head: \`${headSha}\``));
  assert.match(result.summaryText, new RegExp(`Pull request base: \`${baseSha}\``));
});

test('pr-comment enabled on push does not attempt API writes and leaves the URL empty', async t => {
  const data = await fixture(t);
  const result = invoke(data, { prComment: 'true', token: 'secret-token', eventName: 'push', threshold: '' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(outputValues(result.outputText)['comment-url'], '');
  assert.doesNotMatch(result.stdout + result.stderr, /secret-token|could not update the PR comment/);
});

test('configured threshold fails the step after writing results; empty threshold disables the gate', async t => {
  const data = await fixture(t);
  const failed = invoke(data, { threshold: '0' });
  assert.equal(failed.status, 1);
  assert.match(failed.outputText, /risk-score<</);
  const allowed = invoke(data, { threshold: '' });
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.match(allowed.outputText, /risk-score<</);
});

test('invalid threshold and workspace traversal fail with actionable workflow errors', async t => {
  const data = await fixture(t);
  const badThreshold = invoke(data, { threshold: '101' });
  assert.equal(badThreshold.status, 1);
  assert.equal(badThreshold.outputText, '');
  const outside = invoke(data, { workingDirectory: '../outside' });
  assert.equal(outside.status, 1);
  assert.equal(outside.outputText, '');
  const linkedDirectory = path.join(data.root, 'linked-outside');
  const outsideDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'deploybuddy-outside-'));
  t.after(() => fs.rm(outsideDirectory, { recursive: true, force: true }));
  await fs.symlink(outsideDirectory, linkedDirectory, 'dir');
  const symlink = invoke(data, { workingDirectory: 'linked-outside' });
  assert.equal(symlink.status, 1);
  assert.equal(symlink.outputText, '');
});

test('Git inspection handles shell metacharacters as a literal workspace path and leaves Git state unchanged', async t => {
  const data = await fixture(t, 'project; touch ACTION_INJECTION');
  git(data.workspace, ['init', '--initial-branch=main']);
  git(data.workspace, ['config', 'user.email', 'fixture@example.invalid']);
  git(data.workspace, ['config', 'user.name', 'DeployBuddy Fixture']);
  git(data.workspace, ['add', 'package.json', 'package-lock.json']);
  git(data.workspace, ['commit', '-m', 'fixture']);
  const before = spawnSync('git', ['status', '--porcelain=v1', '-b'], { cwd: data.workspace, encoding: 'utf8', shell: false }).stdout;
  const result = invoke(data, { workingDirectory: path.basename(data.workspace) });
  assert.equal(result.status, 0, result.stderr);
  const after = spawnSync('git', ['status', '--porcelain=v1', '-b'], { cwd: data.workspace, encoding: 'utf8', shell: false }).stdout;
  assert.equal(after, before);
  await assert.rejects(fs.access(path.join(data.root, 'ACTION_INJECTION')));
});

test('non-Git and malformed-project workspaces return assessment instead of crashing', async t => {
  const data = await fixture(t);
  await fs.writeFile(path.join(data.workspace, 'package.json'), '{broken');
  const result = invoke(data, { threshold: '' });
  assert.equal(result.status, 0, result.stderr);
  const assessment = JSON.parse(outputValues(result.outputText)['assessment-json']);
  assert.equal(assessment.git.available, false);
  assert.deepEqual(assessment.project.frameworks, []);
});

test('repository policy failure independently fails Action and is included in outputs and summary', async t => {
  const data = await fixture(t);
  await fs.writeFile(path.join(data.workspace, '.deploybuddy.json'), JSON.stringify({ version: 1, risk: { maxScore: 100 }, confidence: { minimumScore: 100 }, evidence: { requireTests: true } }));
  const result = invoke(data, { threshold: '' });
  assert.equal(result.status, 1);
  const values = outputValues(result.outputText);
  const assessment = JSON.parse(values['assessment-json']);
  assert.ok(assessment.risk.score < 66);
  assert.equal(assessment.policy.configured, true);
  assert.equal(assessment.policy.passed, false);
  assert.equal(assessment.policy.violations.length, 2);
  assert.match(result.summaryText, /📋 Policy/);
  assert.match(result.summaryText, /Failed — 2 violation/);
});
