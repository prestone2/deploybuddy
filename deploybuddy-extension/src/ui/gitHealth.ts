import { analyzeGitGuardrails } from '../core/analyzeGitGuardrails';
import { getDeploymentRecommendations } from '../core/getDeploymentRecommendations';
import type { GitSignals } from '../types/deployment';
import type { DeploymentSnapshot } from '../services/deploymentSession';
export function formatGitHealth(git: GitSignals): string {
  const count = (value: number | null | undefined): string => value == null ? 'Unknown' : String(value);
  if (!git.available) return 'Git Health\n\nGit signals unavailable. Open the intended Git workspace or enable the built-in Git extension. No clean-state claim is possible.';
  const sections = git.repositories.map(repo => [
    `Branch: ${repo.branch ?? 'Unknown / unnamed'}`, `Upstream: ${repo.upstream ?? 'Not configured / unavailable'}`,
    `Ahead: ${count(repo.ahead)}`, `Behind: ${count(repo.behind)}`, `Staged: ${repo.stagedFiles}`, `Unstaged: ${count(repo.unstagedFiles)}`,
    `Untracked: ${repo.untrackedFiles}`, `Conflicts: ${count(repo.conflictFiles)}`, `HEAD state: ${repo.detachedHead === true ? 'Detached' : repo.detachedHead === false ? 'On branch' : 'Unknown / unborn'}`,
    `Dirty: ${repo.hasUncommittedChanges ? 'Yes' : 'No'}`,
  ].join('\n'));
  const findings = analyzeGitGuardrails(git);
  return ['Git Health', '', ...sections.flatMap((section, i) => [`Repository ${i + 1}`, section, '']), 'Status:', ...(findings.length ? findings.map(f => `- [${f.severity}] ${f.detail}`) : ['Some Git signals are unknown. Review the repository manually.']), '', 'Cached local Git snapshot; no fetch or push was performed. Remote state may have changed.'].join('\n');
}
export function formatPrePushCheck(snapshot: DeploymentSnapshot): string {
  const { signals, result } = snapshot;
  const findings = analyzeGitGuardrails(signals.git, 'push');
  return ['DeployBuddy Pre-Push Check', '', `Risk: ${result.score}% — ${result.verdict.replaceAll('_', ' ')}`, '', formatGitHealth(signals.git), '', 'Git concerns:', ...findings.map(f => `- [${f.severity}] ${f.detail}`), '', 'Recommendations:', ...getDeploymentRecommendations(signals).map((r, i) => `${i + 1}. ${r.title}: ${r.detail}`), '', 'Advisory only. No Git operation was executed, blocked, or intercepted.'].join('\n');
}
