import type { DeploymentAssessment } from '../types/assessment';
import type { AssessmentBaseline } from '../types/baseline';
import { isValidRevisionMetadata } from './parseAssessmentBaseline';

export function createAssessmentBaseline(assessment: DeploymentAssessment, recordedAt = new Date().toISOString()): AssessmentBaseline {
  const { signals, risk, confidence, policy } = assessment;
  const findings = new Set<string>();
  const riskFindingCodes: Record<string, string> = {
    friday: 'risk.friday', weekend: 'risk.weekend', late: 'risk.afterHours', night: 'risk.after8pm',
    'large-change': 'risk.largeChange', 'many-errors': 'risk.manyErrors', warnings: 'risk.warnings',
    'failed-tests': 'tests.failed', 'unknown-tests': 'tests.unknown', 'primary-branch': 'risk.dirtyPrimaryBranch',
  };
  for (const reason of risk.reasons) if (riskFindingCodes[reason.code]) findings.add(riskFindingCodes[reason.code]!);
  if (signals.git.available && signals.git.hasUncommittedChanges) findings.add('git.dirty');
  if (signals.git.available && (signals.git.behind ?? 0) > 0) findings.add('git.behind');
  if (signals.diagnostics.available && signals.diagnostics.errors > 0) findings.add('diagnostics.errors');
  if (signals.diagnostics.available && signals.diagnostics.warnings >= 10) findings.add('diagnostics.warnings');
  if (signals.tests.testStatus !== 'known') findings.add('tests.unknown');
  else if ((signals.tests.failed ?? 0) > 0) findings.add('tests.failed');
  for (const kind of ['build', 'lint'] as const) {
    const check = signals.checks?.find(item => item.kind === kind);
    if (check?.result === 'failed') findings.add(`${kind}.failed`);
    else if (check?.result !== 'passed') findings.add(`${kind}.unknown`);
  }
  const violationCodes: Record<string, string> = {
    'risk.maximum': 'policy.riskMaximum', 'risk.questionable': 'policy.riskQuestionable', 'confidence.minimum': 'policy.confidenceMinimum',
    'evidence.tests': 'policy.testsRequired', 'evidence.build': 'policy.buildRequired', 'evidence.lint': 'policy.lintRequired',
    'git.clean': 'policy.cleanRequired', 'git.up-to-date': 'policy.upToDateRequired', 'git.detached-head': 'policy.attachedHeadRequired', 'git.untracked': 'policy.noUntrackedFiles',
    'diagnostics.errors': 'policy.errorsExceeded', 'diagnostics.warnings': 'policy.warningsExceeded',
    'frameworks.required': 'policy.frameworkRequired', 'frameworks.allowed': 'policy.frameworkNotAllowed', 'frameworks.unknown': 'policy.frameworkEvidenceUnknown',
  };
  for (const violation of policy?.violations ?? []) if (violationCodes[violation.code]) findings.add(violationCodes[violation.code]!);
  const rawRevision = signals.git.revision;
  const revision = rawRevision ? {
    ...(rawRevision.sha ? { sha: rawRevision.sha } : {}),
    ...(rawRevision.shortSha ? { shortSha: rawRevision.shortSha } : {}),
    ...(rawRevision.branch ? { branch: rawRevision.branch } : {}),
    ...(rawRevision.detached !== undefined ? { detached: rawRevision.detached } : {}),
  } : undefined;
  return {
    schemaVersion: 1, recordedAt,
    risk: { score: risk.score, verdict: risk.verdict },
    confidence: { score: confidence.score, level: confidence.level },
    policy: { configured: policy?.configured ?? false, passed: policy?.passed ?? true },
    ...(assessment.readiness ? { readiness: assessment.readiness.status } : {}),
    ...(assessment.releaseGates?.configured ? { releaseGates: { configured: true as const, status: assessment.releaseGates.status as 'pass' | 'fail' } } : {}),
    signals: {
      gitDirty: signals.git.available ? signals.git.hasUncommittedChanges : null,
      gitBehind: signals.git.available && Number.isInteger(signals.git.behind) ? signals.git.behind : null,
      errors: signals.diagnostics.available && Number.isInteger(signals.diagnostics.errors) ? signals.diagnostics.errors : null,
      warnings: signals.diagnostics.available && Number.isInteger(signals.diagnostics.warnings) ? signals.diagnostics.warnings : null,
      testsKnown: signals.tests.testStatus === 'known',
      buildKnown: signals.checks?.find(item => item.kind === 'build')?.result === 'passed',
      lintKnown: signals.checks?.find(item => item.kind === 'lint')?.result === 'passed',
    },
    findings: [...findings].sort(),
    ...(revision && isValidRevisionMetadata(revision) ? { revision } : {}),
  };
}
