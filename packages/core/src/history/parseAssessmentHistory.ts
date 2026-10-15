import { ASSESSMENT_FINDING_CODES } from '../baseline/parseAssessmentBaseline';
import type { AssessmentHistoryEntry, ParsedAssessmentHistory } from '../types/history';
import type { AssessmentBaseline } from '../types/baseline';
import { isValidRevisionMetadata, parseAssessmentBaseline } from '../baseline/parseAssessmentBaseline';

const verdicts = new Set(['DEPLOY', 'QUESTIONABLE', 'DO_NOT_DEPLOY']);
const levels = new Set(['low', 'medium', 'high']);
const postures = new Set(['IMPROVED', 'UNCHANGED', 'WORSENED', 'MIXED']);
const readinessStatuses = new Set(['ready', 'needs_attention', 'blocked', 'insufficient_evidence']);
const frameworks = new Set(['laravel', 'vite', 'react', 'vue', 'next.js', 'nuxt', 'svelte', 'angular', 'express', 'nestjs', 'astro']);
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, allowed: string[]): boolean => Object.keys(value).every(key => allowed.includes(key));
const score = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100;

type EntryResult = { status: 'valid'; entry: AssessmentHistoryEntry } | { status: 'invalid' } | { status: 'unsupported' };
export function parseAssessmentHistoryEntry(value: unknown): EntryResult {
  if (!object(value) || !Number.isInteger(value.schemaVersion)) return { status: 'invalid' };
  if (value.schemaVersion !== 1) return { status: 'unsupported' };
  if (!onlyKeys(value, ['schemaVersion', 'id', 'recordedAt', 'risk', 'confidence', 'policy', 'posture', 'signals', 'findings', 'profile', 'revision', 'readiness', 'releaseGates']) || typeof value.id !== 'string' || !/^[a-z0-9-]{8,80}$/i.test(value.id) || typeof value.recordedAt !== 'string' || Number.isNaN(Date.parse(value.recordedAt)) || new Date(value.recordedAt).toISOString() !== value.recordedAt || (value.revision !== undefined && !isValidRevisionMetadata(value.revision)) || (value.readiness !== undefined && !readinessStatuses.has(String(value.readiness))) || (value.releaseGates !== undefined && (!object(value.releaseGates) || !onlyKeys(value.releaseGates, ['configured', 'status']) || value.releaseGates.configured !== true || !['pass', 'fail'].includes(String(value.releaseGates.status))))) return { status: 'invalid' };
  if (!object(value.risk) || !onlyKeys(value.risk, ['score', 'verdict']) || !score(value.risk.score) || !verdicts.has(String(value.risk.verdict))) return { status: 'invalid' };
  if (!object(value.confidence) || !onlyKeys(value.confidence, ['score', 'level']) || !score(value.confidence.score) || !levels.has(String(value.confidence.level))) return { status: 'invalid' };
  if (value.policy !== undefined && (!object(value.policy) || !onlyKeys(value.policy, ['configured', 'passed']) || typeof value.policy.configured !== 'boolean' || typeof value.policy.passed !== 'boolean')) return { status: 'invalid' };
  if (value.posture !== undefined && !postures.has(String(value.posture))) return { status: 'invalid' };
  const baselineLike = { schemaVersion: 1, recordedAt: value.recordedAt, risk: value.risk, confidence: value.confidence, policy: value.policy ?? { configured: false, passed: true }, signals: value.signals, findings: value.findings, ...(value.revision ? { revision: value.revision } : {}), ...(value.readiness ? { readiness: value.readiness } : {}), ...(value.releaseGates ? { releaseGates: value.releaseGates } : {}) };
  if (parseAssessmentBaseline(baselineLike as AssessmentBaseline).status !== 'valid') return { status: 'invalid' };
  if (value.findings instanceof Array && !value.findings.every(code => typeof code === 'string' && ASSESSMENT_FINDING_CODES.has(code))) return { status: 'invalid' };
  if (value.profile !== undefined && (!object(value.profile) || !onlyKeys(value.profile, ['frameworks']) || !Array.isArray(value.profile.frameworks) || !value.profile.frameworks.every(item => typeof item === 'string' && frameworks.has(item)))) return { status: 'invalid' };
  return { status: 'valid', entry: value as unknown as AssessmentHistoryEntry };
}

/** Filters corrupt/future entries and deduplicates by stable locally generated ID. */
export function parseAssessmentHistory(value: unknown): ParsedAssessmentHistory {
  if (!object(value) || !onlyKeys(value, ['schemaVersion', 'entries']) || !Array.isArray(value.entries)) return { entries: [], invalidCount: 1, unsupportedCount: 0 };
  if (value.schemaVersion !== 1) return { entries: [], invalidCount: 0, unsupportedCount: value.entries.length || 1 };
  const parsed: AssessmentHistoryEntry[] = [];
  const seen = new Set<string>();
  let invalidCount = 0; let unsupportedCount = 0;
  for (const raw of value.entries) {
    const result = parseAssessmentHistoryEntry(raw);
    if (result.status === 'invalid') { invalidCount++; continue; }
    if (result.status === 'unsupported') { unsupportedCount++; continue; }
    if (seen.has(result.entry.id)) { invalidCount++; continue; }
    seen.add(result.entry.id); parsed.push(result.entry);
  }
  parsed.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id));
  return { entries: parsed.slice(-100), invalidCount, unsupportedCount };
}
