import { findMaterialRiskChanges, findPolicyTransitions, findReadinessTransitions, findReleaseGateTransitions, getConfidenceAwareMessage, MATERIAL_RISK_CHANGE_THRESHOLD, summarizeHistory, type AssessmentDelta, type AssessmentHistoryEntry, type ChangeAssessment, type DeploymentRiskResult, type EvidenceConfidence, type PolicyEvaluation, type PolicyParseResult, type ReleaseGateConfig, type ReleaseGateEvaluation, type ReleaseReadiness, type WorkspaceSignals } from '@deploybuddy/core';
import type { OutputChannel } from 'vscode';
import type { AIVerdictResponse } from '../types/ai';
export function formatDeploymentReport(s: WorkspaceSignals, r: DeploymentRiskResult, confidence?: EvidenceConfidence, policy?: PolicyEvaluation, delta?: AssessmentDelta, changes?: ChangeAssessment, readiness?: ReleaseReadiness, releaseGates?: ReleaseGateEvaluation): string {
  const count = (n: number | null): string => n === null ? 'Unknown' : String(n);
  const lines = ['DeployBuddy Deployment Check', '', `Risk: ${r.score}%`, `Verdict: ${r.verdict.replaceAll('_', ' ')}`,
    ...(confidence ? [`Confidence: ${confidence.score}% — ${confidence.level.toUpperCase()}`] : []),
    ...(readiness ? [`Release Readiness: ${readiness.status.replaceAll('_', ' ').toUpperCase()}`, ...readiness.reasons.map(item => `- ${item.detail}`), 'Recommended actions:', ...readiness.recommendedActions.map((item, index) => `${index + 1}. ${item}`)] : []),
    ...(releaseGates ? ['', 'Release Gates', `Status: ${releaseGates.status.replaceAll('_', ' ').toUpperCase()}`, ...releaseGates.violations.map(item => `- ${item.title}: ${item.detail}`)] : []),
    ...(confidence && getConfidenceAwareMessage(r.level, confidence.level, r.message) !== r.message ? [`Confidence note: ${getConfidenceAwareMessage(r.level, confidence.level, r.message)}`] : []), '', 'Workspace',
    `Folders: ${s.workspaceFolders.join(', ') || 'None open'}`, `Branch: ${s.git.available ? s.git.branch ?? 'Detached HEAD / unborn branch' : 'Unavailable'}`,
    `Modified files: ${s.git.available ? s.git.modifiedFiles : 'Unknown'}`, `Staged files: ${s.git.available ? s.git.stagedFiles : 'Unknown'}`,
    `Untracked files: ${s.git.available ? s.git.untrackedFiles : 'Unknown'}`, `Distinct changed files: ${s.git.available ? s.git.changedFiles : 'Unknown'}`,
    `Working tree: ${!s.git.available ? 'Unknown' : s.git.hasUncommittedChanges ? 'Dirty' : 'Clean'}`];
  for (const repo of s.git.repositories) lines.push(`Repository: ${repo.root}`, `  Branch: ${repo.branch ?? 'Detached HEAD / unborn branch'}; modified: ${repo.modifiedFiles}; staged: ${repo.stagedFiles}; untracked: ${repo.untrackedFiles}; distinct changed: ${repo.changedFiles}`);
  if (s.git.note) lines.push(`Git note: ${s.git.note}`);
  lines.push('', 'Diagnostics', `Errors: ${s.diagnostics.available ? s.diagnostics.errors : 'Unknown'}`, `Warnings: ${s.diagnostics.available ? s.diagnostics.warnings : 'Unknown'}`);
  if (s.diagnostics.note) lines.push(`Diagnostics note: ${s.diagnostics.note}`);
  lines.push('', 'Tests', `Status: ${s.tests.testStatus}`, `Passed: ${count(s.tests.passed)}`, `Failed: ${count(s.tests.failed)}`, `Skipped: ${count(s.tests.skipped)}`, `Not run: ${count(s.tests.notRun)}`, s.tests.note,
    '', 'Context', `${s.context.day}, ${String(s.context.hour).padStart(2, '0')}:${String(s.context.minute).padStart(2, '0')} (local time)`, `Checked: ${s.context.timestamp}`,
    '', 'Why?', ...(r.reasons.length ? r.reasons.map(reason => `- ${reason.message} (+${reason.points})`) : ['- No configured risk rules were triggered.']), '', 'Advice:', r.advice,
    ...(policy ? ['', 'Policy', `Source: ${policy.configured ? '.deploybuddy.json' : 'Not configured'}`, `Status: ${!policy.configured ? 'Not configured' : policy.passed ? 'PASSED' : `FAILED — ${policy.violations.length} violation(s)`}`, ...policy.violations.map(item => `- ${item.title}: ${item.detail}`)] : []),
    ...(delta ? ['', 'Change from baseline', `Risk delta: ${delta.riskDelta > 0 ? '+' : ''}${delta.riskDelta} (${delta.riskDirection})`, `Confidence delta: ${delta.confidenceDelta > 0 ? '+' : ''}${delta.confidenceDelta} (${delta.confidenceDirection})`, `Policy: ${delta.previousPolicyPassed === undefined ? 'Not configured' : delta.previousPolicyPassed ? 'PASS' : 'FAIL'} → ${delta.currentPolicyPassed === undefined ? 'Not configured' : delta.currentPolicyPassed ? 'PASS' : 'FAIL'}`, `Posture: ${delta.posture}`, 'Evidence changed:', ...(delta.changedSignals.length ? delta.changedSignals.map(item => `- ${item.code}: ${item.previous === null ? 'unknown' : item.previous} → ${item.current === null ? 'unknown' : item.current}`) : ['- None']), ...(delta.addedFindings.length ? ['New concerns:', ...delta.addedFindings.map(item => `- ${item.title}`)] : []), ...(delta.resolvedFindings.length ? ['Resolved:', ...delta.resolvedFindings.map(item => `- ${item.title}`)] : [])] : []),
    ...(changes ? ['', formatChangedAreas(changes)] : []),
    '', 'Advisory only. Missing signals are not evidence of safety. No tests, builds, or deployments were executed.');
  return lines.join('\n');
}
export function writeDeploymentReport(channel: OutputChannel, s: WorkspaceSignals, r: DeploymentRiskResult, confidence?: EvidenceConfidence, policy?: PolicyEvaluation, delta?: AssessmentDelta, changes?: ChangeAssessment, readiness?: ReleaseReadiness, releaseGates?: ReleaseGateEvaluation): void { channel.clear(); channel.appendLine(formatDeploymentReport(s, r, confidence, policy, delta, changes, readiness, releaseGates)); }
export function formatReadinessReport(readiness: ReleaseReadiness, risk: number, confidence: number, policy: PolicyEvaluation, changeAttention: string): string {
  return ['Release Readiness', '', `Status: ${readiness.status.replaceAll('_', ' ').toUpperCase()}`, `Risk: ${risk}%`, `Confidence: ${confidence}%`, `Policy: ${policy.configured ? policy.passed ? 'PASS' : 'FAIL' : 'Not configured'}`, `Change Attention: ${changeAttention.toUpperCase()}`, '', 'Reasons:', ...(readiness.reasons.length ? readiness.reasons.map(item => `- ${item.detail}`) : ['No additional concerns.']), '', 'Recommended actions:', ...readiness.recommendedActions.map((item, index) => `${index + 1}. ${item}`)].join('\n');
}
export function formatReleaseGatesReport(gates: ReleaseGateEvaluation, readiness: ReleaseReadiness, risk: number, confidence: number, policy: PolicyEvaluation, changeAttention: string, config?: ReleaseGateConfig): string {
  if (!gates.configured) return 'Release Gates\n\nStatus:\nNOT CONFIGURED\n\nNo release gates are configured in .deploybuddy.json.';
  const violations = new Map(gates.violations.map(item => [item.code, item]));
  const checks: string[] = [];
  const result = (code: string, detail: string): string => `${violations.has(code) || violations.has('release.readinessBlocked') && code === 'release.requiredReadiness' ? '✗' : '✓'} ${detail}${violations.get(code) ? ` — ${violations.get(code)!.detail}` : ''}`;
  if (config?.requiredReadiness || violations.has('release.readinessBlocked')) checks.push(result('release.requiredReadiness', `Readiness is ${readiness.status.replaceAll('_', ' ').toUpperCase()}`));
  if (config?.maxRisk !== undefined) checks.push(result('release.maxRisk', `Risk <= ${config.maxRisk}% (${risk}%)`));
  if (config?.minimumConfidence !== undefined) checks.push(result('release.minimumConfidence', `Confidence >= ${config.minimumConfidence}% (${confidence}%)`));
  if (config?.requirePolicyPass) checks.push(result(policy.configured ? 'release.policyFailed' : 'release.policyMissing', `Policy ${policy.configured ? policy.passed ? 'passes' : 'fails' : 'not configured'}`));
  if (config?.allowedChangeAttention) checks.push(result('release.allowedChangeAttention', `Change attention ${changeAttention.toUpperCase()} (allowed: ${config.allowedChangeAttention.map(value => value.toUpperCase()).join(', ')})`));
  return ['Release Gates', '', `Status:\n${gates.status.toUpperCase()}`, '', 'Configured gates:', ...(checks.length ? checks : ['No criteria configured.']), '', 'Violations:', ...(gates.violations.length ? gates.violations.map(item => `- ${item.detail}`) : ['None.'])].join('\n');
}
export function formatChangedAreas(changes: ChangeAssessment): string {
  const labels = changes.summary.categories.map(item => `${item.category[0]!.toUpperCase()}${item.category.slice(1)}:\n${item.count} file${item.count === 1 ? '' : 's'}`);
  return ['Changed Areas', '', `${changes.summary.totalFiles} file${changes.summary.totalFiles === 1 ? '' : 's'}`, '', `${changes.attention.level.toUpperCase()} ATTENTION`, '', ...(labels.length ? labels : ['No changed file metadata is available.']), '', ...changes.attention.reasons.map(item => `- ${item}`), '', 'No file contents were inspected.'].join('\n');
}
export function formatPolicyReport(parsed: PolicyParseResult | undefined, policy: PolicyEvaluation): string {
  if (!policy.configured) return 'No repository deployment policy is configured.';
  if (parsed && !parsed.valid) return `Invalid DeployBuddy policy:\n${parsed.errors.map(error => `${error.path}: ${error.message}`).join('\n')}`;
  return [`DeployBuddy Policy`, '', `Source: .deploybuddy.json`, `Status: ${policy.passed ? 'PASSED' : 'FAILED'}`, `Rules evaluated: ${policy.rulesEvaluated}`, `Violations: ${policy.violations.length}`, ...policy.violations.map(item => `- ${item.title}: ${item.detail}`)].join('\n');
}

