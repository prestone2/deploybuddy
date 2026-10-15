import type { AssessmentBaseline } from '../types/baseline';

const verdicts = ['DEPLOY', 'QUESTIONABLE', 'DO_NOT_DEPLOY'];
const levels = ['low', 'medium', 'high'];
const readinessStatuses = ['ready', 'needs_attention', 'blocked', 'insufficient_evidence'];
export const ASSESSMENT_FINDING_CODES: ReadonlySet<string> = new Set(['risk.friday', 'risk.weekend', 'risk.afterHours', 'risk.after8pm', 'risk.largeChange', 'risk.manyErrors', 'risk.warnings', 'risk.dirtyPrimaryBranch', 'git.dirty', 'git.behind', 'diagnostics.errors', 'diagnostics.warnings', 'tests.unknown', 'tests.failed', 'build.failed', 'build.unknown', 'lint.failed', 'lint.unknown', 'policy.riskMaximum', 'policy.riskQuestionable', 'policy.confidenceMinimum', 'policy.testsRequired', 'policy.buildRequired', 'policy.lintRequired', 'policy.cleanRequired', 'policy.upToDateRequired', 'policy.attachedHeadRequired', 'policy.noUntrackedFiles', 'policy.errorsExceeded', 'policy.warningsExceeded', 'policy.frameworkRequired', 'policy.frameworkNotAllowed', 'policy.frameworkEvidenceUnknown']);
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function keysOnly(value: Record<string, unknown>, allowed: string[]): boolean { return Object.keys(value).every(key => allowed.includes(key)); }
function score(value: unknown): value is number { return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100; }
export function isValidRevisionMetadata(value: unknown): boolean {
  if (!object(value) || !keysOnly(value, ['sha', 'shortSha', 'branch', 'detached']) || !Object.keys(value).length) return false;
  if (value.sha !== undefined && (typeof value.sha !== 'string' || !/^[a-f0-9]{40,64}$/i.test(value.sha))) return false;
  if (value.shortSha !== undefined && (typeof value.shortSha !== 'string' || !/^[a-f0-9]{7,12}$/i.test(value.shortSha) || (typeof value.sha === 'string' && !value.sha.toLowerCase().startsWith(value.shortSha.toLowerCase())))) return false;
  if (value.branch !== undefined && (typeof value.branch !== 'string' || value.branch.length > 255 || /[\r\n]/.test(value.branch))) return false;
  return value.detached === undefined || typeof value.detached === 'boolean';
}

/** Strictly validates stored baseline data and rejects unrecognized fields/codes. */
export function parseAssessmentBaseline(value: unknown): { status: 'valid'; baseline: AssessmentBaseline } | { status: 'invalid' | 'unsupported'; message: string } {
  if (!object(value) || !Number.isInteger(value.schemaVersion)) return { status: 'invalid', message: 'Baseline data is malformed.' };
  if (value.schemaVersion !== 1) return { status: 'unsupported', message: `Baseline schema version ${String(value.schemaVersion)} is not supported.` };
  if (!keysOnly(value, ['schemaVersion', 'recordedAt', 'risk', 'confidence', 'policy', 'signals', 'findings', 'revision', 'readiness', 'releaseGates']) || typeof value.recordedAt !== 'string' || Number.isNaN(Date.parse(value.recordedAt)) || new Date(value.recordedAt).toISOString() !== value.recordedAt || (value.revision !== undefined && !isValidRevisionMetadata(value.revision)) || (value.readiness !== undefined && !readinessStatuses.includes(String(value.readiness))) || (value.releaseGates !== undefined && (!object(value.releaseGates) || !keysOnly(value.releaseGates, ['configured', 'status']) || value.releaseGates.configured !== true || !['pass', 'fail'].includes(String(value.releaseGates.status))))) return { status: 'invalid', message: 'Baseline metadata is malformed.' };
  if (!object(value.risk) || !keysOnly(value.risk, ['score', 'verdict']) || !score(value.risk.score) || !verdicts.includes(String(value.risk.verdict))) return { status: 'invalid', message: 'Baseline risk data is malformed.' };
  if (!object(value.confidence) || !keysOnly(value.confidence, ['score', 'level']) || !score(value.confidence.score) || !levels.includes(String(value.confidence.level))) return { status: 'invalid', message: 'Baseline confidence data is malformed.' };
  if (!object(value.policy) || !keysOnly(value.policy, ['configured', 'passed']) || typeof value.policy.configured !== 'boolean' || typeof value.policy.passed !== 'boolean') return { status: 'invalid', message: 'Baseline policy data is malformed.' };
  const allowedSignals = ['gitDirty', 'gitBehind', 'errors', 'warnings', 'testsKnown', 'buildKnown', 'lintKnown'];
  if (!object(value.signals) || !keysOnly(value.signals, allowedSignals)) return { status: 'invalid', message: 'Baseline signals are malformed.' };
  const s = value.signals;
  if (!(s.gitDirty === null || typeof s.gitDirty === 'boolean') || !(s.gitBehind === null || Number.isInteger(s.gitBehind) && (s.gitBehind as number) >= 0) || !(s.errors === null || Number.isInteger(s.errors) && (s.errors as number) >= 0) || !(s.warnings === null || Number.isInteger(s.warnings) && (s.warnings as number) >= 0) || typeof s.testsKnown !== 'boolean' || typeof s.buildKnown !== 'boolean' || typeof s.lintKnown !== 'boolean') return { status: 'invalid', message: 'Baseline signal values are malformed.' };
  if (!Array.isArray(value.findings) || !value.findings.every(code => typeof code === 'string' && ASSESSMENT_FINDING_CODES.has(code)) || new Set(value.findings).size !== value.findings.length) return { status: 'invalid', message: 'Baseline findings are malformed.' };
  return { status: 'valid', baseline: value as unknown as AssessmentBaseline };
}
