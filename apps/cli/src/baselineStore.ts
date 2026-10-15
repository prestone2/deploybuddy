import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { parseAssessmentBaseline, type AssessmentBaseline, type BaselineParseResult } from '@deploybuddy/core';

/** Baselines are scoped to a normalized project path but the path itself is never persisted. */
export function getBaselinePath(cwd: string, env: NodeJS.ProcessEnv = process.env): string {
  const base = process.platform === 'win32' ? env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local') : process.platform === 'darwin' ? path.join(homedir(), 'Library', 'Caches') : env.XDG_CACHE_HOME || path.join(homedir(), '.cache');
  const scope = createHash('sha256').update(path.resolve(cwd)).digest('hex');
  return path.join(base, 'DeployBuddy', 'baselines', `${scope}.json`);
}

export async function readLocalBaseline(cwd: string): Promise<BaselineParseResult | undefined> {
  try { return parseAssessmentBaseline(JSON.parse(await readFile(getBaselinePath(cwd), 'utf8')) as unknown); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; return { status: 'invalid', message: 'The local DeployBuddy baseline could not be read.' }; }
}

export async function saveLocalBaseline(cwd: string, baseline: AssessmentBaseline): Promise<void> {
  const target = getBaselinePath(cwd);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(baseline, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, target);
}

export async function clearLocalBaseline(cwd: string): Promise<void> { await rm(getBaselinePath(cwd), { force: true }); }
