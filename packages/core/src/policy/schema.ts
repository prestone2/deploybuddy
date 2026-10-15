import type { FrameworkKind } from '../types/policy';

export const POLICY_GROUPS = ['risk', 'confidence', 'git', 'diagnostics', 'evidence', 'frameworks', 'release'] as const;
export const POLICY_LEGACY_CONFIG_KEYS = ['thresholds', 'exitOnDanger'] as const;
export const POLICY_KEYS: Record<(typeof POLICY_GROUPS)[number], readonly string[]> = {
  risk: ['maxScore', 'failOnQuestionable'],
  confidence: ['minimumScore'],
  git: ['requireClean', 'requireUpToDate', 'allowDetachedHead', 'allowUntracked'],
  diagnostics: ['maxErrors', 'maxWarnings'],
  evidence: ['requireTests', 'requireBuild', 'requireLint'],
  frameworks: ['allowed', 'required'],
  release: ['requiredReadiness', 'maxRisk', 'minimumConfidence', 'allowedChangeAttention', 'requirePolicyPass'],
};
export const FRAMEWORK_KINDS: readonly FrameworkKind[] = ['laravel', 'vite', 'react', 'vue', 'next.js', 'nuxt', 'svelte', 'angular', 'express', 'nestjs', 'astro'];
