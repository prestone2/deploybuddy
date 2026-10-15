import type { ReleaseGateEvaluation, ReleaseGateInput } from '../types/release';

const readinessOrder = { ready: 0, needs_attention: 1, insufficient_evidence: 2, blocked: 3 } as const;

/** Evaluates only explicitly configured final release criteria. It never changes its input assessments. */
export function evaluateReleaseGates(input: ReleaseGateInput): ReleaseGateEvaluation {
  const { config } = input;
  if (!config) return { configured: false, status: 'not_configured', violations: [] };
  const violations: ReleaseGateEvaluation['violations'] = [];
  if (input.readiness.status === 'blocked') {
    violations.push({ code: 'release.readinessBlocked', title: 'Release readiness is blocked', detail: 'A BLOCKED readiness assessment cannot pass configured release gates.' });
  } else if (config.requiredReadiness && readinessOrder[input.readiness.status] > readinessOrder[config.requiredReadiness]) {
    violations.push({ code: 'release.requiredReadiness', title: 'Readiness requirement not met', detail: `Release readiness is ${input.readiness.status.toUpperCase().replaceAll('_', ' ')}; this gate requires ${config.requiredReadiness.toUpperCase().replaceAll('_', ' ')} or better.` });
  }
  if (config.maxRisk !== undefined && input.risk.score > config.maxRisk) violations.push({ code: 'release.maxRisk', title: 'Risk threshold exceeded', detail: `Deployment risk is ${input.risk.score}%; release gate allows at most ${config.maxRisk}%.` });
  if (config.minimumConfidence !== undefined && input.confidence.score < config.minimumConfidence) violations.push({ code: 'release.minimumConfidence', title: 'Evidence confidence below minimum', detail: `Evidence confidence is ${input.confidence.score}%; release gate requires at least ${config.minimumConfidence}%.` });
  if (config.requirePolicyPass) {
    if (!input.policy.configured) violations.push({ code: 'release.policyMissing', title: 'Repository policy is required', detail: 'Release gate requires repository policy to pass, but no repository policy is configured.' });
    else if (!input.policy.passed) violations.push({ code: 'release.policyFailed', title: 'Repository policy failed', detail: 'Release gate requires the configured repository policy to pass.' });
  }
  if (config.allowedChangeAttention) {
    if (!input.changes) violations.push({ code: 'release.changeAttentionUnknown', title: 'Change attention is unknown', detail: 'Release gate restricts change attention, but no change assessment is available.' });
    else if (!config.allowedChangeAttention.includes(input.changes.attention.level)) {
      const allowed = config.allowedChangeAttention.map(level => level.toUpperCase()).join(' and ');
      violations.push({ code: 'release.allowedChangeAttention', title: 'Change attention is not allowed', detail: `Change attention is ${input.changes.attention.level.toUpperCase()}; allowed levels are ${allowed}.` });
    }
  }
  return { configured: true, status: violations.length ? 'fail' : 'pass', violations };
}
