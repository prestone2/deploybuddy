import type { DeploymentVerdict } from './deployment';
import type { ConfidenceLevel } from './confidence';
import type { RevisionMetadata } from './revision';
import type { ReleaseReadinessStatus } from './readiness';
import type { ReleaseGateStatus } from './release';

/** Minimal, versioned comparison data. It must never contain workspace paths or content. */
export interface AssessmentBaseline {
  schemaVersion: 1;
  recordedAt: string;
  risk: { score: number; verdict: DeploymentVerdict };
  confidence: { score: number; level: ConfidenceLevel };
  policy: { configured: boolean; passed: boolean };
  signals: {
    gitDirty: boolean | null;
    gitBehind: number | null;
    errors: number | null;
    warnings: number | null;
    testsKnown: boolean;
    buildKnown: boolean;
    lintKnown: boolean;
  };
  findings: string[];
  revision?: RevisionMetadata;
  readiness?: ReleaseReadinessStatus;
  releaseGates?: { configured: true; status: Exclude<ReleaseGateStatus, 'not_configured'> };
}

export type DeltaPosture = 'IMPROVED' | 'UNCHANGED' | 'WORSENED' | 'MIXED';
export type DeltaDirection = 'better' | 'worse' | 'unchanged';
export type ConfidenceDirection = 'more-evidence' | 'less-evidence' | 'unchanged';
export interface DeltaFinding { code: string; title: string }
export interface SignalDelta { code: string; previous: boolean | number | null; current: boolean | number | null }
export interface AssessmentDelta {
  riskDelta: number;
  confidenceDelta: number;
  riskDirection: DeltaDirection;
  confidenceDirection: ConfidenceDirection;
  verdictChanged: boolean;
  previousVerdict?: DeploymentVerdict;
  currentVerdict: DeploymentVerdict;
  policyChanged: boolean;
  previousPolicyPassed?: boolean;
  currentPolicyPassed?: boolean;
  addedFindings: DeltaFinding[];
  resolvedFindings: DeltaFinding[];
  changedSignals: SignalDelta[];
  posture: DeltaPosture;
  readinessChanged?: boolean;
  previousReadiness?: ReleaseReadinessStatus;
  currentReadiness?: ReleaseReadinessStatus;
  releaseGatesChanged?: boolean;
  previousReleaseGatesStatus?: 'pass' | 'fail';
  currentReleaseGatesStatus?: 'pass' | 'fail';
}

export type BaselineParseResult =
  | { status: 'valid'; baseline: AssessmentBaseline }
  | { status: 'invalid'; message: string }
  | { status: 'unsupported'; message: string };
