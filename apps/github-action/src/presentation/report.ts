import { analyzeChanges, analyzeGitGuardrails, evaluatePolicy, evaluateReleaseGates, evaluateReleaseReadiness, getConfidenceAwareMessage } from '@deploybuddy/core';
import type { EvidenceConfidence, DeploymentRiskResult, WorkspaceSignals } from '@deploybuddy/core';
import type { DeploymentRecommendation, PolicyEvaluation } from '@deploybuddy/core';
import type { AssessmentDelta } from '@deploybuddy/core';
import type { RevisionMetadata } from '@deploybuddy/core';
import type { ChangeAssessment, ChangedFile } from '@deploybuddy/core';
import type { ReleaseReadiness } from '@deploybuddy/core';
import type { ReleaseGateEvaluation } from '@deploybuddy/core';

export function normalizePullRequestFiles(files: readonly { filename: string; status: string }[]): ChangedFile[] {
  return files.map(file => ({ path: file.filename, status: file.status === 'added' ? 'added' : file.status === 'removed' ? 'deleted' : file.status === 'renamed' ? 'renamed' : file.status === 'modified' ? 'modified' : 'unknown' }));
}

export interface AssessmentSections {
  riskScore: number;
  riskLevel: string;
  verdict: string;
  confidenceScore: number;
  confidenceLevel: string;
  confidenceWarning: string;
  blockers: string[];
  cautions: string[];
  positive: string[];
  unknown: string[];
  recommendations: string[];
  branch: string;
  base: string;
  frameworks: string[];
  omitted: Array<{ section: string; items: string[] }>;
  policy: PolicyEvaluation;
  readiness: ReleaseReadiness;
  releaseGates: ReleaseGateEvaluation;
  delta?: AssessmentDelta;
  revision?: RevisionMetadata;
  pullRequestRevision?: { headSha?: string; baseSha?: string };
  changes?: ChangeAssessment;
}

export interface PresentationInput {
  signals: WorkspaceSignals;
  risk: DeploymentRiskResult;
  confidence: EvidenceConfidence;
  recommendations: DeploymentRecommendation[];
  baseBranch?: string;
  delta?: AssessmentDelta;
  pullRequestRevision?: { headSha?: string; baseSha?: string };
  changedFiles?: ChangedFile[];
}

