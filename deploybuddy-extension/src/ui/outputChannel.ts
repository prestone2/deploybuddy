import type { DeploymentRiskResult, WorkspaceSignals } from '../types/deployment';
import type { OutputChannel } from 'vscode';
import type { AIVerdictResponse } from '../types/ai';
export function formatDeploymentReport(s: WorkspaceSignals, r: DeploymentRiskResult): string {
  const count = (n: number | null): string => n === null ? 'Unknown' : String(n);
  const lines = ['DeployBuddy Deployment Check', '', `Risk: ${r.score}%`, `Verdict: ${r.verdict.replaceAll('_', ' ')}`, '', 'Workspace',
    `Folders: ${s.workspaceFolders.join(', ') || 'None open'}`, `Branch: ${s.git.available ? s.git.branch ?? 'Detached HEAD / unborn branch' : 'Unavailable'}`,
    `Modified files: ${s.git.available ? s.git.modifiedFiles : 'Unknown'}`, `Staged files: ${s.git.available ? s.git.stagedFiles : 'Unknown'}`,
    `Untracked files: ${s.git.available ? s.git.untrackedFiles : 'Unknown'}`, `Distinct changed files: ${s.git.available ? s.git.changedFiles : 'Unknown'}`,
    `Working tree: ${!s.git.available ? 'Unknown' : s.git.hasUncommittedChanges ? 'Dirty' : 'Clean'}`];
  for (const repo of s.git.repositories) lines.push(`Repository: ${repo.root}`, `  Branch: ${repo.branch ?? 'Detached HEAD / unborn branch'}; modified: ${repo.modifiedFiles}; staged: ${repo.stagedFiles}; untracked: ${repo.untrackedFiles}; distinct changed: ${repo.changedFiles}`);
  if (s.git.note) lines.push(`Git note: ${s.git.note}`);
  lines.push('', 'Diagnostics', `Errors: ${s.diagnostics.available ? s.diagnostics.errors : 'Unknown'}`, `Warnings: ${s.diagnostics.available ? s.diagnostics.warnings : 'Unknown'}`);
  if (s.diagnostics.note) lines.push(`Diagnostics note: ${s.diagnostics.note}`);
  lines.push('', 'Tests', `Status: ${s.tests.testStatus}`, `Passed: ${count(s.tests.passed)}`, `Failed: ${count(s.tests.failed)}`, `Skipped: ${count(s.tests.skipped)}`, `Not run: ${count(s.tests.notRun)}`, s.tests.note,
    '', 'Context', `${s.context.day}, ${String(s.context.hour).padStart(2, '0')}:${String(s.context.minute).padStart(2, '0')} (local time)`, `Checked: ${s.context.timestamp}`,
    '', 'Why?', ...(r.reasons.length ? r.reasons.map(reason => `- ${reason.message} (+${reason.points})`) : ['- No configured risk rules were triggered.']), '', 'Advice:', r.advice,
    '', 'Advisory only. Missing signals are not evidence of safety. No tests, builds, or deployments were executed.');
  return lines.join('\n');
}
export function writeDeploymentReport(channel: OutputChannel, s: WorkspaceSignals, r: DeploymentRiskResult): void { channel.clear(); channel.appendLine(formatDeploymentReport(s, r)); }

export function appendAIVerdict(channel: OutputChannel, response: AIVerdictResponse): void {
  channel.appendLine('\nAI Verdict');
  if (response.status === 'success') {
    channel.appendLine(`\nHeadline:\n${response.verdict.headline}\n\nExplanation:\n${response.verdict.explanation}\n\nRecommended action:\n${response.verdict.recommendedAction}`);
  } else {
    channel.appendLine(response.status === 'disabled' ? 'Disabled — using deterministic fallback.' : 'Unavailable — using deterministic fallback.');
  }
}
