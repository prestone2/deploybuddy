import type { DeploymentRiskResult, DiagnosticSignals, GitSignals, TestSignals } from './deployment';
import type { CheckResult } from './checks';
import type { EvidenceConfidence } from './confidence';
import type { ProjectProfile } from './project';
import type { ReleaseReadinessStatus } from './readiness';
import type { ChangeAttentionLevel } from './changes';

export type FrameworkKind = 'laravel' | 'vite' | 'react' | 'vue' | 'next.js' | 'nuxt' | 'svelte' | 'angular' | 'express' | 'nestjs' | 'astro';

export interface ReleaseGateConfig {
  requiredReadiness?: ReleaseReadinessStatus;
  maxRisk?: number;
  minimumConfidence?: number;
  allowedChangeAttention?: ChangeAttentionLevel[];
  requirePolicyPass?: boolean;
}

export interface DeployBuddyPolicy {
  version: 1;
  risk?: { maxScore?: number; failOnQuestionable?: boolean };
  confidence?: { minimumScore?: number };
  git?: { requireClean?: boolean; requireUpToDate?: boolean; allowDetachedHead?: boolean; allowUntracked?: boolean };
  diagnostics?: { maxErrors?: number; maxWarnings?: number };
  evidence?: { requireTests?: boolean; requireBuild?: boolean; requireLint?: boolean };
  frameworks?: { allowed?: FrameworkKind[]; required?: FrameworkKind[] };
  release?: ReleaseGateConfig;
}

export interface PolicyValidationError { path: string; message: string }
export interface PolicyParseResult {
  configured: boolean;
  valid: boolean;
  policy?: DeployBuddyPolicy;
  errors: PolicyValidationError[];
}
export interface PolicyViolation { code: string; severity: 'warning' | 'error'; title: string; detail: string }
export interface PolicyEvaluation { configured: boolean; passed: boolean; rulesEvaluated: number; violations: PolicyViolation[] }
export interface PolicyEvidence {
  risk: DeploymentRiskResult;
  confidence: EvidenceConfidence;
  git: GitSignals;
  diagnostics: DiagnosticSignals;
  tests: TestSignals;
  checks: CheckResult[];
  project: ProjectProfile | undefined;
}
