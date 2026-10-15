const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../dist');

function entry(index, { risk = 50, confidence = 70, policy = { configured: true, passed: true }, findings = ['tests.unknown'] } = {}) {
  return {
    schemaVersion: 1, id: `assessment-${String(index).padStart(4, '0')}`,
    recordedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    risk: { score: risk, verdict: risk <= 30 ? 'DEPLOY' : risk <= 65 ? 'QUESTIONABLE' : 'DO_NOT_DEPLOY' },
    confidence: { score: confidence, level: confidence >= 80 ? 'high' : confidence >= 50 ? 'medium' : 'low' },
    policy, signals: { gitDirty: false, gitBehind: 0, errors: 0, warnings: 0, testsKnown: false, buildKnown: false, lintKnown: false },
    findings,
  };
}

test('history entries validate, keep normalized fields, and skip corrupt or future schemas', () => {
  const valid = entry(1);
  const legacy = { ...valid }; delete legacy.revision;
  assert.equal(core.parseAssessmentHistoryEntry(legacy).status, 'valid');
  assert.equal(core.parseAssessmentHistoryEntry({ ...legacy, readiness: 'ready' }).status, 'valid');
  assert.equal(core.parseAssessmentHistoryEntry({ ...legacy, readiness: 'unknown' }).status, 'invalid');
  assert.equal(core.parseAssessmentHistoryEntry(valid).status, 'valid');
  assert.equal(core.parseAssessmentHistoryEntry({ ...valid, schemaVersion: 2 }).status, 'unsupported');
  assert.equal(core.parseAssessmentHistoryEntry({ ...valid, profile: { frameworks: ['/private/path'] } }).status, 'invalid');
  const parsed = core.parseAssessmentHistory({ schemaVersion: 1, entries: [valid, valid, { ...valid, schemaVersion: 2 }, { ...valid, findings: ['source text'] }] });
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.invalidCount, 2);
  assert.equal(parsed.unsupportedCount, 1);
  assert.equal(core.parseAssessmentHistory({ schemaVersion: 8, entries: [valid] }).unsupportedCount, 1);
});

test('revision metadata stays optional, normalized and outside legacy-baseline requirements', () => {
  const withRevision = { ...entry(7), revision: { sha: 'a'.repeat(40), shortSha: 'a'.repeat(7), branch: 'feature/payments', detached: false } };
  assert.equal(core.parseAssessmentHistoryEntry(withRevision).status, 'valid');
  assert.equal(core.parseAssessmentHistoryEntry({ ...withRevision, revision: { sha: 'not-a-sha', branch: 'secret' } }).status, 'invalid');
  assert.equal(core.parseAssessmentBaseline({ schemaVersion: 1, recordedAt: withRevision.recordedAt, risk: withRevision.risk, confidence: withRevision.confidence, policy: withRevision.policy, signals: withRevision.signals, findings: withRevision.findings }).status, 'valid');
});

test('revision analytics find material increases/decreases and ignore sub-threshold changes', () => {
  const records = [
    { ...entry(1, { risk: 20, findings: ['git.dirty'] }), revision: { sha: 'a'.repeat(40), shortSha: 'aaaaaaa', branch: 'main' } },
    { ...entry(2, { risk: 34, findings: ['tests.unknown'] }), revision: { sha: 'b'.repeat(40), shortSha: 'bbbbbbb', branch: 'main' } },
    { ...entry(3, { risk: 60, confidence: 60, policy: { configured: true, passed: false }, findings: ['tests.unknown', 'diagnostics.errors', 'policy.testsRequired'] }), revision: { sha: 'c'.repeat(40), shortSha: 'ccccccc', branch: 'main' } },
    { ...entry(4, { risk: 36, confidence: 75, policy: { configured: true, passed: true }, findings: ['git.dirty'] }), revision: { sha: 'd'.repeat(40), shortSha: 'ddddddd', branch: 'main' } },
  ];
  assert.equal(core.MATERIAL_RISK_CHANGE_THRESHOLD, 15);
  const jumps = core.findRiskJumps(records);
  assert.deepEqual(jumps.map(item => item.riskDelta), [26, -24]);
  assert.deepEqual(jumps[0].addedFindings, ['diagnostics.errors', 'policy.testsRequired']);
  assert.deepEqual(jumps[0].resolvedFindings, []);
  assert.deepEqual(core.findMaterialRiskChanges(records), jumps);
  assert.deepEqual(core.compareRevisionEntries(records[0], records[1]).addedFindings, ['tests.unknown']);
});

