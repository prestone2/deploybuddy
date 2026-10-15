import type { DeploymentAssessment } from '../types/assessment';
import type { AssessmentBaseline, AssessmentDelta, DeltaFinding, DeltaPosture, SignalDelta } from '../types/baseline';
import { createAssessmentBaseline } from './createAssessmentBaseline';

const titles: Record<string, string> = {
  'risk.friday': 'Friday timing risk appeared', 'risk.weekend': 'Weekend timing risk appeared', 'risk.afterHours': 'After-hours timing risk appeared', 'risk.after8pm': 'Late-night timing risk appeared',
  'risk.largeChange': 'Large change set', 'risk.manyErrors': 'At least five diagnostics errors', 'risk.warnings': 'High diagnostics warning count', 'risk.dirtyPrimaryBranch': 'Primary branch has uncommitted changes',
  'git.dirty': 'Working tree became dirty', 'git.behind': 'Branch is behind upstream', 'diagnostics.errors': 'Workspace diagnostics contain errors',
  'diagnostics.warnings': 'Workspace has many warnings', 'tests.unknown': 'Test evidence is unavailable', 'tests.failed': 'Tests are failing',
  'build.failed': 'Build check failed', 'build.unknown': 'Build evidence is unavailable', 'lint.failed': 'Lint check failed', 'lint.unknown': 'Lint evidence is unavailable',
  'policy.testsRequired': 'Tests required by policy are not verified', 'policy.buildRequired': 'Build required by policy is not verified', 'policy.lintRequired': 'Lint required by policy is not verified',
  'policy.riskMaximum': 'Repository risk limit exceeded', 'policy.riskQuestionable': 'Questionable risk is not allowed by policy', 'policy.confidenceMinimum': 'Minimum evidence confidence not met',
  'policy.cleanRequired': 'Clean working tree required by policy', 'policy.upToDateRequired': 'Up-to-date branch required by policy', 'policy.errorsExceeded': 'Policy diagnostic error limit exceeded', 'policy.warningsExceeded': 'Policy warning limit exceeded',
  'policy.attachedHeadRequired': 'Policy requires an attached branch', 'policy.noUntrackedFiles': 'Untracked files are not allowed by policy', 'policy.frameworkRequired': 'Required framework is missing', 'policy.frameworkNotAllowed': 'Framework is outside the policy allowlist', 'policy.frameworkEvidenceUnknown': 'Framework evidence is unavailable',
};
const classify = (riskDelta: number, confidenceDelta: number, previous: AssessmentBaseline, current: AssessmentBaseline, added: DeltaFinding[], resolved: DeltaFinding[], changedSignals: SignalDelta[]): DeltaPosture => {
  const policyWorsened = current.policy.configured && !current.policy.passed && (!previous.policy.configured || previous.policy.passed);
  const policyImproved = previous.policy.configured && !previous.policy.passed && current.policy.configured && current.policy.passed;
  if (riskDelta > 0 || policyWorsened) return 'WORSENED';
  const worsenedSignal = changedSignals.some(item => {
    if (['errors', 'warnings', 'gitBehind'].includes(item.code) && typeof item.previous === 'number' && typeof item.current === 'number') return item.current > item.previous;
    if (item.code === 'gitDirty') return item.previous === false && item.current === true;
    if (['testsKnown', 'buildKnown', 'lintKnown'].includes(item.code)) return item.previous === true && item.current === false;
    return false;
  });
  const improvedSignal = changedSignals.some(item => {
    if (['errors', 'warnings', 'gitBehind'].includes(item.code) && typeof item.previous === 'number' && typeof item.current === 'number') return item.current < item.previous;
    if (item.code === 'gitDirty') return item.previous === true && item.current === false;
    if (['testsKnown', 'buildKnown', 'lintKnown'].includes(item.code)) return item.previous === false && item.current === true;
    return false;
  });
  const negative = added.length > 0 || worsenedSignal || confidenceDelta < 0;
  const positive = riskDelta < 0 || policyImproved || resolved.length > 0 || improvedSignal || confidenceDelta > 0;
  if (negative && positive) return 'MIXED';
  if (riskDelta < 0 && negative) return 'MIXED';
  if (riskDelta < 0 || policyImproved) return 'IMPROVED';
  if (negative) return worsenedSignal || added.length ? 'WORSENED' : 'MIXED';
  if (positive) return 'IMPROVED';
  return 'UNCHANGED';
};

export function compareAssessments(previous: AssessmentBaseline, currentAssessment: DeploymentAssessment | AssessmentBaseline): AssessmentDelta {
  const current = 'schemaVersion' in currentAssessment ? currentAssessment : createAssessmentBaseline(currentAssessment);
  const previousFindings = new Set(previous.findings);
  const currentFindings = new Set(current.findings);
  const toFinding = (code: string): DeltaFinding => ({ code, title: titles[code] ?? code });
  const addedFindings = [...currentFindings].filter(code => !previousFindings.has(code)).sort().map(toFinding);
  const resolvedFindings = [...previousFindings].filter(code => !currentFindings.has(code)).sort().map(toFinding);
  const changedSignals: SignalDelta[] = [];
  for (const code of ['gitDirty', 'gitBehind', 'errors', 'warnings', 'testsKnown', 'buildKnown', 'lintKnown'] as const) {
    const before = previous.signals[code]; const after = current.signals[code];
    if (before !== after) changedSignals.push({ code, previous: before, current: after } as SignalDelta);
  }
  const riskDelta = current.risk.score - previous.risk.score;
  const confidenceDelta = current.confidence.score - previous.confidence.score;
  const delta: AssessmentDelta = {
    riskDelta, confidenceDelta,
    riskDirection: riskDelta > 0 ? 'worse' : riskDelta < 0 ? 'better' : 'unchanged',
    confidenceDirection: confidenceDelta > 0 ? 'more-evidence' : confidenceDelta < 0 ? 'less-evidence' : 'unchanged',
    verdictChanged: previous.risk.verdict !== current.risk.verdict,
    previousVerdict: previous.risk.verdict, currentVerdict: current.risk.verdict,
    policyChanged: previous.policy.configured !== current.policy.configured || previous.policy.passed !== current.policy.passed,
    previousPolicyPassed: previous.policy.configured ? previous.policy.passed : undefined,
    currentPolicyPassed: current.policy.configured ? current.policy.passed : undefined,
    addedFindings, resolvedFindings, changedSignals, posture: 'UNCHANGED',
    ...(previous.readiness !== undefined && current.readiness !== undefined ? {
      readinessChanged: previous.readiness !== current.readiness,
      previousReadiness: previous.readiness,
      currentReadiness: current.readiness,
    } : {}),
    ...(previous.releaseGates && current.releaseGates ? {
      releaseGatesChanged: previous.releaseGates.status !== current.releaseGates.status,
      previousReleaseGatesStatus: previous.releaseGates.status,
      currentReleaseGatesStatus: current.releaseGates.status,
    } : {}),
  };
  delta.posture = classify(riskDelta, confidenceDelta, previous, current, addedFindings, resolvedFindings, changedSignals);
  return delta;
}
