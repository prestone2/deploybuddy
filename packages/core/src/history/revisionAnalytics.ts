import type { AssessmentHistoryEntry, PolicyTransition, RevisionComparison, RevisionLookup, RiskJump } from '../types/history';

/** Adjacent assessments must differ by this many risk points to count as material. */
export const MATERIAL_RISK_CHANGE_THRESHOLD = 15;
const ordered = (entries: readonly AssessmentHistoryEntry[]): AssessmentHistoryEntry[] => [...entries].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id));
const revision = (entry: AssessmentHistoryEntry): string | undefined => entry.revision?.shortSha ?? entry.revision?.sha;
const difference = (from: AssessmentHistoryEntry, to: AssessmentHistoryEntry) => ({
  riskDelta: to.risk.score - from.risk.score,
  confidenceDelta: to.confidence.score - from.confidence.score,
  policyChanged: Boolean(from.policy?.configured && to.policy?.configured && from.policy.passed !== to.policy.passed),
  addedFindings: to.findings.filter(code => !from.findings.includes(code)).sort(),
  resolvedFindings: from.findings.filter(code => !to.findings.includes(code)).sort(),
});

export function findRiskJumps(entries: readonly AssessmentHistoryEntry[], threshold = MATERIAL_RISK_CHANGE_THRESHOLD): RiskJump[] {
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) throw new RangeError('Risk change threshold must be an integer between 1 and 100.');
  const records = ordered(entries); const jumps: RiskJump[] = [];
  for (let index = 1; index < records.length; index++) {
    const from = records[index - 1]!; const to = records[index]!; const change = difference(from, to);
    if (Math.abs(change.riskDelta) < threshold) continue;
    jumps.push({ fromEntryId: from.id, toEntryId: to.id, ...(revision(from) ? { fromRevision: revision(from) } : {}), ...(revision(to) ? { toRevision: revision(to) } : {}), ...change });
  }
  return jumps;
}
export function findMaterialRiskChanges(entries: readonly AssessmentHistoryEntry[], threshold = MATERIAL_RISK_CHANGE_THRESHOLD): RiskJump[] { return findRiskJumps(entries, threshold); }

export function findPolicyTransitions(entries: readonly AssessmentHistoryEntry[]): PolicyTransition[] {
  const records = ordered(entries); const transitions: PolicyTransition[] = [];
  for (let index = 1; index < records.length; index++) {
    const from = records[index - 1]!; const to = records[index]!;
    if (!from.policy?.configured || !to.policy?.configured || from.policy.passed === to.policy.passed) continue;
    const change = difference(from, to);
    transitions.push({ fromEntryId: from.id, toEntryId: to.id, ...(revision(from) ? { fromRevision: revision(from) } : {}), ...(revision(to) ? { toRevision: revision(to) } : {}), transition: from.policy.passed ? 'PASS_TO_FAIL' : 'FAIL_TO_PASS', introducedViolations: change.addedFindings.filter(code => code.startsWith('policy.')), resolvedViolations: change.resolvedFindings.filter(code => code.startsWith('policy.')) });
  }
  return transitions;
}

export function findRevisionAssessment(entries: readonly AssessmentHistoryEntry[], query: string): RevisionLookup {
  const normalized = query.toLowerCase();
  if (!/^[a-f0-9]{7,64}$/i.test(normalized)) return { status: 'missing' };
  let records = ordered(entries).filter(entry => {
    const sha = entry.revision?.sha?.toLowerCase(); const short = entry.revision?.shortSha?.toLowerCase();
    return sha === normalized || short === normalized || Boolean(sha?.startsWith(normalized)) || Boolean(short && normalized.startsWith(short));
  });
  if (!records.length) return { status: 'missing' };
  const exactFull = records.filter(entry => entry.revision?.sha?.toLowerCase() === normalized);
  if (exactFull.length) records = records.filter(entry => !entry.revision?.sha || entry.revision.sha.toLowerCase() === normalized || Boolean(entry.revision.shortSha && normalized.startsWith(entry.revision.shortSha.toLowerCase())));
  const distinct = new Set(records.map(entry => entry.revision?.sha ?? (normalized.length >= 40 && entry.revision?.shortSha && normalized.startsWith(entry.revision.shortSha.toLowerCase()) ? normalized : entry.revision?.shortSha)));
  if (distinct.size > 1) return { status: 'ambiguous', entries: records };
  return { status: 'found', entries: records };
}

export function compareRevisionEntries(from: AssessmentHistoryEntry, to: AssessmentHistoryEntry): RevisionComparison {
  return { fromEntryId: from.id, toEntryId: to.id, ...difference(from, to) };
}