test('policy transitions and revision lookups are deterministic, including ambiguous short hashes', () => {
  const records = [
    { ...entry(1, { policy: { configured: true, passed: true }, findings: [] }), revision: { sha: '1'.repeat(40), shortSha: '1111111' } },
    { ...entry(2, { policy: { configured: true, passed: false }, findings: ['policy.testsRequired'] }), revision: { sha: '2'.repeat(40), shortSha: '2222222' } },
    { ...entry(3, { policy: { configured: true, passed: true }, findings: [] }), revision: { sha: '3'.repeat(40), shortSha: '3333333' } },
    { ...entry(4, { policy: { configured: true, passed: true }, findings: [] }), revision: { sha: '2'.repeat(40), shortSha: '2222222' } },
    { ...entry(5, { policy: { configured: true, passed: true }, findings: [] }), revision: { sha: '2'.repeat(40) + 'abcdef', shortSha: '2222222' } },
  ];
  const transitions = core.findPolicyTransitions(records);
  assert.deepEqual(transitions.map(item => item.transition), ['PASS_TO_FAIL', 'FAIL_TO_PASS']);
  assert.deepEqual(transitions[0].introducedViolations, ['policy.testsRequired']);
  assert.deepEqual(transitions[1].resolvedViolations, ['policy.testsRequired']);
  assert.equal(core.findRevisionAssessment(records, '3'.repeat(40)).status, 'found');
  assert.equal(core.findRevisionAssessment(records, 'fffffff').status, 'missing');
  assert.equal(core.findRevisionAssessment(records, '2222222').status, 'ambiguous');
});

test('assessment history constructor persists no rendered text, file paths, or AI content', () => {
  const assessment = {
    signals: {
      workspaceFolders: ['/private/project'],
      git: { available: true, branch: 'private-branch', hasUncommittedChanges: true, behind: 1 },
      diagnostics: { available: true, errors: 1, warnings: 12 },
      tests: { testStatus: 'unknown', failed: null },
      checks: [{ kind: 'build', result: 'not_run' }],
      project: { frameworks: ['react', 'vite'] },
    },
    risk: { score: 60, verdict: 'QUESTIONABLE', reasons: [{ code: 'late' }, { code: 'dirty' }] },
    confidence: { score: 70, level: 'medium' },
    policy: { configured: true, passed: false, violations: [{ code: 'evidence.tests', detail: 'private prose' }] },
    recommendations: [{ detail: 'private advice' }],
  };
  assessment.signals.git.revision = { sha: 'a'.repeat(40), shortSha: 'a'.repeat(7), branch: 'feature/payments', detached: false, message: 'COMMIT_MESSAGE_SECRET', author: 'AUTHOR_SECRET' };
  const stored = core.createAssessmentHistoryEntry(assessment, 'local-id-0001', '2026-01-01T00:00:00.000Z');
  const json = JSON.stringify(stored);
  for (const privateValue of ['/private/project', 'private-branch', 'private prose', 'private advice', 'COMMIT_MESSAGE_SECRET', 'AUTHOR_SECRET', 'workspaceFolders', 'recommendations']) assert.equal(json.includes(privateValue), false);
  assert.deepEqual(stored.revision, { sha: 'a'.repeat(40), shortSha: 'a'.repeat(7), branch: 'feature/payments', detached: false });
  assert.deepEqual(stored.profile, { frameworks: ['react', 'vite'] });
  assert.ok(stored.findings.includes('risk.afterHours'));
  assert.ok(stored.findings.includes('policy.testsRequired'));
});

test('risk trend distinguishes improving, worsening, stable and insufficient samples', () => {
  assert.equal(core.calculateHistoryTrend([80, 70, 60, 50, 40, 30]).direction, 'improving');
  assert.equal(core.calculateHistoryTrend([20, 30, 40, 50, 60, 70]).direction, 'worsening');
  assert.equal(core.calculateHistoryTrend([40, 42, 41, 42, 43, 44]).direction, 'stable');
  assert.equal(core.calculateHistoryTrend([80, 20]).direction, 'insufficient-data');
});

test('risk and confidence trends use chronological entries independently', () => {
  const entries = [
    entry(1, { risk: 80, confidence: 35 }), entry(2, { risk: 70, confidence: 45 }), entry(3, { risk: 60, confidence: 55 }),
    entry(4, { risk: 50, confidence: 65 }), entry(5, { risk: 40, confidence: 80 }), entry(6, { risk: 30, confidence: 90 }),
  ];
  assert.deepEqual(core.calculateRiskTrend(entries), { direction: 'improving', olderAverage: 70, recentAverage: 40, sampleSize: 6, windowSize: 3 });
  assert.deepEqual(core.calculateConfidenceTrend(entries), { direction: 'improving', olderAverage: 45, recentAverage: 78, sampleSize: 6, windowSize: 3 });
  assert.equal(core.calculateConfidenceTrend(entries.slice(0, 4)).direction, 'insufficient-data');
});

