import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AssessmentHistoryEntry } from '@deploybuddy/core';
import { parseAssessmentHistory } from '@deploybuddy/core';
import { getBaselinePath } from './baselineStore';

export const MAX_HISTORY_ENTRIES = 100;
export interface HistoryReadResult { entries: AssessmentHistoryEntry[]; invalidCount: number; unsupportedCount: number; warning?: string }
export interface HistoryAppendResult extends HistoryReadResult { duplicate: boolean }
export function getHistoryPath(cwd: string): string { return getBaselinePath(cwd).replace(/\.json$/, '.history.json'); }

export async function readLocalHistory(cwd: string): Promise<HistoryReadResult> {
  try {
    const parsed = parseAssessmentHistory(JSON.parse(await readFile(getHistoryPath(cwd), 'utf8')) as unknown);
    return { ...parsed, ...(parsed.invalidCount || parsed.unsupportedCount ? { warning: 'Some malformed or unsupported history entries were skipped.' } : {}) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { entries: [], invalidCount: 0, unsupportedCount: 0 };
    return { entries: [], invalidCount: 1, unsupportedCount: 0, warning: 'DeployBuddy history storage is malformed and was ignored.' };
  }
}

export async function appendLocalHistory(cwd: string, entry: AssessmentHistoryEntry): Promise<HistoryAppendResult> {
  const read = await readLocalHistory(cwd);
  if (read.entries.some(item => item.id === entry.id)) return { ...read, duplicate: true };
  const entries = [...read.entries, entry].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id)).slice(-MAX_HISTORY_ENTRIES);
  const target = getHistoryPath(cwd);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, target);
  return { entries, invalidCount: read.invalidCount, unsupportedCount: read.unsupportedCount, ...(read.warning ? { warning: read.warning } : {}), duplicate: false };
}

export async function clearLocalHistory(cwd: string): Promise<void> { await rm(getHistoryPath(cwd), { force: true }); }
