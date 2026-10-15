const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../dist');

const risk = (score = 18) => ({ score, level: score <= 30 ? 'safe' : score <= 65 ? 'caution' : 'danger', verdict: score <= 30 ? 'DEPLOY' : score <= 65 ? 'QUESTIONABLE' : 'DO_NOT_DEPLOY', reasons: [], message: 'Ship it', advice: 'Review.' });
const confidence = (score = 90) => ({ score, level: score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low', available: [], missing: [] });
const evidence = (overrides = {}) => ({
  risk: risk(), confidence: confidence(),
  git: { available: true, repositories: [], branch: 'feature', upstream: 'origin/feature', ahead: 0, behind: 0, modifiedFiles: 0, stagedFiles: 0, untrackedFiles: 0, changedFiles: 0, unstagedFiles: 0, conflictFiles: 0, detachedHead: false, hasUncommittedChanges: false, dirtyPrimaryBranch: false },
  diagnostics: { available: true, errors: 0, warnings: 0 },
  tests: { testStatus: 'known', passed: 12, failed: 0, skipped: 0, notRun: 0, note: '' },
  checks: [{ kind: 'build', status: 'available', command: 'npm run build' }, { kind: 'lint', status: 'available', command: 'npm run lint' }, { kind: 'tests', status: 'available', command: 'npm test' }],
  project: { available: true, frameworks: ['vite', 'react'], packageManagers: ['npm'], roots: ['./'], parseErrors: [] },
  ...overrides,
});
const policy = value => core.validatePolicy({ version: 1, ...value });
const evaluate = (value, over) => core.evaluatePolicy(value, evidence(over));

test('no policy is unconfigured and passes without violations', () => assert.deepEqual(evaluate(core.parseDeployBuddyPolicy(undefined)), { configured: false, passed: true, rulesEvaluated: 0, violations: [] }));
test('valid root policy parses and evaluates', () => assert.equal(policy({ risk: { maxScore: 50 }, confidence: { minimumScore: 80 } }).valid, true));
test('malformed JSON is configured but invalid and fails closed', () => {
  const parsed = core.parseDeployBuddyPolicy('{');
  assert.equal(parsed.valid, false); assert.equal(evaluate(parsed).passed, false);
  assert.equal(evaluate(parsed).violations[0].code, 'policy.invalid');
});
test('oversized policy and legacy config inputs fail safely', () => {
  assert.equal(core.parseDeployBuddyPolicy(' '.repeat(256 * 1024 + 1)).valid, false);
  assert.equal(core.parseDeployBuddyConfig(' '.repeat(256 * 1024 + 1)).valid, false);
});
test('unknown top-level and nested keys are rejected', () => {
  const parsed = policy({ unexpected: true, git: { requireClean: true, shell: 'git push' } });
  assert.deepEqual(parsed.errors.map(error => error.path), ['unexpected', 'git.shell']);
});
test('unsupported policy version is rejected', () => assert.equal(policy({ version: 2 }).errors[0].path, 'version'));
test('risk maximum and failOnQuestionable are evaluated without changing risk', () => {
  const initial = risk(42); const parsed = policy({ risk: { maxScore: 30, failOnQuestionable: true } });
  const result = evaluate(parsed, { risk: initial });
  assert.equal(result.violations.length, 2); assert.equal(initial.score, 42); assert.equal(initial.verdict, 'QUESTIONABLE');
});
test('minimum confidence produces a separate violation', () => assert.equal(evaluate(policy({ confidence: { minimumScore: 95 } })).violations[0].code, 'confidence.minimum'));
test('requireClean fails for dirty and unavailable Git', () => {
  const parsed = policy({ git: { requireClean: true } });
  assert.equal(evaluate(parsed, { git: { ...evidence().git, hasUncommittedChanges: true, changedFiles: 2 } }).violations[0].code, 'git.clean');
  assert.equal(evaluate(parsed, { git: { ...evidence().git, available: false } }).violations[0].code, 'git.clean');
});
test('requireUpToDate fails for behind and unknown upstream state', () => {
  const parsed = policy({ git: { requireUpToDate: true } });
  assert.match(evaluate(parsed, { git: { ...evidence().git, behind: 1 } }).violations[0].detail, /1 commits/);
  assert.match(evaluate(parsed, { git: { ...evidence().git, upstream: null, behind: null } }).violations[0].detail, /unknown/);
});
test('detached HEAD and disallowed untracked files fail', () => {
  assert.equal(evaluate(policy({ git: { allowDetachedHead: false } }), { git: { ...evidence().git, detachedHead: true } }).violations[0].code, 'git.detached-head');
  assert.equal(evaluate(policy({ git: { allowUntracked: false } }), { git: { ...evidence().git, untrackedFiles: 1 } }).violations[0].code, 'git.untracked');
});
test('diagnostic thresholds fail when exceeded and fail closed when unknown', () => {
  const parsed = policy({ diagnostics: { maxErrors: 0, maxWarnings: 1 } });
  const result = evaluate(parsed, { diagnostics: { available: true, errors: 1, warnings: 3 } });
  assert.deepEqual(result.violations.map(item => item.code), ['diagnostics.errors', 'diagnostics.warnings']);
  assert.equal(evaluate(parsed, { diagnostics: { available: false, errors: 0, warnings: 0 } }).violations.length, 2);
});
test('required tests need known successful results; command availability alone does not pass', () => {
  const parsed = policy({ evidence: { requireTests: true } });
  assert.equal(evaluate(parsed, { tests: { testStatus: 'unknown', passed: null, failed: null, skipped: null, notRun: null, note: '' } }).violations[0].code, 'evidence.tests');
  assert.equal(evaluate(parsed, { tests: { ...evidence().tests, failed: 2 } }).violations.length, 1);
  assert.equal(evaluate(parsed).passed, true);
});
test('required build and lint require verified passed results', () => {
  const parsed = policy({ evidence: { requireBuild: true, requireLint: true } });
  assert.equal(evaluate(parsed).violations.length, 2);
  const verified = evidence({ checks: [{ kind: 'build', status: 'available', command: 'npm run build', result: 'passed' }, { kind: 'lint', status: 'available', command: 'npm run lint', result: 'passed' }] });
  assert.equal(core.evaluatePolicy(parsed, verified).passed, true);
});
test('required and allowed frameworks evaluate deterministically', () => {
  assert.equal(evaluate(policy({ frameworks: { required: ['laravel'] } })).violations[0].code, 'frameworks.required');
  assert.equal(evaluate(policy({ frameworks: { allowed: ['laravel'] } })).violations.length, 2);
});
test('required frameworks excluded by allowlist are contradictory', () => assert.equal(policy({ frameworks: { allowed: ['vite'], required: ['laravel'] } }).valid, false));
test('multiple simultaneous violations retain stable policy order', () => {
  const parsed = policy({ risk: { maxScore: 10 }, confidence: { minimumScore: 95 }, git: { requireClean: true }, diagnostics: { maxErrors: 0 } });
  const result = evaluate(parsed, { risk: risk(42), confidence: confidence(60), git: { ...evidence().git, hasUncommittedChanges: true, changedFiles: 3 }, diagnostics: { available: true, errors: 1, warnings: 0 } });
  assert.deepEqual(result.violations.map(item => item.code), ['risk.maximum', 'confidence.minimum', 'git.clean', 'diagnostics.errors']);
});
test('policy does not mutate risk or confidence inputs', () => {
  const r = risk(18); const c = confidence(90);
  evaluate(policy({ risk: { maxScore: 10 }, confidence: { minimumScore: 99 } }), { risk: r, confidence: c });
  assert.equal(r.score, 18); assert.equal(r.verdict, 'DEPLOY'); assert.equal(c.score, 90); assert.equal(c.level, 'high');
});
test('legacy config without v1 policy keys remains unconfigured', () => assert.equal(core.parseDeployBuddyPolicy('{"thresholds":{"safeMax":30}}').configured, false));
