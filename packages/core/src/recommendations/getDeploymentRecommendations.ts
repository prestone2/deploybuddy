import { analyzeGitGuardrails } from '../git/analyzeGitGuardrails';
import type { WorkspaceSignals } from '../types/deployment';
export interface DeploymentRecommendation { priority: number; title: string; detail: string }
export function getDeploymentRecommendations(s: WorkspaceSignals): DeploymentRecommendation[] {
  const findings = analyzeGitGuardrails(s.git);
  const details = (code: string): string => findings.filter(f => f.code === code).map(f => f.detail).join(' ');
  const recommendations: DeploymentRecommendation[] = [];
  const add = (condition: boolean, priority: number, title: string, detail: string): void => { if (condition) recommendations.push({ priority, title, detail }); };
  add(findings.some(f => f.code === 'merge-conflicts'), 1, 'Resolve merge conflicts', details('merge-conflicts'));
  add((s.tests.failed ?? 0) > 0, 2, 'Fix failing tests', `${s.tests.failed} tests are currently failing.`);
  add(s.diagnostics.available && s.diagnostics.errors > 0, 3, 'Resolve workspace errors', `${s.diagnostics.errors} error diagnostics are present.`);
  add(findings.some(f => f.code === 'behind-upstream'), 4, 'Review and synchronize with upstream', details('behind-upstream'));
  add(findings.some(f => f.code === 'dirty-detached-head' || f.code === 'detached-head'), 6, 'Review detached HEAD', details('dirty-detached-head') || details('detached-head'));
  add(s.diagnostics.available && s.diagnostics.warnings >= 10, 5, 'Review diagnostics warnings', `${s.diagnostics.warnings} warnings need review; address the actionable ones.`);
  add(s.git.available && s.git.dirtyPrimaryBranch, 7, 'Review uncommitted main/master changes', 'Commit or stash reviewed changes before deploying from the primary branch.');
  add(s.git.available && s.git.changedFiles > 10, 8, 'Review the large change set', `${s.git.changedFiles} distinct files have uncommitted changes. Consider smaller, reviewed releases.`);
  add(s.git.available && s.git.untrackedFiles > 0, 9, 'Review untracked files', `${s.git.untrackedFiles} untracked files are present. Decide which belong in the release.`);
  add(s.git.available && s.git.hasUncommittedChanges && !s.git.dirtyPrimaryBranch && s.git.changedFiles <= 10, 10, 'Review uncommitted changes', 'Commit or stash reviewed changes so the release has an identifiable state.');
  add([0, 5, 6].includes(s.context.dayOfWeek) || s.context.hour * 60 + s.context.minute > 960, 11, 'Choose a supported deployment window', 'Consider waiting until your team can monitor the rollout and respond.');
  add(s.tests.testStatus === 'unknown' || (s.tests.notRun ?? 0) > 0, 12, 'Run and verify your test suite', s.tests.testStatus === 'unknown' ? 'Test results are unknown. Check your test runner; unknown does not mean passing.' : `${s.tests.notRun} tests have not run.`);
  add(!s.workspaceFolders.length, 13, 'Open the intended workspace', 'There is no workspace open. Select the project you intend to deploy.');
  add(s.workspaceFolders.length > 0 && !s.git.available, 14, 'Verify version-control state manually', 'Git signals are unavailable; this is not evidence of a clean working tree.');
  add(!s.diagnostics.available, 15, 'Verify diagnostics and the build', 'Diagnostics are unavailable; run your normal build checks.');
  recommendations.push({ priority: 16, title: 'Re-run DeployBuddy', detail: 'Use /check after addressing these items. Review your release checklist before shipping.' });
  return recommendations.sort((a, b) => a.priority - b.priority);
}
