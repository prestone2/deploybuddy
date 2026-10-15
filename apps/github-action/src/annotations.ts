import * as core from '@actions/core';
import { analyzeGitGuardrails, type DeploymentRiskResult, type WorkspaceSignals } from '@deploybuddy/core';

export function publishAnnotations(signals: WorkspaceSignals, enabled: boolean, risk: DeploymentRiskResult): void {
  if (!enabled) return;
  if (risk.level === 'danger') core.warning(`Risk ${risk.score}% — ${risk.verdict}. ${risk.message}`, { title: 'DeployBuddy deployment risk' });
  else if (risk.level === 'caution') core.notice(`Risk ${risk.score}% — ${risk.verdict}. ${risk.message}`, { title: 'DeployBuddy deployment risk' });
  else core.notice(`Risk ${risk.score}% — ${risk.verdict}.`, { title: 'DeployBuddy deployment risk' });
  if (signals.diagnostics.available && signals.diagnostics.errors > 0) {
    core.error(`${signals.diagnostics.errors} workspace diagnostic error(s) are present.`, { title: 'Workspace errors' });
  }
  if (signals.diagnostics.available && signals.diagnostics.warnings > 0) {
    core.warning(`${signals.diagnostics.warnings} workspace diagnostic warning(s) are present.`, { title: 'Workspace warnings' });
  }
  if ((signals.tests.failed ?? 0) > 0) core.error(`${signals.tests.failed} test(s) are failing.`, { title: 'Failing tests' });
  for (const finding of analyzeGitGuardrails(signals.git)) {
    const message = `${finding.title}: ${finding.detail}`;
    if (finding.severity === 'danger') core.error(message, { title: 'DeployBuddy Git guardrail' });
    else if (finding.severity === 'warning') core.warning(message, { title: 'DeployBuddy Git guardrail' });
    else core.notice(message, { title: 'DeployBuddy Git status' });
  }
}
