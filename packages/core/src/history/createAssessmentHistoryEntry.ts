import { createAssessmentBaseline } from '../baseline/createAssessmentBaseline';
import type { DeploymentAssessment } from '../types/assessment';
import type { AssessmentHistoryEntry } from '../types/history';

/** Creates a privacy-minimal entry. ID generation and persistence are platform responsibilities. */
export function createAssessmentHistoryEntry(assessment: DeploymentAssessment, id: string, recordedAt = new Date().toISOString()): AssessmentHistoryEntry {
  const baseline = createAssessmentBaseline(assessment, recordedAt);
  const entry: AssessmentHistoryEntry = {
    schemaVersion: 1, id, recordedAt,
    risk: baseline.risk,
    confidence: baseline.confidence,
    policy: baseline.policy,
    ...(baseline.readiness ? { readiness: baseline.readiness } : {}),
    ...(baseline.releaseGates ? { releaseGates: baseline.releaseGates } : {}),
    signals: baseline.signals,
    findings: baseline.findings,
    ...(baseline.revision ? { revision: baseline.revision } : {}),
    ...(assessment.signals.project ? { profile: { frameworks: [...assessment.signals.project.frameworks] } } : {}),
  };
  return entry;
}
