const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateReleaseGates, parseDeployBuddyPolicy } = require('../dist');
const base = (overrides = {}) => ({
  config: { requiredReadiness: 'ready', maxRisk: 30, minimumConfidence: 80, allowedChangeAttention: ['low', 'moderate'], requirePolicyPass: true },
  risk: { score: 18 }, confidence: { score: 90 }, policy: { configured: true, passed: true },
  changes: { attention: { level: 'low' } }, readiness: { status: 'ready' }, ...overrides,
});
test('no release configuration is distinctly not configured', () => assert.deepEqual(evaluateReleaseGates({ ...base(), config: undefined }), { configured: false, status: 'not_configured', violations: [] }));
test('all configured release gates pass without mutating evidence', () => {
  const input = base(); const before = structuredClone(input);
  assert.deepEqual(evaluateReleaseGates(input), { configured: true, status: 'pass', violations: [] });
  assert.deepEqual(input, before);
});
test('gates report deterministic ordered violations for readiness, risk, confidence, policy, and attention', () => {
  const result = evaluateReleaseGates(base({ risk: { score: 42 }, confidence: { score: 63 }, policy: { configured: false, passed: true }, changes: { attention: { level: 'high' } }, readiness: { status: 'needs_attention' } }));
  assert.equal(result.status, 'fail');
  assert.deepEqual(result.violations.map(item => item.code), ['release.requiredReadiness', 'release.maxRisk', 'release.minimumConfidence', 'release.policyMissing', 'release.allowedChangeAttention']);
});
test('BLOCKED readiness never passes a configured gate', () => assert.equal(evaluateReleaseGates(base({ readiness: { status: 'blocked' }, config: {} })).status, 'fail'));
test('policy failure and missing policy fail closed only when required', () => {
  assert.equal(evaluateReleaseGates(base({ policy: { configured: true, passed: false }, config: { requirePolicyPass: true } })).violations[0].code, 'release.policyFailed');
  assert.equal(evaluateReleaseGates(base({ policy: { configured: false, passed: true }, config: { requirePolicyPass: true } })).violations[0].code, 'release.policyMissing');
});
test('release configuration is strict and validates thresholds, enums, and non-empty allowed attention', () => {
  for (const bad of [
    { version: 1, release: { requiredReadiness: 'maybe' } },
    { version: 1, release: { maxRisk: 101 } },
    { version: 1, release: { minimumConfidence: -1 } },
    { version: 1, release: { allowedChangeAttention: [] } },
    { version: 1, release: { mystery: true } },
    { version: 1, release: { allowedChangeAttention: ['low', 'unknown'] } },
  ]) assert.equal(parseDeployBuddyPolicy(JSON.stringify(bad)).valid, false, JSON.stringify(bad));
  assert.equal(parseDeployBuddyPolicy('{"version":1,"release":{"requiredReadiness":"ready","maxRisk":30,"minimumConfidence":80,"allowedChangeAttention":["low","moderate"],"requirePolicyPass":true}}').valid, true);
});