export function formatHistoryReport(entries: AssessmentHistoryEntry[]): string {
  const summary = summarizeHistory(entries);
  const trend = (value: typeof summary.riskTrend): string => value === 'insufficient-data' ? 'Insufficient data' : `${value[0]!.toUpperCase()}${value.slice(1)}`;
  const recent = [...entries].slice(-10).reverse();
  const rows = recent.map(entry => `${entry.recordedAt.slice(0, 16).replace('T', ' ')}  ${(entry.revision?.shortSha ?? '-').padEnd(9)} ${entry.risk.score}%  ${entry.confidence.score}%  ${!entry.policy?.configured ? 'N/A' : entry.policy.passed ? 'PASS' : 'FAIL'}`);
  return ['DeployBuddy History', '', 'Recent Assessments', ...(rows.length ? ['Date                 Commit    Risk  Confidence  Policy', ...rows] : ['No explicit assessments have been recorded.']), '', 'Summary', `Assessments: ${summary.count}`, `Average risk: ${summary.averageRisk === null ? 'Unknown' : `${summary.averageRisk}%`}`, `Highest risk: ${summary.highestRisk === null ? 'Unknown' : `${summary.highestRisk}%`}`, `Latest risk: ${summary.latestRisk === null ? 'Unknown' : `${summary.latestRisk}%`}`, `Average confidence: ${summary.averageConfidence === null ? 'Unknown' : `${summary.averageConfidence}%`}`, `Policy pass rate: ${summary.policyPassRate === null ? 'Not configured' : `${summary.policyPassRate}%`}`, `Release readiness pass rate: ${summary.readinessPassRate === null ? 'No readiness history' : `${summary.readinessPassRate}%`}`, `Release gate pass rate: ${summary.releaseGatePassRate === null ? 'No release gate history' : `${summary.releaseGatePassRate}%`}`, `Readiness: READY ${summary.readinessCounts.ready}, NEEDS ATTENTION ${summary.readinessCounts.needs_attention}, BLOCKED ${summary.readinessCounts.blocked}, INSUFFICIENT EVIDENCE ${summary.readinessCounts.insufficient_evidence}`, `Risk trend: ${trend(summary.riskTrend)}`, `Confidence trend: ${trend(summary.confidenceTrend)}`, '', 'Most common concerns', ...(summary.frequentFindings.length ? summary.frequentFindings.map((finding, index) => `${index + 1}. ${finding.code} — ${finding.count}`) : ['None recorded.'])].join('\n');
}

