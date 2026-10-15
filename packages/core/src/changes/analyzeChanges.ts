import { CHANGE_CATEGORY_ORDER, classifyChangedPath, getChangeFindings, normalizeChangedFiles } from './classifyChangedFiles';
import type { ChangeAssessment, ChangeAttentionLevel, ChangeCategory, ChangeSummary, ChangedFile } from '../types/changes';

export function analyzeChanges(files: readonly ChangedFile[]): ChangeAssessment {
  const normalized = normalizeChangedFiles(files);
  const counts = new Map<ChangeCategory, number>();
  for (const file of normalized) counts.set(classifyChangedPath(file.path), (counts.get(classifyChangedPath(file.path)) ?? 0) + 1);
  const categories = CHANGE_CATEGORY_ORDER.filter(category => counts.has(category)).map(category => ({ category, count: counts.get(category)! }));
  const summary: ChangeSummary = { totalFiles: normalized.length, categories, findings: getChangeFindings(normalized) };
  const present = new Set(categories.map(item => item.category));
  const high = ['database', 'ci', 'infrastructure', 'security'].filter(category => present.has(category as ChangeCategory));
  const moderate = ['dependencies', 'api', 'configuration', 'backend', 'mobile'].filter(category => present.has(category as ChangeCategory));
  let level: ChangeAttentionLevel = 'low';
  if (high.length >= 2) level = 'critical';
  else if (high.length > 0) level = 'high';
  else if (moderate.length > 0 || (present.has('frontend') && present.has('tests'))) level = 'moderate';
  const reasons: string[] = [];
  if (present.has('database')) reasons.push('Database migrations or schemas changed.');
  if (present.has('dependencies')) reasons.push('Dependency definitions changed.');
  if (present.has('ci')) reasons.push('CI/CD configuration changed.');
  if (present.has('infrastructure')) reasons.push('Infrastructure or deployment configuration changed.');
  if (present.has('security')) reasons.push('Security-sensitive areas changed.');
  if (present.has('api')) reasons.push('API or schema paths changed.');
  if (present.has('configuration')) reasons.push('Application configuration changed.');
  if (level === 'critical') reasons.unshift('Multiple deployment-sensitive areas changed together.');
  if (!reasons.length && summary.findings.some(item => item.code === 'docs.only')) reasons.push('Only documentation paths changed.');
  if (!reasons.length && !normalized.length) reasons.push('No changed file metadata is available.');
  if (!reasons.length) reasons.push(present.has('tests') ? 'Test and implementation paths changed without higher-attention categories.' : 'Changed paths appear to be ordinary application areas.');
  return { summary, attention: { level, reasons } };
}