test('history summary computes averages, extrema, latest value, policy pass rate, and finding frequency', () => {
  const entries = [
    entry(2, { risk: 80, confidence: 60, policy: { configured: true, passed: false }, findings: ['tests.unknown', 'git.dirty'] }),
    entry(1, { risk: 20, confidence: 90, policy: { configured: true, passed: true }, findings: ['tests.unknown'] }),
    entry(3, { risk: 40, confidence: 70, policy: { configured: false, passed: true }, findings: ['risk.afterHours', 'git.dirty'] }),
  ];
  assert.equal(core.calculatePolicyPassRate(entries), 50);
  assert.deepEqual(core.getFrequentFindings(entries), [{ code: 'git.dirty', count: 2 }, { code: 'tests.unknown', count: 2 }, { code: 'risk.afterHours', count: 1 }]);
  const summary = core.summarizeHistory(entries);
  assert.equal(summary.count, 3); assert.equal(summary.averageRisk, 47); assert.equal(summary.highestRisk, 80); assert.equal(summary.lowestRisk, 20); assert.equal(summary.latestRisk, 40); assert.equal(summary.averageConfidence, 73); assert.equal(summary.policyPassRate, 50);
  assert.equal(core.calculatePolicyPassRate([entry(4, { policy: { configured: false, passed: true } })]), null);
});

test('readiness history summary counts new entries while legacy entries remain readable', () => {
  const entries = [
    { ...entry(1), readiness: 'ready' },
    { ...entry(2), readiness: 'blocked' },
    entry(3),
  ];
  const summary = core.summarizeHistory(entries);
  assert.equal(summary.readinessPassRate, 50);
  assert.deepEqual(summary.readinessCounts, { ready: 1, needs_attention: 0, blocked: 1, insufficient_evidence: 0 });
  assert.equal(core.summarizeHistory([entry(4)]).readinessPassRate, null);
  const transitions = core.findReadinessTransitions([
    { ...entry(5), readiness: 'ready' },
    entry(6),
    { ...entry(7), readiness: 'blocked' },
    { ...entry(8), readiness: 'needs_attention' },
  ]);
  assert.deepEqual(transitions.map(item => [item.previous, item.current]), [['blocked', 'needs_attention']]);
});

test('release-gate history stays optional and summarizes pass rates and transitions', () => {
  const entries = [
    { ...entry(1), releaseGates: { configured: true, status: 'pass' } },
    entry(2),
    { ...entry(3), releaseGates: { configured: true, status: 'fail' } },
  ];
  assert.equal(core.calculateReleaseGatePassRate(entries), 50);
  assert.equal(core.summarizeHistory(entries).releaseGatePassRate, 50);
  assert.deepEqual(core.findReleaseGateTransitions(entries).map(item => [item.previous, item.current]), [['pass', 'fail']]);
  assert.equal(core.parseAssessmentHistoryEntry({ ...entry(4), releaseGates: { configured: true, status: 'pass' } }).status, 'valid');
  assert.equal(core.parseAssessmentHistoryEntry(entry(5)).status, 'valid');
  assert.equal(core.calculateReleaseGatePassRate([entry(6)]), null);
  const baselineA = { ...entry(7), releaseGates: { configured: true, status: 'pass' } };
  const baselineB = { ...entry(8), releaseGates: { configured: true, status: 'fail' } };
  const changed = core.compareAssessments(
    { schemaVersion: 1, recordedAt: baselineA.recordedAt, risk: baselineA.risk, confidence: baselineA.confidence, policy: baselineA.policy, signals: baselineA.signals, findings: [], releaseGates: baselineA.releaseGates },
    { schemaVersion: 1, recordedAt: baselineB.recordedAt, risk: baselineB.risk, confidence: baselineB.confidence, policy: baselineB.policy, signals: baselineB.signals, findings: [], releaseGates: baselineB.releaseGates },
  );
  assert.equal(changed.releaseGatesChanged, true); assert.equal(changed.previousReleaseGatesStatus, 'pass'); assert.equal(changed.currentReleaseGatesStatus, 'fail');
  assert.equal(core.compareAssessments(
    { schemaVersion: 1, recordedAt: baselineB.recordedAt, risk: baselineB.risk, confidence: baselineB.confidence, policy: baselineB.policy, signals: baselineB.signals, findings: [], releaseGates: baselineB.releaseGates },
    { schemaVersion: 1, recordedAt: baselineA.recordedAt, risk: baselineA.risk, confidence: baselineA.confidence, policy: baselineA.policy, signals: baselineA.signals, findings: [], releaseGates: baselineA.releaseGates },
  ).currentReleaseGatesStatus, 'pass');
});
