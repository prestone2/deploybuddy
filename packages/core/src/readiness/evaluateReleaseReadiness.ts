import type { ChangeAssessment } from '../types/changes';
import type { EvidenceConfidence } from '../types/confidence';
import type { DeploymentRiskResult, WorkspaceSignals } from '../types/deployment';
import type { PolicyEvaluation } from '../types/policy';
import type { DeploymentRecommendation } from '../recommendations/getDeploymentRecommendations';
import type { ReleaseReadiness, ReleaseReadinessReason } from '../types/readiness';

export interface ReleaseReadinessInput {
  risk: Pick<DeploymentRiskResult, 'score' | 'verdict'>;
  confidence: Pick<EvidenceConfidence, 'score' | 'level'>;
  policy?: Pick<PolicyEvaluation, 'configured' | 'passed'>;
  changes?: Pick<ChangeAssessment, 'attention'>;
  signals?: Pick<WorkspaceSignals, 'tests' | 'diagnostics' | 'checks'>;
  recommendations?: readonly DeploymentRecommendation[];
}

/** Combines already-computed evidence into a release posture; it never changes any input metric. */
export function evaluateReleaseReadiness(input: ReleaseReadinessInput): ReleaseReadiness {
  const reasons: ReleaseReadinessReason[] = [];
  const actions: string[] = [];
  const addAction = (action: string): void => { if (!actions.includes(action)) actions.push(action); };
  const policyFailed = input.policy?.configured === true && !input.policy.passed;
  const riskHigh = input.risk.score >= 66;
  const changeLevel = input.changes?.attention.level;
  const changeCritical = changeLevel === 'critical';
  const confidenceLow = input.confidence.score < 40;

  if (policyFailed) {
    reasons.push({ code: 'readiness.policyFailed', severity: 'error', title: 'Repository policy is not satisfied', detail: 'Resolve the configured repository policy violations before release.' });
    addAction('Resolve repository policy violations');
  }
  if (riskHigh) {
    reasons.push({ code: 'readiness.riskHigh', severity: 'error', title: 'Deployment risk is high', detail: `Observed deployment risk is ${input.risk.score}%.` });
    addAction(input.recommendations?.[0]?.detail ?? 'Reduce deployment risk');
  }
  if (changeCritical) {
    reasons.push({ code: 'readiness.changeCritical', severity: 'error', title: 'Multiple sensitive change areas need review', detail: 'Multiple deployment-sensitive change categories require explicit review.' });
    addAction('Review deployment-sensitive changes');
  }

  if (policyFailed || riskHigh || changeCritical) {
    addAction('Re-run DeployBuddy');
    return { status: 'blocked', reasons, recommendedActions: actions };
  }

  if (confidenceLow) {
    reasons.push({ code: 'readiness.confidenceLow', severity: 'error', title: 'Evidence confidence is low', detail: 'Observed risk is low, but DeployBuddy does not have enough evidence to recommend release.' });
    addAction('Verify the available deployment evidence');
    addAction('Re-run DeployBuddy');
    return { status: 'insufficient_evidence', reasons, recommendedActions: actions };
  }

  let needsAttention = false;
  if (input.risk.verdict === 'QUESTIONABLE' || input.risk.score > 30) {
    needsAttention = true;
    reasons.push({ code: 'readiness.riskQuestionable', severity: 'warning', title: 'Deployment risk needs review', detail: `Deployment risk is ${input.risk.score}% — ${input.risk.verdict.replaceAll('_', ' ')}.` });
    addAction(input.recommendations?.[0]?.detail ?? 'Reduce deployment risk');
  }
  if (changeLevel === 'high') {
    needsAttention = true;
    reasons.push({ code: 'readiness.changeHigh', severity: 'warning', title: 'Deployment-sensitive changes need review', detail: input.changes?.attention.reasons[0] ?? 'Review deployment-sensitive changed areas.' });
    addAction('Review deployment-sensitive changes');
  }
  if (input.confidence.score < 70 || input.confidence.level === 'medium') {
    needsAttention = true;
    reasons.push({ code: 'readiness.confidenceMedium', severity: 'warning', title: 'Evidence confidence could be stronger', detail: `Evidence confidence is ${input.confidence.score}%.` });
    addAction('Verify tests and other unknown evidence');
  }
  if (input.signals?.tests.testStatus === 'unknown') {
    needsAttention = true;
    reasons.push({ code: 'readiness.testsUnknown', severity: 'warning', title: 'Test evidence is unknown', detail: 'Tests have not been verified for this assessment.' });
    addAction('Verify tests');
  }
  if (input.signals && !input.signals.diagnostics.available) {
    needsAttention = true;
    reasons.push({ code: 'readiness.diagnosticsUnknown', severity: 'info', title: 'Workspace diagnostics are unavailable', detail: 'Diagnostic evidence was not available for this assessment.' });
  }
  for (const check of input.signals?.checks ?? []) {
    if (check.kind === 'build' && check.result !== 'passed') { needsAttention = true; reasons.push({ code: 'readiness.buildUnknown', severity: 'info', title: 'Build evidence is unknown', detail: 'A successful build result was not verified.' }); addAction('Verify the build'); }
    if (check.kind === 'lint' && check.result !== 'passed') { needsAttention = true; reasons.push({ code: 'readiness.lintUnknown', severity: 'info', title: 'Lint evidence is unknown', detail: 'A successful lint result was not verified.' }); addAction('Verify lint'); }
  }
  if (needsAttention) {
    if (!actions.length) addAction('Review the assessment findings');
    addAction('Re-run DeployBuddy');
    return { status: 'needs_attention', reasons, recommendedActions: actions };
  }
  return { status: 'ready', reasons: [{ code: 'readiness.ready', severity: 'info', title: 'Release evidence meets the readiness checks', detail: 'Risk, confidence, policy, and change attention meet the readiness criteria.' }], recommendedActions: ['Proceed with the planned release', 'Re-run DeployBuddy before deployment'] };
}
