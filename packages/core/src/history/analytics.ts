import type { AssessmentHistoryEntry, FrequentFinding, HistorySummary, HistoryTrend, ReadinessTransition, ReleaseGateTransition } from '../types/history';
import type { ReleaseReadinessStatus } from '../types/readiness';

const MINIMUM_TREND_SAMPLES = 6;
const TREND_WINDOW = 3;
const STABLE_THRESHOLD = 5;
const ordered = (entries: readonly AssessmentHistoryEntry[]): AssessmentHistoryEntry[] => [...entries].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id));
const average = (values: number[]): number | null => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

/** Compare means of the oldest and newest 3 records; under 6 records is insufficient, under 5 points is stable. */
export function calculateHistoryTrend(values: readonly number[]): HistoryTrend {
  return calculateDirectionTrend(values, false);
}
function calculateDirectionTrend(values: readonly number[], higherIsBetter: boolean): HistoryTrend {
  if (values.length < MINIMUM_TREND_SAMPLES) return { direction: 'insufficient-data', olderAverage: null, recentAverage: null, sampleSize: values.length, windowSize: TREND_WINDOW };
  const older = average(values.slice(0, TREND_WINDOW));
  const recent = average(values.slice(-TREND_WINDOW));
  const difference = (recent ?? 0) - (older ?? 0);
  const improvement = higherIsBetter ? difference > 0 : difference < 0;
  const direction = Math.abs(difference) < STABLE_THRESHOLD ? 'stable' : improvement ? 'improving' : 'worsening';
  return { direction, olderAverage: older, recentAverage: recent, sampleSize: values.length, windowSize: TREND_WINDOW };
}
export function calculateRiskTrend(entries: readonly AssessmentHistoryEntry[]): HistoryTrend { return calculateHistoryTrend(ordered(entries).map(entry => entry.risk.score)); }
export function calculateConfidenceTrend(entries: readonly AssessmentHistoryEntry[]): HistoryTrend { return calculateDirectionTrend(ordered(entries).map(entry => entry.confidence.score), true); }
export function calculatePolicyPassRate(entries: readonly AssessmentHistoryEntry[]): number | null {
  const configured = entries.filter(entry => entry.policy?.configured);
  return configured.length ? Math.round(configured.filter(entry => entry.policy?.passed).length * 100 / configured.length) : null;
}
export function calculateReadinessPassRate(entries: readonly AssessmentHistoryEntry[]): number | null {
  const assessed = entries.filter(entry => entry.readiness !== undefined);
  return assessed.length ? Math.round(assessed.filter(entry => entry.readiness === 'ready').length * 100 / assessed.length) : null;
}
export function calculateReleaseGatePassRate(entries: readonly AssessmentHistoryEntry[]): number | null {
  const configured = entries.filter(entry => entry.releaseGates?.configured);
  return configured.length ? Math.round(configured.filter(entry => entry.releaseGates?.status === 'pass').length * 100 / configured.length) : null;
}
export function findReleaseGateTransitions(entries: readonly AssessmentHistoryEntry[]): ReleaseGateTransition[] {
  const records = ordered(entries).filter(entry => entry.releaseGates?.configured && entry.releaseGates.status !== 'not_configured'); const transitions: ReleaseGateTransition[] = [];
  for (let index = 1; index < records.length; index++) {
    const previous = records[index - 1]!.releaseGates!; const currentEntry = records[index]!; const current = currentEntry.releaseGates!;
    if (previous.status !== current.status) transitions.push({ fromEntryId: records[index - 1]!.id, toEntryId: currentEntry.id, previous: previous.status as 'pass' | 'fail', current: current.status as 'pass' | 'fail' });
  }
  return transitions;
}
export function summarizeReadiness(entries: readonly AssessmentHistoryEntry[]): Record<ReleaseReadinessStatus, number> {
  const counts: Record<ReleaseReadinessStatus, number> = { ready: 0, needs_attention: 0, blocked: 0, insufficient_evidence: 0 };
  for (const entry of entries) if (entry.readiness) counts[entry.readiness]++;
  return counts;
}
export function findReadinessTransitions(entries: readonly AssessmentHistoryEntry[]): ReadinessTransition[] {
  const records = ordered(entries);
  const transitions: ReadinessTransition[] = [];
  for (let index = 1; index < records.length; index++) {
    const previous = records[index - 1]!; const current = records[index]!;
    if (previous.readiness !== undefined && current.readiness !== undefined && previous.readiness !== current.readiness) transitions.push({ fromEntryId: previous.id, toEntryId: current.id, previous: previous.readiness, current: current.readiness });
  }
  return transitions;
}
export function getFrequentFindings(entries: readonly AssessmentHistoryEntry[], limit = 5): FrequentFinding[] {
  const counts = new Map<string, number>();
  for (const entry of entries) for (const code of new Set(entry.findings)) counts.set(code, (counts.get(code) ?? 0) + 1);
  return [...counts].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)).slice(0, Math.max(0, Math.floor(limit)));
}
export function summarizeHistory(entries: readonly AssessmentHistoryEntry[]): HistorySummary {
  const recent = ordered(entries);
  const policyPassRate = calculatePolicyPassRate(recent);
  return {
    count: recent.length,
    averageRisk: average(recent.map(entry => entry.risk.score)),
    highestRisk: recent.length ? Math.max(...recent.map(entry => entry.risk.score)) : null,
    lowestRisk: recent.length ? Math.min(...recent.map(entry => entry.risk.score)) : null,
    latestRisk: recent.at(-1)?.risk.score ?? null,
    averageConfidence: average(recent.map(entry => entry.confidence.score)),
    policyPassRate,
    readinessPassRate: calculateReadinessPassRate(recent),
    releaseGatePassRate: calculateReleaseGatePassRate(recent),
    readinessCounts: summarizeReadiness(recent),
    riskTrend: calculateRiskTrend(recent).direction,
    confidenceTrend: calculateConfidenceTrend(recent).direction,
    frequentFindings: getFrequentFindings(recent),
  };
}