const SECTION_LIMIT = 5;
const ITEM_LIMIT = 240;
const REPORT_LIMIT = 16_000;
const blockerCodes = new Set(['errors', 'many-errors', 'failed-tests', 'primary-branch']);
const markdownEscape = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/[-\\`*_{}\x5b\x5d()#+.!|]/g, '\\$&');
const safeText = (value: string): string => {
  // eslint-disable-next-line no-control-regex
  const compact = value.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return markdownEscape(compact.length > ITEM_LIMIT ? `${compact.slice(0, ITEM_LIMIT - 1)}…` : compact);
};
// eslint-disable-next-line no-control-regex
const safeCode = (value: string): string => value.replace(/[\u0000-\u001f\u007f-\u009f`]/g, ' ').replaceAll('&', '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, ITEM_LIMIT);

export function limitFindings(name: string, items: string[]): { shown: string[]; omitted?: { section: string; items: string[] } } {
  const unique = [...new Set(items)];
  if (unique.length <= SECTION_LIMIT) return { shown: unique };
  const extra = unique.slice(SECTION_LIMIT);
  const omitted = extra.length > 4 ? [...extra.slice(0, 3), `Additional findings omitted: ${extra.length - 3}.`] : extra;
  return { shown: unique.slice(0, SECTION_LIMIT), omitted: { section: name, items: omitted } };
}

export function buildAssessmentSections(input: PresentationInput, baseBranch = 'unknown'): AssessmentSections {
  const { signals, risk, confidence, recommendations } = input;
  const blockers: string[] = [];
  const cautions: string[] = [];
  const positive: string[] = [];
  const unknown: string[] = [];
  const guardrails = analyzeGitGuardrails(signals.git);
  const policy = evaluatePolicy(signals.policy, { risk, confidence, git: signals.git, diagnostics: signals.diagnostics, tests: signals.tests, checks: signals.checks ?? [], project: signals.project });
  const changes = input.changedFiles ? analyzeChanges(input.changedFiles) : undefined;
  const readiness = evaluateReleaseReadiness({ risk, confidence, policy, changes, signals, recommendations });
  const releaseGates = evaluateReleaseGates({ config: signals.policy?.policy?.release, risk, confidence, policy, changes, readiness });

  for (const reason of risk.reasons) {
    if (reason.code === 'unknown-tests') continue;
    if (blockerCodes.has(reason.code)) blockers.push(reason.message);
    else cautions.push(reason.message);
  }
  for (const finding of guardrails) {
    const item = `${finding.title}: ${finding.detail}`;
    if (finding.severity === 'danger') blockers.push(item);
    else if (finding.severity === 'warning') cautions.push(item);
  }
  if (!signals.git.available) unknown.push('Git state could not be inspected.');
  else if (!signals.git.hasUncommittedChanges) positive.push('Git working tree clean.');
  if (!signals.diagnostics.available) unknown.push('Workspace diagnostics are unavailable in this runner.');
  if (signals.tests.testStatus === 'unknown') unknown.push('Test result unavailable; tests were not run by DeployBuddy.');
  else if ((signals.tests.failed ?? 0) === 0) positive.push(`${signals.tests.passed ?? 0} tests passed in the available result.`);
  if (signals.project?.available && signals.project.frameworks.length) {
    for (const framework of signals.project.frameworks) positive.push(`Framework detected: ${framework}.`);
  } else unknown.push('No project framework was detected.');
  for (const check of signals.checks ?? []) {
    if (check.kind === 'build' && check.status === 'available') positive.push(`Build check available: ${check.command ?? 'command detected'}.`);
    if (check.status !== 'available') unknown.push(`${check.kind} check ${check.status}.`);
  }

  const confidenceWarning = getConfidenceAwareMessage(risk.level, confidence.level, risk.message);
  if (!blockers.length) blockers.push('No blockers observed.');
  if (!cautions.length) cautions.push('No additional cautions observed.');
  if (!positive.length) positive.push('No positive signals confirmed yet.');
  if (!unknown.length) unknown.push('No important signals are currently unknown.');
  const orderedRecommendations = recommendations.slice(0, 3).map(item => item.detail);
  if (!orderedRecommendations.length) orderedRecommendations.push(risk.advice);

  const sections = [
    limitFindings('Blocking', blockers.map(safeText)),
    limitFindings('Cautions', cautions.map(safeText)),
    limitFindings('Looking good', positive.map(safeText)),
    limitFindings('Unknown', unknown.map(safeText)),
    limitFindings('Recommendations', orderedRecommendations.map(safeText)),
  ];
  return {
    riskScore: risk.score,
    riskLevel: risk.level,
    verdict: risk.verdict.replaceAll('_', ' '),
    confidenceScore: confidence.score,
    confidenceLevel: confidence.level.toUpperCase(),
    confidenceWarning: confidenceWarning === risk.message ? '' : confidenceWarning,
    blockers: sections[0]?.shown ?? [],
    cautions: sections[1]?.shown ?? [],
    positive: sections[2]?.shown ?? [],
    unknown: sections[3]?.shown ?? [],
    recommendations: sections[4]?.shown ?? [],
    branch: signals.git.available ? signals.git.branch ?? 'Detached HEAD / unborn' : 'Unavailable',
    base: baseBranch,
    frameworks: signals.project?.frameworks ?? [],
    omitted: sections.flatMap(section => section.omitted ? [section.omitted] : []),
    policy,
    readiness,
    releaseGates,
    delta: input.delta,
    ...(changes ? { changes } : {}),
    revision: signals.git.revision,
    pullRequestRevision: input.pullRequestRevision,
  };
}

export function renderAssessmentMarkdown(report: AssessmentSections): string {
  const uncertainSafe = report.riskLevel === 'safe' && report.confidenceLevel === 'LOW';
  const icon = uncertainSafe ? '⚠️' : report.riskLevel === 'safe' ? '✅' : report.riskLevel === 'caution' ? '⚠️' : '🚨';
  const riskLabel = uncertainSafe ? 'Observed risk' : 'Risk';
  const list = (items: string[]): string => items.map(item => `- ${item}`).join('\n');
  const lines = [
    '## 🚀 DeployBuddy',
    '',
    `### ${report.readiness.status === 'ready' ? '✅' : report.readiness.status === 'needs_attention' ? '⚠️' : report.readiness.status === 'blocked' ? '❌' : '❓'} Release Readiness: ${report.readiness.status.replaceAll('_', ' ').toUpperCase()}`,
    '',
    `**${riskLabel}:** ${report.riskScore}% — ${report.verdict}  `,
    `**Confidence:** ${report.confidenceScore}% — ${report.confidenceLevel}`,
    `**Policy:** ${report.policy.configured ? report.policy.passed ? 'PASS' : 'FAIL' : 'Not configured'}  `,
    `**Change Attention:** ${report.changes?.attention.level.toUpperCase() ?? 'Unknown'}`,
    '',
    '### 🚦 Release Gates',
    !report.releaseGates.configured ? 'Not configured.' : report.releaseGates.status === 'pass' ? '✅ PASSED' : `❌ FAILED — ${report.releaseGates.violations.length} violation(s)\n${list(report.releaseGates.violations.slice(0, SECTION_LIMIT).map(item => safeText(`${item.title}: ${item.detail}`)))}`,
    '',
    ...(report.confidenceWarning ? [`> ${report.confidenceWarning}`, ''] : []),
    `### ${icon} Blocking`, list(report.blockers), '',
    '### ⚠️ Cautions', list(report.cautions), '',
    '### ✅ Looking good', list(report.positive), '',
    '### ❓ Unknown', list(report.unknown), '',
    '### 📋 Policy', report.policy.configured
      ? report.policy.passed ? '✅ Repository deployment policy satisfied.' : `❌ Failed — ${report.policy.violations.length} violations\n${list(report.policy.violations.map(item => safeText(`${item.title}: ${item.detail}`)))}`
      : 'No repository deployment policy is configured.', '',
    ...(report.changes ? [
      '### 🧩 Changed areas',
      `**Attention:** ${report.changes.attention.level.toUpperCase()}`,
      ...report.changes.summary.categories.map(item => `- ${safeText(`${item.category[0]!.toUpperCase()}${item.category.slice(1)}: ${item.count}`)}`),
      ...(report.changes.summary.totalFiles === 0 ? ['- No changed file metadata was available.'] : []),
      ...report.changes.attention.reasons.slice(0, 2).map(item => `- ${safeText(item)}`),
      '',
    ] : []),
    ...(report.delta ? [
      '### 📈 Change from baseline',
      `Risk: ${report.riskScore - report.delta.riskDelta}% → ${report.riskScore}% (${report.delta.riskDelta > 0 ? '+' : ''}${report.delta.riskDelta})`,
      `Confidence: ${report.confidenceScore - report.delta.confidenceDelta}% → ${report.confidenceScore}% (${report.delta.confidenceDelta > 0 ? '+' : ''}${report.delta.confidenceDelta})`,
      `Policy: ${report.delta.previousPolicyPassed === undefined ? 'Not configured' : report.delta.previousPolicyPassed ? 'PASS' : 'FAIL'} → ${report.delta.currentPolicyPassed === undefined ? 'Not configured' : report.delta.currentPolicyPassed ? 'PASS' : 'FAIL'}`,
      ...(report.delta.releaseGatesChanged ? [`Release Gates: ${report.delta.previousReleaseGatesStatus?.toUpperCase()} → ${report.delta.currentReleaseGatesStatus?.toUpperCase()}`] : []),
      ...(report.delta.changedSignals.length ? ['**Evidence changed**', list(report.delta.changedSignals.slice(0, SECTION_LIMIT).map(item => safeText(`${item.code}: ${item.previous ?? 'unknown'} → ${item.current ?? 'unknown'}`)))] : []),
      ...(report.delta.addedFindings.length ? ['**New concerns**', list(report.delta.addedFindings.slice(0, SECTION_LIMIT).map(item => safeText(item.title)))] : []),
      ...(report.delta.resolvedFindings.length ? ['**Resolved**', list(report.delta.resolvedFindings.slice(0, SECTION_LIMIT).map(item => safeText(item.title)))] : []),
      '',
    ] : []),
    '### Recommended next step', list(report.recommendations), '',
  ];
  if (report.omitted.length) {
    lines.push('<details>', '<summary>Additional findings</summary>', '');
    for (const section of report.omitted) lines.push(`#### ${safeText(section.section)}`, list(section.items.map(safeText)), '');
    lines.push('</details>', '');
  }
  lines.push(
    '<details>',
    '<summary>Technical details</summary>',
    '',
    `Branch: \`${safeCode(report.branch)}\`  `,
    `Base: \`${safeCode(report.base)}\`  `,
    ...(report.revision ? [`Commit: \`${safeCode(report.revision.shortSha ?? report.revision.sha ?? '-') }\`  `] : []),
    ...(report.pullRequestRevision?.headSha ? [`Pull request head: \`${safeCode(report.pullRequestRevision.headSha)}\`  `] : []),
    ...(report.pullRequestRevision?.baseSha ? [`Pull request base: \`${safeCode(report.pullRequestRevision.baseSha)}\`  `] : []),
    `Frameworks: ${report.frameworks.length ? report.frameworks.map(item => `\`${safeCode(item)}\``).join(', ') : 'Unknown'}`,
    '',
    '</details>',
    '',
    '_DeployBuddy is advisory. Risk is deterministic; AI does not determine the score._',
  );
  const markdown = lines.join('\n');
  return markdown.length <= REPORT_LIMIT ? markdown : `${markdown.slice(0, REPORT_LIMIT - 40)}\n\n_Report truncated to fit GitHub comment limits._`;
}

export function renderPullRequestComment(report: AssessmentSections, previousBody = ''): string {
  const previousScore = /\*\*Risk:\*\*\s*(\d+)%|\*\*Observed risk:\*\*\s*(\d+)%/.exec(previousBody);
  const oldScore = Number(previousScore?.[1] ?? previousScore?.[2]);
  const improvement = Number.isFinite(oldScore) && oldScore > report.riskScore
    ? `\n\n> Much better. Production has stopped hiding. Risk fell from ${oldScore}% to ${report.riskScore}%.\n`
    : '';
  const body = `<!-- deploybuddy-report -->\n\n${renderAssessmentMarkdown(report)}${improvement}`;
  return body.length <= REPORT_LIMIT ? body : `${body.slice(0, REPORT_LIMIT - 40)}\n\n_Report truncated to fit GitHub comment limits._`;
}
