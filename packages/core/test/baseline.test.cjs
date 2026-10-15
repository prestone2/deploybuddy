const test = require('node:test');
const assert = require('node:assert/strict');
const { compareAssessments, createAssessmentBaseline, parseAssessmentBaseline } = require('../dist');

function assessment({ risk = 20, confidence = 80, policy = { configured: true, passed: true, violations: [] }, dirty = false, errors = 0, tests = 'known' } = {}) {
  return {
    risk: { score: risk, verdict: risk <= 30 ? 'DEPLOY' : risk <= 65 ? 'QUESTIONABLE' : 'DO_NOT_DEPLOY', reasons: [] },
    confidence: { score: confidence, level: confidence >= 80 ? 'high' : confidence >= 50 ? 'medium' : 'low' },
    policy,
    signals: {
      git: { available: true, hasUncommittedChanges: dirty, behind: 0 },
      diagnostics: { available: true, errors, warnings: 0 },
      tests: { testStatus: tests }, checks: [{ kind: 'build', result: 'passed' }, { kind: 'lint', result: 'passed' }],
    },
  };
}

test('delta measures risk, evidence confidence, findings and normalized signal changes', () => {
  const before = createAssessmentBaseline(assessment(), '2026-01-01T00:00:00.000Z');
  const after = createAssessmentBaseline(assessment({ risk: 55, confidence: 60, dirty: true, errors: 2, tests: 'unknown', policy: { configured: true, passed: false, violations: [{ code: 'evidence.tests' }] } }));
  const delta = compareAssessments(before, after);
  assert.equal(delta.riskDelta, 35);
  assert.equal(delta.confidenceDelta, -20);
  assert.equal(delta.riskDirection, 'worse');
  assert.equal(delta.confidenceDirection, 'less-evidence');
  assert.equal(delta.policyChanged, true);
  assert.equal(delta.previousPolicyPassed, true);
  assert.equal(delta.currentPolicyPassed, false);
  assert.deepEqual(delta.addedFindings.map(item => item.code), ['diagnostics.errors', 'git.dirty', 'policy.testsRequired', 'tests.unknown']);
  assert.deepEqual(delta.changedSignals.map(item => item.code), ['gitDirty', 'errors', 'testsKnown']);
  assert.equal(delta.posture, 'WORSENED');
});

test('delta classifies improvements, unchanged and mixed evidence changes deterministically', () => {
  const high = createAssessmentBaseline(assessment({ risk: 60, confidence: 80, dirty: true, errors: 2 }));
  const low = createAssessmentBaseline(assessment({ risk: 20, confidence: 80 }));
  assert.equal(compareAssessments(high, low).posture, 'IMPROVED');
  assert.equal(compareAssessments(high, assessment({ risk: 60, confidence: 80, dirty: true, errors: 2 })).posture, 'UNCHANGED');
  assert.equal(compareAssessments(high, assessment({ risk: 40, confidence: 40 })).posture, 'MIXED');
});

test('decreases, increases, unchanged scores and policy recovery expose exact directions', () => {
  const baseline = createAssessmentBaseline(assessment({ risk: 40, confidence: 50, dirty: true, errors: 2, tests: 'unknown', policy: { configured: true, passed: false, violations: [{ code: 'evidence.tests' }] } }));
  const recovered = createAssessmentBaseline(assessment({ risk: 20, confidence: 70 }));
  const improvement = compareAssessments(baseline, recovered);
  assert.equal(improvement.riskDelta, -20);
  assert.equal(improvement.confidenceDelta, 20);
  assert.equal(improvement.riskDirection, 'better');
  assert.equal(improvement.confidenceDirection, 'more-evidence');
  assert.equal(improvement.previousPolicyPassed, false);
  assert.equal(improvement.currentPolicyPassed, true);
  assert.equal(improvement.policyChanged, true);
  assert.deepEqual(improvement.resolvedFindings.map(item => item.code), ['diagnostics.errors', 'git.dirty', 'policy.testsRequired', 'tests.unknown']);
  assert.equal(improvement.posture, 'IMPROVED');
  const unchanged = compareAssessments(recovered, recovered);
  assert.equal(unchanged.riskDelta, 0);
  assert.equal(unchanged.confidenceDelta, 0);
  assert.equal(unchanged.riskDirection, 'unchanged');
  assert.equal(unchanged.confidenceDirection, 'unchanged');
  assert.equal(unchanged.posture, 'UNCHANGED');
});

test('readiness is optional baseline context and exposes deterministic transitions', () => {
  const old = { ...createAssessmentBaseline(assessment()), readiness: 'ready' };
  const current = { ...createAssessmentBaseline(assessment()), readiness: 'blocked' };
  const delta = compareAssessments(old, current);
  assert.equal(delta.readinessChanged, true);
  assert.equal(delta.previousReadiness, 'ready');
  assert.equal(delta.currentReadiness, 'blocked');
  assert.equal(parseAssessmentBaseline(old).status, 'valid');
  const legacy = { ...old }; delete legacy.readiness;
  assert.equal(parseAssessmentBaseline(legacy).status, 'valid');
});

test('baseline parsing accepts v1 and rejects malformed or unsupported records', () => {
  const baseline = createAssessmentBaseline(assessment());
  assert.equal(parseAssessmentBaseline(baseline).status, 'valid');
  assert.equal(parseAssessmentBaseline({ ...baseline, schemaVersion: 2 }).status, 'unsupported');
  assert.equal(parseAssessmentBaseline({ ...baseline, secrets: 'nope' }).status, 'invalid');
  assert.equal(parseAssessmentBaseline({ ...baseline, findings: ['arbitrary user text'] }).status, 'invalid');
});

test('baseline is minimal and contains no workspace paths or user content', () => {
  const serialized = JSON.stringify(createAssessmentBaseline({ ...assessment(), signals: { ...assessment().signals, workspaceFolders: ['/private/project'], git: { ...assessment().signals.git, branch: 'secret-branch' } } }));
  assert.equal(serialized.includes('/private/project'), false);
  assert.equal(serialized.includes('secret-branch'), false);
});
