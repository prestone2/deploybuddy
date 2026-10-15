const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../dist');

function signals(overrides = {}) {
  return {
    workspaceFolders: ['.'],
    git: { available: true, repositories: [], branch: 'feature/release', upstream: 'origin/feature/release', ahead: 0, behind: 0, modifiedFiles: 0, stagedFiles: 0, untrackedFiles: 0, changedFiles: 0, unstagedFiles: 0, conflictFiles: 0, detachedHead: false, hasUncommittedChanges: false, dirtyPrimaryBranch: false },
    diagnostics: { available: true, errors: 0, warnings: 0 },
    tests: { testStatus: 'known', passed: 24, failed: 0, skipped: 0, notRun: 0, note: '' },
    context: { day: 'Monday', dayOfWeek: 1, hour: 10, minute: 0, timestamp: '2026-10-15T07:00:00.000Z' },
    project: { available: true, frameworks: ['vite', 'react'], packageManagers: ['npm'], roots: ['./'], parseErrors: [] },
    checks: [{ kind: 'build', status: 'available', result: 'passed', command: 'npm run build' }, { kind: 'lint', status: 'available', result: 'passed', command: 'npm run lint' }, { kind: 'tests', status: 'available', result: 'passed', command: 'npm test' }],
    ...overrides,
  };
}

function assess(value, changed = []) {
  const risk = core.calculateDeploymentRisk(value);
  const confidence = core.calculateEvidenceConfidence(value);
  const policyParse = core.parseDeployBuddyPolicy(value.policyText);
  const policy = core.evaluatePolicy(policyParse, { risk, confidence, git: value.git, diagnostics: value.diagnostics, tests: value.tests, checks: value.checks, project: value.project });
  const changes = core.analyzeChanges(changed);
  const recommendations = core.getDeploymentRecommendations(value);
  const readiness = core.evaluateReleaseReadiness({ risk, confidence, policy, changes, signals: value, recommendations });
  const releaseGates = core.evaluateReleaseGates({ config: policyParse.policy?.release, risk, confidence, policy, changes, readiness });
  return { risk: risk.score, confidence: confidence.score, policy: policy.configured ? policy.passed ? 'pass' : 'fail' : 'not_configured', attention: changes.attention.level, readiness: readiness.status, releaseGates: releaseGates.status };
}

const cases = {
  safe: () => [signals(), [{ path: 'README.md', status: 'modified' }]],
  lowEvidence: () => [signals({ git: { available: false, repositories: [], branch: null, upstream: null, ahead: null, behind: null, modifiedFiles: 0, stagedFiles: 0, untrackedFiles: 0, changedFiles: 0, unstagedFiles: null, conflictFiles: null, detachedHead: null, hasUncommittedChanges: false, dirtyPrimaryBranch: false }, diagnostics: { available: false, errors: 0, warnings: 0 }, tests: { testStatus: 'unknown', passed: null, failed: null, skipped: null, notRun: null, note: '' }, project: { available: false, frameworks: [], packageManagers: [], roots: [], parseErrors: [] }, checks: [] }), []],
  policyFailure: () => [signals({ policyText: JSON.stringify({ version: 1, evidence: { requireTests: true } }), tests: { testStatus: 'unknown', passed: null, failed: null, skipped: null, notRun: null, note: '' } }), []],
  criticalChanges: () => [signals(), [{ path: 'database/migrations/001.sql', status: 'added' }, { path: 'security/auth.ts', status: 'modified' }]],
  releaseGateFailure: () => [signals({ context: { day: 'Saturday', dayOfWeek: 6, hour: 10, minute: 0, timestamp: '2026-10-17T07:00:00.000Z' }, git: { available: true, repositories: [], branch: 'feature/release', upstream: 'origin/feature/release', ahead: 0, behind: 0, modifiedFiles: 1, stagedFiles: 1, untrackedFiles: 0, changedFiles: 1, unstagedFiles: 0, conflictFiles: 0, detachedHead: false, hasUncommittedChanges: true, dirtyPrimaryBranch: false }, policyText: JSON.stringify({ version: 1, release: { maxRisk: 30 } }) }), []],
};

test('canonical normalized assessment goldens lock all independent release layers', () => {
  const actual = Object.fromEntries(Object.entries(cases).map(([name, get]) => {
    const [evidence, changed] = get();
    return [name, assess(evidence, changed)];
  }));
  assert.deepEqual(actual, {
    safe: { risk: 0, confidence: 100, policy: 'not_configured', attention: 'low', readiness: 'ready', releaseGates: 'not_configured' },
    lowEvidence: { risk: 15, confidence: 15, policy: 'not_configured', attention: 'low', readiness: 'insufficient_evidence', releaseGates: 'not_configured' },
    policyFailure: { risk: 15, confidence: 75, policy: 'fail', attention: 'low', readiness: 'blocked', releaseGates: 'not_configured' },
    criticalChanges: { risk: 0, confidence: 100, policy: 'not_configured', attention: 'critical', readiness: 'blocked', releaseGates: 'not_configured' },
    releaseGateFailure: { risk: 35, confidence: 100, policy: 'pass', attention: 'low', readiness: 'needs_attention', releaseGates: 'fail' },
  });
});
