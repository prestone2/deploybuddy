const test = require('node:test');
const assert = require('node:assert/strict');

test('Core root export exposes supported public operations and declarations', () => {
  const core = require('@deploybuddy/core');
  for (const name of [
    'calculateDeploymentRisk', 'calculateEvidenceConfidence', 'analyzeGitGuardrails',
    'getDeploymentRecommendations', 'detectProjectProfile', 'parseDeployBuddyPolicy',
    'evaluatePolicy', 'evaluateReleaseReadiness', 'evaluateReleaseGates',
    'classifyChangedPath', 'compareAssessments', 'summarizeHistory',
  ]) assert.equal(typeof core[name], 'function', `${name} should be exported at the package root`);
  assert.ok(require('node:fs').existsSync(require.resolve('@deploybuddy/core').replace(/index\.js$/, 'index.d.ts')));
});

test('Core package exports do not expose internal subpaths', () => {
  assert.throws(() => require('@deploybuddy/core/risk/calculateDeploymentRisk'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
});
