const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateReleaseReadiness } = require('../dist');

const base = (overrides = {}) => ({
  risk: { score: 18, verdict: 'DEPLOY' },
  confidence: { score: 88, level: 'high' },
  policy: { configured: true, passed: true },
  changes: { attention: { level: 'low', reasons: [] } },
  signals: { tests: { testStatus: 'known' }, diagnostics: { available: true }, checks: [] },
  ...overrides,
});

test('readiness is ready when all evidence layers meet the criteria', () => {
  assert.equal(evaluateReleaseReadiness(base()).status, 'ready');
});

test('questionable risk and high change attention need attention', () => {
  assert.equal(evaluateReleaseReadiness(base({ risk: { score: 45, verdict: 'QUESTIONABLE' } })).status, 'needs_attention');
  assert.equal(evaluateReleaseReadiness(base({ changes: { attention: { level: 'high', reasons: ['Migrations changed.'] } } })).status, 'needs_attention');
});

test('risk, failed policy, and critical changes block regardless of other metrics', () => {
  assert.equal(evaluateReleaseReadiness(base({ risk: { score: 70, verdict: 'DO_NOT_DEPLOY' } })).status, 'blocked');
  assert.equal(evaluateReleaseReadiness(base({ policy: { configured: true, passed: false } })).status, 'blocked');
  assert.equal(evaluateReleaseReadiness(base({ changes: { attention: { level: 'critical', reasons: [] } } })).status, 'blocked');
});

test('low confidence is insufficient evidence unless stronger blockers apply', () => {
  const low = evaluateReleaseReadiness(base({ confidence: { score: 24, level: 'low' } }));
  assert.equal(low.status, 'insufficient_evidence');
  assert.match(low.reasons[0].detail, /not have enough evidence to recommend release/);
  assert.equal(evaluateReleaseReadiness(base({ confidence: { score: 24, level: 'low' }, policy: { configured: true, passed: false } })).status, 'blocked');
  assert.equal(evaluateReleaseReadiness(base({ risk: { score: 80, verdict: 'DO_NOT_DEPLOY' }, confidence: { score: 24, level: 'low' } })).status, 'blocked');
});

test('unknown tests require attention and actions are deterministic and de-duplicated', () => {
  const result = evaluateReleaseReadiness(base({ signals: { tests: { testStatus: 'unknown' }, diagnostics: { available: true }, checks: [] } }));
  assert.equal(result.status, 'needs_attention');
  assert.ok(result.reasons.some(item => item.code === 'readiness.testsUnknown'));
  assert.deepEqual(result.recommendedActions, ['Verify tests', 'Re-run DeployBuddy']);
});

test('readiness remains a separate output and leaves supplied assessment values intact', () => {
  const source = base({ risk: { score: 12, verdict: 'DEPLOY' }, confidence: { score: 28, level: 'low' } });
  const risk = structuredClone(source.risk); const confidence = structuredClone(source.confidence);
  evaluateReleaseReadiness(source);
  assert.deepEqual(source.risk, risk);
  assert.deepEqual(source.confidence, confidence);
});
