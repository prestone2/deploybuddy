import type { ConfigParseResult, DeployBuddyConfig } from '../types/config';

export const DEFAULT_CONFIG: DeployBuddyConfig = { thresholds: { safeMax: 30, cautionMax: 65 }, exitOnDanger: true };
export function parseDeployBuddyConfig(text: string | undefined): ConfigParseResult {
  if (text === undefined) return { config: DEFAULT_CONFIG, valid: true, errors: [] };
  if (text.length > 256 * 1024) return { config: DEFAULT_CONFIG, valid: false, errors: ['.deploybuddy.json exceeds the 256 KiB configuration size limit; using default settings.'] };
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { return { config: DEFAULT_CONFIG, valid: false, errors: ['.deploybuddy.json is not valid JSON; using default settings.'] }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { config: DEFAULT_CONFIG, valid: false, errors: ['Configuration must be a JSON object; using default settings.'] };
  const object = value as Record<string, unknown>;
  const errors: string[] = [];
  let safeMax = DEFAULT_CONFIG.thresholds.safeMax;
  let cautionMax = DEFAULT_CONFIG.thresholds.cautionMax;
  if (object.thresholds !== undefined) {
    if (!object.thresholds || typeof object.thresholds !== 'object' || Array.isArray(object.thresholds)) errors.push('thresholds must be an object.');
    else {
      const thresholds = object.thresholds as Record<string, unknown>;
      if (thresholds.safeMax !== undefined) safeMax = typeof thresholds.safeMax === 'number' ? thresholds.safeMax : NaN;
      if (thresholds.cautionMax !== undefined) cautionMax = typeof thresholds.cautionMax === 'number' ? thresholds.cautionMax : NaN;
      if (!Number.isInteger(safeMax) || !Number.isInteger(cautionMax) || safeMax < 0 || cautionMax > 99 || safeMax >= cautionMax) errors.push('thresholds require integer safeMax and cautionMax values with 0 <= safeMax < cautionMax <= 99.');
    }
  }
  const exitOnDanger = object.exitOnDanger === undefined ? true : object.exitOnDanger;
  if (typeof exitOnDanger !== 'boolean') errors.push('exitOnDanger must be a boolean.');
  // Policy has its own strict parser/evaluator; legacy execution settings ignore these known keys.
  const supported = new Set(['thresholds', 'exitOnDanger', 'version', 'risk', 'confidence', 'git', 'diagnostics', 'evidence', 'frameworks']);
  for (const key of Object.keys(object)) if (!supported.has(key)) errors.push(`Unknown configuration key: ${key}.`);
  if (errors.length) return { config: DEFAULT_CONFIG, valid: false, errors: [...errors.map(item => `${item} Using default settings.`)] };
  return { config: { thresholds: { safeMax, cautionMax }, exitOnDanger: exitOnDanger as boolean }, valid: true, errors: [] };
}