export function formatRecentRiskChanges(entries: AssessmentHistoryEntry[]): string {
  const jumps = findMaterialRiskChanges(entries);
  const transitions = findPolicyTransitions(entries);
  const readinessTransitions = findReadinessTransitions(entries);
  const releaseGateTransitions = findReleaseGateTransitions(entries);
  const entry = (id: string): AssessmentHistoryEntry => entries.find(item => item.id === id)!;
  const lines = ['Recent Risk Changes', '', ...(jumps.length ? jumps.slice().reverse().map(item => {
    const from = entry(item.fromEntryId); const to = entry(item.toEntryId);
    return [`${to.revision?.shortSha ?? to.revision?.sha ?? 'Unknown revision'}`, `Risk ${item.riskDelta > 0 ? `increased ${item.riskDelta} points` : `decreased ${Math.abs(item.riskDelta)} points`}.`, `${from.risk.score}% → ${to.risk.score}%`, ...(item.addedFindings.length ? ['New concerns:', ...item.addedFindings.map(code => `- ${code}`)] : []), ...(item.resolvedFindings.length ? ['Resolved:', ...item.resolvedFindings.map(code => `- ${code}`)] : [])].join('\n');
  }) : [`No material risk change of ${MATERIAL_RISK_CHANGE_THRESHOLD} points or more is recorded.`])];
  const failed = transitions.filter(item => item.transition === 'PASS_TO_FAIL');
  if (failed.length) { const first = failed[0]!; lines.push('', `Policy first began failing at: ${first.toRevision ?? 'Unknown revision'}`, ...(first.introducedViolations.length ? first.introducedViolations.map(code => `- ${code}`) : ['- Specific introduced policy findings are unavailable.'])); }
  for (const transition of transitions.filter(item => item.transition === 'FAIL_TO_PASS')) lines.push('', `Policy recovered at: ${transition.toRevision ?? 'Unknown revision'}.`);
  for (const transition of readinessTransitions) lines.push('', `Release readiness changed: ${transition.previous.toUpperCase()} → ${transition.current.toUpperCase()}.`);
  for (const transition of releaseGateTransitions) lines.push('', `Release gates changed: ${transition.previous.toUpperCase()} → ${transition.current.toUpperCase()}.`);
  return lines.join('\n');
}

export function appendAIVerdict(channel: OutputChannel, response: AIVerdictResponse): void {
  channel.appendLine('\nAI Verdict');
  if (response.status === 'success') {
    channel.appendLine(`\nHeadline:\n${response.verdict.headline}\n\nExplanation:\n${response.verdict.explanation}\n\nRecommended action:\n${response.verdict.recommendedAction}`);
  } else {
    channel.appendLine(response.status === 'disabled' ? 'Disabled — using deterministic fallback.' : 'Unavailable — using deterministic fallback.');
  }
}
