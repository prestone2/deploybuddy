import * as vscode from 'vscode';
import { calculateDeploymentRisk } from '../core/calculateDeploymentRisk';
import { getGitSignals, unavailableGit } from './gitService';
import { getDiagnosticSignals } from './diagnosticsService';
import { getTestSignals } from './testingService';
import { getContextSignals } from './contextService';
import type { DeploymentRiskResult, GitSignals, WorkspaceSignals } from '../types/deployment';
export interface DeploymentSnapshot { signals: WorkspaceSignals; result: DeploymentRiskResult }
export interface DeploymentSession {
  readonly latest: DeploymentSnapshot | undefined;
  getSnapshot(fresh?: boolean): Promise<DeploymentSnapshot>;
  dispose(): void;
}
async function readGitWithTimeout(): Promise<GitSignals> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([getGitSignals(), new Promise<GitSignals>(resolve => { timer = setTimeout(() => resolve(unavailableGit('Git signal collection timed out. Try checking again once Git finishes loading.')), 5000); })]); }
  finally { if (timer) clearTimeout(timer); }
}
/** Commands and chat share one authoritative snapshot and collection pipeline. */
export function createDeploymentSession(onSnapshot: (snapshot: DeploymentSnapshot) => void, onCollecting: () => void): DeploymentSession {
  let latest: DeploymentSnapshot | undefined;
  let collecting: Promise<DeploymentSnapshot> | undefined;
  let revision = 0;
  let disposed = false;
  const folders = vscode.workspace.onDidChangeWorkspaceFolders?.(() => { latest = undefined; revision++; onCollecting(); });
  return {
    get latest() { return latest; },
    getSnapshot(fresh = false) {
      if (!fresh && latest) return Promise.resolve(latest);
      if (collecting) return collecting;
      onCollecting();
      const current = revision;
      collecting = (async () => {
        const signals: WorkspaceSignals = { workspaceFolders: vscode.workspace.workspaceFolders?.map(f => f.name) ?? [], git: await readGitWithTimeout(), diagnostics: getDiagnosticSignals(), tests: getTestSignals(), context: getContextSignals() };
        const snapshot = { signals, result: calculateDeploymentRisk(signals) };
        if (disposed || current !== revision) throw new Error('Workspace changed while collecting signals. Please run the check again.');
        latest = snapshot;
        onSnapshot(snapshot);
        return snapshot;
      })().finally(() => { collecting = undefined; });
      return collecting;
    },
    dispose() { disposed = true; revision++; folders?.dispose(); },
  };
}
