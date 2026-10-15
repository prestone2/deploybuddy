import type { PolicyEvaluation, ReleaseGateConfig } from './policy';
import type { DeploymentRiskResult } from './deployment';
import type { EvidenceConfidence } from './confidence';
import type { ChangeAssessment } from './changes';
import type { ReleaseReadiness } from './readiness';

export type ReleaseGateStatus = 'pass' | 'fail' | 'not_configured';
export interface ReleaseGateViolation { code: string; title: string; detail: string }
export interface ReleaseGateEvaluation { configured: boolean; status: ReleaseGateStatus; violations: ReleaseGateViolation[] }
export interface ReleaseGateInput {
  config?: ReleaseGateConfig;
  risk: DeploymentRiskResult;
  confidence: EvidenceConfidence;
  policy: PolicyEvaluation;
  changes?: ChangeAssessment;
  readiness: ReleaseReadiness;
}
