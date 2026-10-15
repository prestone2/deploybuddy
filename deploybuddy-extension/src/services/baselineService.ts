import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseAssessmentBaseline, type AssessmentBaseline, type BaselineParseResult } from '@deploybuddy/core';
import type { Memento } from 'vscode';

/** The root path is hashed for scope and never stored in baseline data. */
export function getWorkspaceBaselineKey(root: string): string {
  return `deploybuddy.baseline.v1.${createHash('sha256').update(path.resolve(root)).digest('hex')}`;
}
export function readWorkspaceBaseline(state: Memento, root: string | undefined): BaselineParseResult | undefined {
  if (!root) return undefined;
  const value = state.get<unknown>(getWorkspaceBaselineKey(root));
  return value === undefined ? undefined : parseAssessmentBaseline(value);
}
export function saveWorkspaceBaseline(state: Memento, root: string, baseline: AssessmentBaseline): Thenable<void> {
  return state.update(getWorkspaceBaselineKey(root), baseline);
}
export function clearWorkspaceBaseline(state: Memento, root: string): Thenable<void> {
  return state.update(getWorkspaceBaselineKey(root), undefined);
}
