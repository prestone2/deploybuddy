const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('@deploybuddy/core');
const { buildAssessmentSections, limitFindings, normalizePullRequestFiles, renderAssessmentMarkdown, renderPullRequestComment } = require('../lib/presentation/report');
const { upsertPullRequestComment, DEPLOYBUDDY_COMMENT_MARKER, COMMENT_PERMISSION_WARNING } = require('../lib/prComment');

function assessment(overrides = {}) {
  const signals = {
    workspaceFolders: ['.'],
    git: {
      available: true, repositories: [{ root: '.', branch: 'feature/payments', upstream: 'origin/feature/payments', ahead: 1, behind: 0, unstagedFiles: 0, conflictFiles: 0, detachedHead: false, modifiedFiles: 0, stagedFiles: 0, untrackedFiles: 0, changedFiles: 0, hasUncommittedChanges: false }],
      branch: 'feature/payments', upstream: 'origin/feature/payments', ahead: 1, behind: 0, unstagedFiles: 0, conflictFiles: 0, detachedHead: false, modifiedFiles: 0, stagedFiles: 0, untrackedFiles: 0, changedFiles: 0, hasUncommittedChanges: false, dirtyPrimaryBranch: false,
    },
    diagnostics: { available: true, errors: 0, warnings: 0 },
    tests: { testStatus: 'unknown', passed: null, failed: null, skipped: null, notRun: null, note: 'unknown' },
    context: { day: 'Wednesday', dayOfWeek: 3, hour: 11, minute: 0, timestamp: '2026-10-14T08:00:00.000Z' },
    project: { available: true, frameworks: ['react', 'vite'], packageManagers: ['npm'], roots: ['./'], parseErrors: [] },
    checks: [{ kind: 'build', status: 'available', command: 'npm run build' }, { kind: 'lint', status: 'unknown' }, { kind: 'tests', status: 'available', command: 'npm test' }],
    ...overrides,
  };
  const risk = core.calculateDeploymentRisk(signals);
  const confidence = core.calculateEvidenceConfidence(signals);
  const recommendations = core.getDeploymentRecommendations(signals);
  return buildAssessmentSections({ signals, risk, confidence, recommendations }, 'main');
}

function apiWith(comments = []) {
  return {
    comments: [...comments], created: [], updated: [],
    async list() { return this.comments; },
    async create(owner, repo, number, body) {
      const comment = { id: 45, body, html_url: `https://github.com/${owner}/${repo}/pull/${number}#issuecomment-45` };
      this.created.push(comment); this.comments.push(comment); return comment;
    },
    async update(owner, repo, id, body) {
      const found = this.comments.find(comment => comment.id === id);
      found.body = body; found.html_url = `https://github.com/${owner}/${repo}/pull/12#issuecomment-${id}`;
      this.updated.push(found); return found;
    },
  };
}

function context(eventName = 'pull_request', pullRequestNumber = 12) {
  return { eventName, repository: { owner: 'acme', repo: 'service' }, pullRequestNumber };
}

function call({ enabled = true, token = 'test-secret-token', event = context(), body = () => 'latest report', api = apiWith(), warnings = [] } = {}) {
  let factoryCalls = 0;
  return {
    api,
    warnings,
    run: upsertPullRequestComment({ enabled, token, context: event }, body, auth => {
      factoryCalls++;
      assert.equal(auth, token);
      return api;
    }, message => warnings.push(message)),
    factoryCalls: () => factoryCalls,
  };
}

test('PR commenting disabled makes no API client and returns an empty URL', async () => {
  const target = call({ enabled: false });
  assert.equal(await target.run, '');
  assert.equal(target.factoryCalls(), 0);
});

test('pull_request creates one marked comment and returns comment-url', async () => {
  const target = call({ body: previous => `${DEPLOYBUDDY_COMMENT_MARKER}\n${previous}report` });
  assert.equal(await target.run, 'https://github.com/acme/service/pull/12#issuecomment-45');
  assert.equal(target.api.created.length, 1);
  assert.match(target.api.created[0].body, /<!-- deploybuddy-report -->/);
});

