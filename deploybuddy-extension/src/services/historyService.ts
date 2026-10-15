import { parseAssessmentHistory, type AssessmentHistoryEntry, type ParsedAssessmentHistory } from '@deploybuddy/core';
import { getWorkspaceBaselineKey } from './baselineService';
import type { Memento } from 'vscode';

const keyFor = (root: string): string => getWorkspaceBaselineKey(root).replace('deploybuddy.baseline.v1.', 'deploybuddy.history.v1.');
export function readWorkspaceHistory(state: Memento, root: string | undefined): ParsedAssessmentHistory {
  if (!root) return { entries: [], invalidCount: 0, unsupportedCount: 0 };
  const stored = state.get<unknown>(keyFor(root));
  return stored === undefined ? { entries: [], invalidCount: 0, unsupportedCount: 0 } : parseAssessmentHistory(stored);
}
export async function appendWorkspaceHistory(state: Memento, root: string, entry: AssessmentHistoryEntry): Promise<{ duplicate: boolean; history: ParsedAssessmentHistory }> {
  const history = readWorkspaceHistory(state, root);
  if (history.entries.some(item => item.id === entry.id)) return { duplicate: true, history };
  const entries = [...history.entries, entry].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id)).slice(-100);
  await state.update(keyFor(root), { schemaVersion: 1, entries });
  return { duplicate: false, history: { entries, invalidCount: history.invalidCount, unsupportedCount: history.unsupportedCount } };
}
export function clearWorkspaceHistory(state: Memento, root: string): Thenable<void> { return state.update(keyFor(root), undefined); }
