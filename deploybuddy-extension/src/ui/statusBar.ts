import * as vscode from 'vscode';
import type { AssessmentDelta, HistoryTrendDirection, ReleaseGateEvaluation, ReleaseReadiness } from '@deploybuddy/core';
import type { DeploymentRiskResult, GitSignals, PolicyEvaluation } from '../types/deployment';
export function createStatusBar(): { item: vscode.StatusBarItem; update: (result: DeploymentRiskResult, git?: GitSignals, policy?: PolicyEvaluation, delta?: AssessmentDelta, riskTrend?: HistoryTrendDirection, readiness?: ReleaseReadiness, confidence?: number, changeAttention?: string, releaseGates?: ReleaseGateEvaluation) => void } {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  item.name = 'DeployBuddy'; item.text = '$(rocket) DeployBuddy';
  item.command = 'deploybuddy.checkDeployment';
  item.tooltip = 'Check whether deploying this workspace is a terrible idea.';
  item.show();
  return { item, update(result, git, policy, delta, riskTrend, readiness, confidence, changeAttention, releaseGates) {
    item.text = `$(${result.level === 'safe' ? 'check' : result.level === 'caution' ? 'warning' : 'error'}) DeployBuddy ${result.score}%`;
    item.tooltip = `Check whether deploying this workspace is a terrible idea.\nRelease Readiness: ${readiness?.status.replaceAll('_', ' ').toUpperCase() ?? 'Unknown'}\nDeployment risk: ${result.score}%${confidence === undefined ? '' : `\nConfidence: ${confidence}%`}${releaseGates?.configured ? `\nRelease Gates: ${releaseGates.status.toUpperCase()}${releaseGates.violations.length ? ` (${releaseGates.violations.length} violations)` : ''}` : ''}${policy?.configured ? `\nPolicy: ${policy.passed ? 'PASS' : 'FAIL'}` : '\nPolicy: Not configured'}${changeAttention ? `\nChange Attention: ${changeAttention.toUpperCase()}` : ''}${git ? `\nBranch: ${git.available ? git.branch ?? 'Unnamed / detached' : 'Unavailable'}${git.revision ? `\nCurrent revision: ${git.revision.shortSha ?? git.revision.sha}` : ''}\nDirty files: ${git.available ? git.changedFiles : 'Unknown'}\nBehind upstream: ${git.behind ?? 'Unknown'}` : ''}${delta ? `\nBaseline delta: ${delta.riskDelta > 0 ? '+' : ''}${delta.riskDelta}% · ${delta.posture}` : ''}${riskTrend && riskTrend !== 'insufficient-data' ? `\nRecent trend: ${riskTrend[0]!.toUpperCase()}${riskTrend.slice(1)}` : ''}`;
    item.color = new vscode.ThemeColor(result.level === 'safe' ? 'testing.iconPassed' : result.level === 'caution' ? 'editorWarning.foreground' : 'editorError.foreground');
    item.accessibilityInformation = { label: `DeployBuddy: ${result.score}% deployment risk, ${result.level}. Run another deployment check.` };
  } };
}
