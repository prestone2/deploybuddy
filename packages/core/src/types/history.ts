import type { AssessmentBaseline } from './baseline';
import type { ConfidenceLevel } from './confidence';
import type { DeploymentVerdict } from './deployment';
import type { DeltaPosture } from './baseline';
import type { RevisionMetadata } from './revision';
import type { ReleaseReadinessStatus } from './readiness';
import type { ReleaseGateStatus } from './release';

export type MinimalAssessmentSignals = AssessmentBaseline['signals'];

/** Local assessment record containing normalized metrics only. */
export interface AssessmentHistoryEntry {
  schemaVersion: 1;
  id: string;
  recordedAt: string;
  risk: { score: number; verdict: DeploymentVerdict };
  confidence: { score: number; level: ConfidenceLevel };
  policy?: { configured: boolean; passed: boolean };
  posture?: DeltaPosture;
  signals: MinimalAssessmentSignals;
  findings: string[];
  profile?: { frameworks: string[] };
  revision?: RevisionMetadata;
  readiness?: ReleaseReadinessStatus;
  releaseGates?: { configured: boolean; status: ReleaseGateStatus };
}

export interface RiskJump {
  fromEntryId: string;
  toEntryId: string;
  fromRevision?: string;
  toRevision?: string;
  riskDelta: number;
  confidenceDelta: number;
  policyChanged: boolean;
  addedFindings: string[];
  resolvedFindings: string[];
}
export type PolicyTransitionKind = 'PASS_TO_FAIL' | 'FAIL_TO_PASS';
export interface PolicyTransition {
  fromEntryId: string;
  toEntryId: string;
  fromRevision?: string;
  toRevision?: string;
  transition: PolicyTransitionKind;
  introducedViolations: string[];
  resolvedViolations: string[];
}
export interface ReadinessTransition {
  fromEntryId: string;
  toEntryId: string;
  previous: ReleaseReadinessStatus;
  current: ReleaseReadinessStatus;
}
export interface ReleaseGateTransition { fromEntryId: string; toEntryId: string; previous: 'pass' | 'fail'; current: 'pass' | 'fail' }
export type RevisionLookup = { status: 'found'; entries: AssessmentHistoryEntry[] } | { status: 'missing' } | { status: 'ambiguous'; entries: AssessmentHistoryEntry[] };
export interface RevisionComparison {
  fromEntryId: string;
  toEntryId: string;
  riskDelta: number;
  confidenceDelta: number;
  policyChanged: boolean;
  addedFindings: string[];
  resolvedFindings: string[];
}

export type HistoryTrendDirection = 'improving' | 'stable' | 'worsening' | 'insufficient-data';
export interface HistoryTrend {
  direction: HistoryTrendDirection;
  olderAverage: number | null;
  recentAverage: number | null;
  sampleSize: number;
  windowSize: number;
}
export interface FrequentFinding { code: string; count: number }
export interface HistorySummary {
  count: number;
  averageRisk: number | null;
  highestRisk: number | null;
  lowestRisk: number | null;
  latestRisk: number | null;
  averageConfidence: number | null;
  policyPassRate: number | null;
  readinessPassRate: number | null;
  readinessCounts: Record<ReleaseReadinessStatus, number>;
  releaseGatePassRate: number | null;
  riskTrend: HistoryTrendDirection;
  confidenceTrend: HistoryTrendDirection;
  frequentFindings: FrequentFinding[];
}

export interface ParsedAssessmentHistory {
  entries: AssessmentHistoryEntry[];
  invalidCount: number;
  unsupportedCount: number;
}
