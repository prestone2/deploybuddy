import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { analyzeChanges, calculateDeploymentRisk, calculateEvidenceConfidence, collectWorkspaceSignals, evaluatePolicy, evaluateReleaseGates, evaluateReleaseReadiness, getDeploymentRecommendations, type ChangeAssessment, type DeploymentRiskResult, type EvidenceConfidence, type PolicyEvaluation, type ReleaseGateEvaluation, type ReleaseReadiness, type WorkspaceSignals } from '@deploybuddy/core';
import { VSCodeWorkspaceAdapter } from './vscodeWorkspaceAdapter';
export interface DeploymentSnapshot { sessionId: string; signals: WorkspaceSignals; result: DeploymentRiskResult; confidence: EvidenceConfidence; policy: PolicyEvaluation; changes: ChangeAssessment; readiness: ReleaseReadiness; releaseGates: ReleaseGateEvaluation }
export interface DeploymentSession {
  readonly latest: DeploymentSnapshot | undefined;
  getSnapshot(fresh?: boolean): Promise<DeploymentSnapshot>;
  dispose(): void;
}
/** Commands and chat share one authoritative snapshot and collection pipeline. */
export function createDeploymentSession(onSnapshot: (snapshot: DeploymentSnapshot) => void, onCollecting: () => void): DeploymentSession {
  let latest: DeploymentSnapshot | undefined;
  let collecting: Promise<DeploymentSnapshot> | undefined;
  let revision = 0;
  let disposed = false;
  const adapter = new VSCodeWorkspaceAdapter();
  const folders = vscode.workspace.onDidChangeWorkspaceFolders?.(() => { latest = undefined; revision++; adapter.invalidate(); onCollecting(); });
  return {
    get latest() { return latest; },
    getSnapshot(fresh = false) {
      if (!fresh && latest) return Promise.resolve(latest);
      if (collecting) return collecting;
      onCollecting();
      const current = revision;
      collecting = (async () => {
        const signals: WorkspaceSignals = await collectWorkspaceSignals(adapter);
        const changes = analyzeChanges(await adapter.getChangedFiles?.() ?? []);
        const result = calculateDeploymentRisk(signals);
        const confidence = calculateEvidenceConfidence(signals);
        const policy = evaluatePolicy(signals.policy, { risk: result, confidence, git: signals.git, diagnostics: signals.diagnostics, tests: signals.tests, checks: signals.checks ?? [], project: signals.project });
        const readiness = evaluateReleaseReadiness({ risk: result, confidence, policy, changes, signals, recommendations: getDeploymentRecommendations(signals) });
        const releaseGates = evaluateReleaseGates({ config: signals.policy?.policy?.release, risk: result, confidence, policy, changes, readiness });
        const snapshot = { sessionId: randomUUID(), signals, result, confidence, policy, changes, readiness, releaseGates };
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
