import * as vscode from 'vscode';
import type { DeploymentRiskResult, GitSignals } from '../types/deployment';
export function createStatusBar(): { item: vscode.StatusBarItem; update: (result: DeploymentRiskResult, git?: GitSignals) => void } {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  item.name = 'DeployBuddy'; item.text = '$(rocket) DeployBuddy';
  item.command = 'deploybuddy.checkDeployment';
  item.tooltip = 'Check whether deploying this workspace is a terrible idea.';
  item.show();
  return { item, update(result, git) {
    item.text = `$(${result.level === 'safe' ? 'check' : result.level === 'caution' ? 'warning' : 'error'}) DeployBuddy ${result.score}%`;
    item.tooltip = `Check whether deploying this workspace is a terrible idea.\nDeployment risk: ${result.score}%${git ? `\nBranch: ${git.available ? git.branch ?? 'Unnamed / detached' : 'Unavailable'}\nDirty files: ${git.available ? git.changedFiles : 'Unknown'}\nBehind upstream: ${git.behind ?? 'Unknown'}` : ''}`;
    item.color = new vscode.ThemeColor(result.level === 'safe' ? 'testing.iconPassed' : result.level === 'caution' ? 'editorWarning.foreground' : 'editorError.foreground');
    item.accessibilityInformation = { label: `DeployBuddy: ${result.score}% deployment risk, ${result.level}. Run another deployment check.` };
  } };
}
