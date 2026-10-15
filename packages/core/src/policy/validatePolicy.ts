import type { DeployBuddyPolicy, FrameworkKind, PolicyParseResult, PolicyValidationError } from '../types/policy';
import { FRAMEWORK_KINDS, POLICY_GROUPS, POLICY_KEYS, POLICY_LEGACY_CONFIG_KEYS } from './schema';
import type { ChangeAttentionLevel } from '../types/changes';
import type { ReleaseReadinessStatus } from '../types/readiness';

const frameworks = new Set<FrameworkKind>(FRAMEWORK_KINDS);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const groups = new Set<string>(POLICY_GROUPS);
const legacyConfigKeys = new Set<string>(POLICY_LEGACY_CONFIG_KEYS);
const readinessStatuses = new Set<ReleaseReadinessStatus>(['ready', 'needs_attention', 'insufficient_evidence', 'blocked']);
const changeAttentionLevels = new Set<ChangeAttentionLevel>(['low', 'moderate', 'high', 'critical']);
const keys: Record<string, Set<string>> = Object.fromEntries(Object.entries(POLICY_KEYS).map(([group, fields]) => [group, new Set(fields)]));

export function validatePolicy(value: unknown, configured = true): PolicyParseResult {
  if (!configured) return { configured: false, valid: true, errors: [] };
  const errors: PolicyValidationError[] = [];
  if (!object(value)) return { configured: true, valid: false, errors: [{ path: '$', message: 'Expected a JSON object.' }] };
  for (const key of Object.keys(value)) if (key !== 'version' && !groups.has(key) && !legacyConfigKeys.has(key)) errors.push({ path: key, message: 'Unknown policy key.' });
  if (value.version !== 1) errors.push({ path: 'version', message: 'Expected supported policy version 1.' });
  for (const group of groups) {
    const raw = value[group];
    if (raw === undefined) continue;
    if (!object(raw)) { errors.push({ path: group, message: 'Expected an object.' }); continue; }
    for (const key of Object.keys(raw)) if (!keys[group]?.has(key)) errors.push({ path: `${group}.${key}`, message: 'Unknown policy key.' });
    for (const [key, item] of Object.entries(raw)) {
      if (!keys[group]?.has(key)) continue;
      const at = `${group}.${key}`;
      if (group === 'frameworks' && (key === 'allowed' || key === 'required')) {
        if (!Array.isArray(item) || item.some(name => typeof name !== 'string' || !frameworks.has(name as FrameworkKind))) {
          errors.push({ path: at, message: `Expected an array of supported framework names: ${[...frameworks].join(', ')}.` });
        } else if (new Set(item).size !== item.length) errors.push({ path: at, message: 'Framework names must not be repeated.' });
      } else if (group === 'release' && key === 'requiredReadiness') {
        if (typeof item !== 'string' || !readinessStatuses.has(item as ReleaseReadinessStatus)) errors.push({ path: at, message: `Expected one of: ${[...readinessStatuses].join(', ')}.` });
      } else if (group === 'release' && key === 'allowedChangeAttention') {
        if (!Array.isArray(item) || item.length === 0 || item.some(level => typeof level !== 'string' || !changeAttentionLevels.has(level as ChangeAttentionLevel))) errors.push({ path: at, message: `Expected a non-empty array containing only: ${[...changeAttentionLevels].join(', ')}.` });
        else if (new Set(item).size !== item.length) errors.push({ path: at, message: 'Change attention levels must not be repeated.' });
      } else if (key === 'maxScore' || key === 'minimumScore' || key === 'maxErrors' || key === 'maxWarnings' || key === 'maxRisk' || key === 'minimumConfidence') {
        if (typeof item !== 'number' || !Number.isInteger(item) || item < 0 || item > 100) errors.push({ path: at, message: 'Expected an integer between 0 and 100.' });
      } else if (typeof item !== 'boolean') errors.push({ path: at, message: 'Expected a boolean.' });
    }
  }
  const frameworkRules = object(value.frameworks) ? value.frameworks : {};
  const allowed = Array.isArray(frameworkRules.allowed) ? frameworkRules.allowed : undefined;
  const required = Array.isArray(frameworkRules.required) ? frameworkRules.required : undefined;
  if (allowed && required) for (const framework of required) if (!allowed.includes(framework)) errors.push({ path: 'frameworks.required', message: `Required framework '${String(framework)}' is excluded by frameworks.allowed.` });
  if (errors.length) return { configured: true, valid: false, errors };
  return { configured: true, valid: true, policy: value as unknown as DeployBuddyPolicy, errors: [] };
}

export function parseDeployBuddyPolicy(text: string | undefined): PolicyParseResult {
  if (text === undefined) return validatePolicy(undefined, false);
  if (text.length > 256 * 1024) return { configured: true, valid: false, errors: [{ path: '$', message: '.deploybuddy.json exceeds the 256 KiB configuration size limit.' }] };
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; }
  catch { return { configured: true, valid: false, errors: [{ path: '$', message: '.deploybuddy.json is not valid JSON.' }] }; }
  if (!object(parsed)) return validatePolicy(parsed);
  const keysPresent = Object.keys(parsed).some(key => !legacyConfigKeys.has(key));
  return keysPresent ? validatePolicy(parsed) : validatePolicy(undefined, false);
}
