import type { DeploymentRecommendation } from '../recommendations/getDeploymentRecommendations';
import type { EvidenceConfidence } from './confidence';
import type { DeploymentRiskResult, WorkspaceSignals } from './deployment';
import type { PolicyEvaluation } from './policy';
import type { ReleaseReadiness } from './readiness';
import type { ReleaseGateEvaluation } from './release';

/** Shared result envelope; platform behavior may inspect policy without rewriting risk or confidence. */
export interface DeploymentAssessment {
  signals: WorkspaceSignals;
  risk: DeploymentRiskResult;
  confidence: EvidenceConfidence;
  recommendations: DeploymentRecommendation[];
  policy?: PolicyEvaluation;
  readiness: ReleaseReadiness;
  releaseGates?: ReleaseGateEvaluation;
}
