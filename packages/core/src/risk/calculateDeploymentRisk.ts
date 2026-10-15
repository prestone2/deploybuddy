import type { DeploymentRiskResult, RiskReason, WorkspaceSignals } from '../types/deployment';
import { DEFAULT_CONFIG } from '../config/config';
export function calculateDeploymentRisk(s: WorkspaceSignals): DeploymentRiskResult {
  const reasons: RiskReason[] = [];
  const add = (condition: boolean, code: string, points: number, message: string): void => { if (condition) reasons.push({ code, points, message }); };
  const minutes = s.context.hour * 60 + s.context.minute;
  add(s.context.dayOfWeek === 5, 'friday', 20, 'It is Friday. Future-you had weekend plans.');
  add(s.context.dayOfWeek === 0 || s.context.dayOfWeek === 6, 'weekend', 25, 'It is the weekend. Production does not take weekends off.');
  add(minutes > 16 * 60, 'late', 15, 'It is after 4 PM local time.');
  add(minutes > 20 * 60, 'night', 10, 'It is after 8 PM. Incident reports make terrible bedtime stories.');
  add(s.git.available && s.git.hasUncommittedChanges, 'dirty', 10, 'The working tree has uncommitted changes.');
  add(s.git.available && s.git.changedFiles > 10, 'large-change', 10, `${s.git.changedFiles} distinct files have uncommitted changes.`);
  add(s.diagnostics.available && s.diagnostics.errors > 0, 'errors', 25, `${s.diagnostics.errors} workspace diagnostics errors exist.`);
  add(s.diagnostics.available && s.diagnostics.errors >= 5, 'many-errors', 15, 'At least five diagnostics errors need attention.');
  add(s.diagnostics.available && s.diagnostics.warnings >= 10, 'warnings', 10, `${s.diagnostics.warnings} diagnostics warnings are asking for a second look.`);
  add((s.tests.failed ?? 0) > 0, 'failed-tests', 35, `${s.tests.failed} tests are failing.`);
  add(s.tests.testStatus === 'unknown' || (s.tests.notRun ?? 0) > 0, 'unknown-tests', 15, s.tests.testStatus === 'unknown' ? 'Reliable workspace test results are unavailable; test status is unknown.' : `${s.tests.notRun} tests have not run.`);
  add(s.git.available && s.git.dirtyPrimaryBranch, 'primary-branch', 10, 'A dirty repository is on main or master.');
  const score = Math.max(0, Math.min(100, reasons.reduce((total, r) => total + r.points, 0)));
  const thresholds = s.config?.thresholds ?? DEFAULT_CONFIG.thresholds;
  const level = score <= thresholds.safeMax ? 'safe' : score <= thresholds.cautionMax ? 'caution' : 'danger';
  const missing = !s.workspaceFolders.length || !s.git.available || !s.diagnostics.available || s.tests.testStatus === 'unknown';
  const advice = (s.tests.failed ?? 0) > 0 ? 'Fix the failing tests before touching production.' : s.diagnostics.errors > 0 ? 'Fix the workspace errors and run your test suite before deploying.' : missing ? 'Some signals are unavailable. Open the intended workspace, run its tests, and review your release checklist.' : level === 'danger' ? 'Close the deployment tab. Production has a family. Review the risks first.' : level === 'caution' ? 'Review the diff, run your tests, and double-check the rollback plan.' : 'Review the release checklist and keep an eye on the logs.';
  return { score, level, verdict: level === 'safe' ? 'DEPLOY' : level === 'caution' ? 'QUESTIONABLE' : 'DO_NOT_DEPLOY', reasons,
    message: level === 'safe' ? 'Ship it. The CI/CD gods are with you.' : level === 'caution' ? 'Technically possible. Spiritually questionable.' : 'Absolutely not. Production has a family.', advice };
}