test('an existing marked comment is updated while unrelated comments are ignored', async () => {
  const existing = { id: 9, body: 'unrelated DeployBuddy mention', html_url: 'https://github.com/acme/service/pull/12#issuecomment-9' };
  const owned = { id: 10, body: `${DEPLOYBUDDY_COMMENT_MARKER}\nold blocker`, html_url: 'https://github.com/acme/service/pull/12#issuecomment-10' };
  const api = apiWith([existing, owned]);
  const target = call({ api, body: previous => `${DEPLOYBUDDY_COMMENT_MARKER}\nnew report ${previous.includes('old blocker') ? 'updated' : 'missing'}` });
  assert.equal(await target.run, 'https://github.com/acme/service/pull/12#issuecomment-10');
  assert.equal(api.created.length, 0);
  assert.equal(api.updated.length, 1);
  assert.equal(api.updated[0].id, 10);
  assert.match(api.updated[0].body, /new report updated/);
});

test('marker matching is stable and repeated runs update rather than duplicate', async () => {
  const api = apiWith();
  const first = call({ api, body: () => `${DEPLOYBUDDY_COMMENT_MARKER}\nRisk 82%` });
  await first.run;
  const second = call({ api, body: previous => `${DEPLOYBUDDY_COMMENT_MARKER}\nRisk 24% ${previous ? 'improved' : ''}` });
  await second.run;
  assert.equal(api.created.length, 1);
  assert.equal(api.updated.length, 1);
  assert.equal(api.comments.length, 1);
});

test('push events never create or update comments', async () => {
  const target = call({ event: context('push') });
  assert.equal(await target.run, '');
  assert.equal(target.factoryCalls(), 0);
  assert.equal(target.api.created.length + target.api.updated.length, 0);
});

test('workflow_dispatch and other non-pull-request events never comment', async () => {
  const target = call({ event: context('workflow_dispatch') });
  assert.equal(await target.run, '');
  assert.equal(target.factoryCalls(), 0);
});

test('missing pull request metadata warns and returns an empty URL', async () => {
  const target = call({ event: context('pull_request', 0) });
  assert.equal(await target.run, '');
  assert.deepEqual(target.warnings, ['DeployBuddy could not identify the pull request for its comment.']);
  assert.equal(target.factoryCalls(), 0);
});

test('missing token and fork-style permission failures are non-fatal and use generic warnings', async () => {
  const missing = call({ token: '' });
  assert.equal(await missing.run, '');
  assert.deepEqual(missing.warnings, [COMMENT_PERMISSION_WARNING]);
  assert.equal(missing.factoryCalls(), 0);

  const api = { async list() { throw new Error('403 denied, token=test-secret-token'); }, async create() { throw Error('unused'); }, async update() { throw Error('unused'); } };
  const fork = call({ api });
  assert.equal(await fork.run, '');
  assert.deepEqual(fork.warnings, [COMMENT_PERMISSION_WARNING]);
  assert.equal(fork.warnings.join('\n').includes('test-secret-token'), false);
});

test('GitHub API failures never leak error text or fail the assessment', async () => {
  const secret = 'ghs_super_secret_value';
  const api = { async list() { throw new Error(`request ${secret} failed`); }, async create() { throw Error('unused'); }, async update() { throw Error('unused'); } };
  const target = call({ token: secret, api });
  assert.equal(await target.run, '');
  assert.deepEqual(target.warnings, [COMMENT_PERMISSION_WARNING]);
  assert.equal(target.warnings.join('\n').includes(secret), false);
});

