import type { GitSignals } from '../types/deployment';
import type { GitGuardrailFinding, GitOperation } from '../types/gitGuardrails';
/** Independent advisory findings. Never assigns risk points or changes a verdict. */
export function analyzeGitGuardrails(git: GitSignals, operation: GitOperation = 'inspect'): GitGuardrailFinding[] {
  if (!git.available) return [{ severity: 'info', code: 'git-unavailable', title: 'Git signals unavailable', detail: 'No Git repository signals are available. Verify the intended repository manually.' }];
  const findings: GitGuardrailFinding[] = [];
  for (const repo of git.repositories) {
    const add = (condition: boolean, severity: GitGuardrailFinding['severity'], code: string, title: string, detail: string): void => { if (condition) findings.push({ severity, code, title, detail, repository: repo.root }); };
    const branch = repo.branch ?? (repo.detachedHead ? 'detached HEAD' : 'unknown branch');
    add((repo.conflictFiles ?? 0) > 0, 'danger', 'merge-conflicts', 'Resolve merge conflicts', `${repo.conflictFiles} unresolved merge conflicts on ${branch}. Git has already voted no.`);
    add(repo.detachedHead === true && repo.hasUncommittedChanges, 'danger', 'dirty-detached-head', 'Dirty detached HEAD', 'HEAD is detached and the working tree is dirty. Review and preserve your work on an appropriate branch before pushing.');
    add(repo.detachedHead === true && !repo.hasUncommittedChanges, 'warning', 'detached-head', 'Detached HEAD', 'HEAD is detached. Verify the intended branch before pushing.');
    add(operation === 'push' && repo.hasUncommittedChanges && (repo.branch === 'main' || repo.branch === 'master'), 'danger', 'dirty-primary-push', 'Dirty primary branch before push', `${branch} has ${repo.changedFiles} uncommitted files. Review release state before pushing; uncommitted files are not included in a push.`);
    add((repo.behind ?? 0) > 0, 'warning', 'behind-upstream', 'Behind upstream', `${branch} is ${repo.behind} commits behind ${repo.upstream ?? 'its tracked upstream'}. Maybe meet the present before pushing into the future.`);
    add((repo.ahead ?? 0) > 0 && (repo.behind ?? 0) > 0, 'warning', 'diverged', 'Branch has diverged', `${branch} is ahead by ${repo.ahead} and behind by ${repo.behind}. Review both histories and synchronize deliberately.`);
    add(repo.changedFiles > 10, 'warning', 'large-change-set', 'Large uncommitted change set', `${repo.changedFiles} distinct files have uncommitted changes on ${branch}.`);
    add(operation === 'push' && repo.untrackedFiles > 0, 'warning', 'untracked-before-push', 'Untracked files before push', `${repo.untrackedFiles} untracked files exist on ${branch}. These files will not be pushed unless intentionally committed.`);
    add((repo.unstagedFiles ?? 0) > 0 && operation === 'push', 'warning', 'unstaged-before-push', 'Unstaged changes remain', `${repo.unstagedFiles} unstaged tracked files remain on ${branch}; a push sends commits, not these changes.`);
    add(!repo.hasUncommittedChanges && repo.conflictFiles === 0 && (repo.ahead ?? 0) > 0 && repo.behind === 0, 'info', 'ahead-clean', 'Clean branch ahead of upstream', `${branch} is clean and ${repo.ahead} commits ahead. Review outgoing commits before pushing.`);
    add(!repo.hasUncommittedChanges && repo.conflictFiles === 0, 'info', 'clean-tree', 'Clean working tree', repo.ahead === 0 && repo.behind === 0 ? 'Working tree clean, branch synchronized. Suspiciously responsible.' : 'Working tree is clean. Upstream synchronization may still need review.');
  }
  const rank = { danger: 0, warning: 1, info: 2 };
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
