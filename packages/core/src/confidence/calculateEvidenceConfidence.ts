import type { EvidenceConfidence } from '../types/confidence';
import type { WorkspaceSignals } from '../types/deployment';

/** Deterministic evidence completeness; it does not change the risk score. */
export function calculateEvidenceConfidence(signals: WorkspaceSignals): EvidenceConfidence {
  const evidence: Array<{ label: string; present: boolean; weight: number }> = [
    { label: 'workspace', present: signals.workspaceFolders.length > 0, weight: 10 },
    { label: 'Git', present: signals.git.available, weight: 25 },
    { label: 'diagnostics', present: signals.diagnostics.available, weight: 25 },
    { label: 'test results', present: signals.tests.testStatus === 'known', weight: 25 },
    { label: 'project profile', present: signals.project?.available ?? false, weight: 10 },
    { label: 'local time', present: Number.isInteger(signals.context.hour) && Number.isInteger(signals.context.dayOfWeek), weight: 5 },
  ];
  const score = evidence.reduce((sum, item) => sum + (item.present ? item.weight : 0), 0);
  return {
    score,
    level: score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low',
    available: evidence.filter(item => item.present).map(item => item.label),
    missing: evidence.filter(item => !item.present).map(item => item.label),
  };
}