test('one shared presenter drives Step Summary and PR comment body', () => {
  const report = assessment();
  const markdown = renderAssessmentMarkdown(report);
  const comment = renderPullRequestComment(report);
  assert.equal(comment.slice(`${DEPLOYBUDDY_COMMENT_MARKER}\n\n`.length), markdown);
  assert.match(markdown, /### .* Release Readiness: (READY|NEEDS ATTENTION|BLOCKED|INSUFFICIENT EVIDENCE)/);
  assert.ok(['ready', 'needs_attention', 'blocked', 'insufficient_evidence'].includes(report.readiness.status));
  for (const heading of ['Blocking', 'Cautions', 'Looking good', 'Unknown', 'Policy', 'Recommended next step']) assert.ok(markdown.includes(heading));
});

test('shared Step Summary and PR comment include configured release gate outcomes', () => {
  const report = assessment({ policy: core.parseDeployBuddyPolicy(JSON.stringify({ version: 1, release: { maxRisk: 0 } })) });
  const summary = renderAssessmentMarkdown(report), comment = renderPullRequestComment(report);
  assert.equal(report.releaseGates.status, 'fail');
  assert.match(summary, /### 🚦 Release Gates\n❌ FAILED/);
  assert.match(summary, /Risk threshold exceeded/);
  assert.ok(comment.endsWith(summary));
});

test('PR file metadata is normalized into private category-only shared report sections', () => {
  const files = normalizePullRequestFiles([
    { filename: 'database/migrations/0001.sql', status: 'added' },
    { filename: 'package-lock.json', status: 'modified' },
    { filename: 'src/auth/login.ts', status: 'renamed' },
    { filename: 'README.md', status: 'removed' },
  ]);
  assert.deepEqual(files.map(item => item.status), ['added', 'modified', 'renamed', 'deleted']);
  const report = assessment();
  report.changes = core.analyzeChanges(files);
  const summary = renderAssessmentMarkdown(report);
  const comment = renderPullRequestComment(report);
  assert.match(summary, /### 🧩 Changed areas/);
  assert.match(summary, /\*\*Attention:\*\* CRITICAL/);
  for (const category of ['Database: 1', 'Dependencies: 1', 'Security: 1', 'Documentation: 1']) assert.ok(summary.includes(category));
  assert.ok(!summary.includes('database/migrations/0001.sql'));
  assert.ok(!comment.includes('package-lock.json'));
  assert.ok(comment.endsWith(summary));
});

test('optional baseline delta uses the same Step Summary and PR comment presenter', () => {
  const report = assessment();
  report.riskScore = 71;
  report.confidenceScore = 88;
  report.delta = { riskDelta: 17, confidenceDelta: -3, riskDirection: 'worse', confidenceDirection: 'less-evidence', verdictChanged: true, previousVerdict: 'QUESTIONABLE', currentVerdict: 'DO_NOT_DEPLOY', policyChanged: true, previousPolicyPassed: true, currentPolicyPassed: false, addedFindings: [{ code: 'diagnostics.errors', title: '2 diagnostics errors' }], resolvedFindings: [{ code: 'git.dirty', title: 'Working tree dirty' }], changedSignals: [{ code: 'errors', previous: 0, current: 2 }], posture: 'WORSENED' };
  const summary = renderAssessmentMarkdown(report);
  const comment = renderPullRequestComment(report);
  assert.match(summary, /Change from baseline/);
  assert.match(summary, /Risk: 54% → 71% \(\+17\)/);
  assert.match(comment, /Risk: 54% → 71% \(\+17\)/);
  assert.match(comment, /2 diagnostics errors/);
  assert.match(comment, /errors: 0 → 2/);
  assert.match(comment, /Working tree dirty/);
});

test('shared report presenter includes policy failure details and pass state', () => {
  const signals = {
    workspaceFolders: ['.'], git: { available: true, repositories: [], branch: 'feature', upstream: 'origin/feature', ahead: 0, behind: 0, unstagedFiles: 0, conflictFiles: 0, detachedHead: false, modifiedFiles: 0, stagedFiles: 0, untrackedFiles: 0, changedFiles: 0, hasUncommittedChanges: false, dirtyPrimaryBranch: false },
    diagnostics: { available: true, errors: 0, warnings: 0 }, tests: { testStatus: 'unknown', passed: null, failed: null, skipped: null, notRun: null, note: '' },
    context: { day: 'Wednesday', dayOfWeek: 3, hour: 11, minute: 0, timestamp: '' }, project: { available: true, frameworks: ['vite'], packageManagers: ['npm'], roots: ['./'], parseErrors: [] },
    checks: [], policy: { configured: true, valid: true, policy: { version: 1, confidence: { minimumScore: 99 } }, errors: [] },
  };
  const risk = core.calculateDeploymentRisk(signals); const confidence = core.calculateEvidenceConfidence(signals); const recommendations = core.getDeploymentRecommendations(signals);
  const report = buildAssessmentSections({ signals, risk, confidence, recommendations }, 'main');
  const markdown = renderAssessmentMarkdown(report);
  assert.match(markdown, /❌ Failed — 1 violations/);
  assert.match(markdown, /Insufficient evidence confidence: Confidence is/);
  assert.match(renderAssessmentMarkdown({ ...report, policy: { configured: true, passed: true, rulesEvaluated: 1, violations: [] } }), /✅ Repository deployment policy satisfied/);
});

test('low-risk low-confidence report avoids green safety wording', () => {
  const report = assessment({
    git: { available: false, repositories: [], branch: null, upstream: null, ahead: null, behind: null, unstagedFiles: null, conflictFiles: null, detachedHead: null, modifiedFiles: 0, stagedFiles: 0, untrackedFiles: 0, changedFiles: 0, hasUncommittedChanges: false, dirtyPrimaryBranch: false },
    diagnostics: { available: false, errors: 0, warnings: 0 },
    project: { available: false, frameworks: [], packageManagers: [], roots: [], parseErrors: [] },
  });
  assert.equal(report.riskLevel, 'safe');
  assert.equal(report.confidenceLevel, 'LOW');
  const body = renderPullRequestComment(report);
  assert.match(body, /\*\*Observed risk:\*\*/);
  assert.match(body, /Observed risk is low, but DeployBuddy does not yet have enough evidence to call this deployment safe\./);
  assert.doesNotMatch(body, /✅ Blocking/);
});

test('high-risk comment identifies blockers and the recommendation', () => {
  const report = assessment({
    context: { day: 'Friday', dayOfWeek: 5, hour: 21, minute: 0, timestamp: '2026-10-16T18:00:00.000Z' },
    git: { available: true, repositories: [{ root: '.', branch: 'main', upstream: 'origin/main', ahead: 0, behind: 2, unstagedFiles: 1, conflictFiles: 0, detachedHead: false, modifiedFiles: 1, stagedFiles: 0, untrackedFiles: 0, changedFiles: 1, hasUncommittedChanges: true }], branch: 'main', upstream: 'origin/main', ahead: 0, behind: 2, unstagedFiles: 1, conflictFiles: 0, detachedHead: false, modifiedFiles: 1, stagedFiles: 0, untrackedFiles: 0, changedFiles: 1, hasUncommittedChanges: true, dirtyPrimaryBranch: true },
    diagnostics: { available: true, errors: 5, warnings: 11 },
  });
  const body = renderPullRequestComment(report);
  assert.equal(report.riskLevel, 'danger');
  assert.match(body, /DO NOT DEPLOY/);
  assert.match(body, /workspace diagnostics errors/);
  assert.match(body, /error diagnostics are present/);
});

test('untrusted branch/framework/check text is escaped and source text is never rendered', () => {
  const report = assessment({
    git: { available: true, repositories: [{ root: '.', branch: 'feature/[x](https://bad) <img>\u001b[31m', upstream: null, ahead: null, behind: null, unstagedFiles: 0, conflictFiles: 0, detachedHead: false, modifiedFiles: 0, stagedFiles: 0, untrackedFiles: 0, changedFiles: 0, hasUncommittedChanges: false }], branch: 'feature/[x](https://bad) <img>\u001b[31m', upstream: null, ahead: null, behind: null, unstagedFiles: 0, conflictFiles: 0, detachedHead: false, modifiedFiles: 0, stagedFiles: 0, untrackedFiles: 0, changedFiles: 0, hasUncommittedChanges: false, dirtyPrimaryBranch: false },
    project: { available: true, frameworks: ['<script>alert(1)</script>'], packageManagers: ['npm'], roots: ['./'], parseErrors: [] },
    checks: [{ kind: 'build', status: 'available', command: 'npm run build [click](https://bad)' }],
    source: 'MUST NEVER APPEAR',
  });
  const markdown = renderPullRequestComment(report);
  assert.doesNotMatch(markdown, /<script>|<img>/);
  assert.doesNotMatch(markdown, /\u001b/);
  assert.match(markdown, /&lt;script&gt;/);
  assert.match(markdown, /\\\[/);
  assert.doesNotMatch(markdown, /MUST NEVER APPEAR/);
});

test('large findings are capped and overflow is placed in a details block within comment limits', () => {
  const base = assessment();
  const many = Array.from({ length: 250 }, (_, i) => `Finding ${i} ${'x'.repeat(400)}`);
  const capped = limitFindings('Blocking', many);
  const report = { ...base, riskLevel: 'danger', riskScore: 88, verdict: 'DO NOT DEPLOY', blockers: capped.shown, omitted: capped.omitted ? [capped.omitted] : [] };
  const markdown = renderPullRequestComment(report);
  assert.ok(markdown.length < 16_100);
  assert.match(markdown, /<details>/);
  assert.match(markdown, /Additional findings omitted/);
  assert.equal((markdown.split('<details>')[0]?.match(/^- Finding/gm) ?? []).length, 5);
});
