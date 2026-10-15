import * as vscode from 'vscode';
import { formatGitHealth } from '../ui/gitHealth';
import { analyzeGitGuardrails } from '../core/analyzeGitGuardrails';
import { detectIntent } from './intent';
import { getDeploymentRecommendations } from '../core/getDeploymentRecommendations';
import { generateAIVerdict, getAIOptions } from '../services/aiVerdictService';
import type { DeploymentSession, DeploymentSnapshot } from '../services/deploymentSession';
import type { AIVerdictResponse } from '../types/ai';
import { analyzeChanges, calculateConfidenceTrend, calculateRiskTrend, calculateEvidenceConfidence, compareAssessments, createAssessmentBaseline, evaluatePolicy, evaluateReleaseGates, evaluateReleaseReadiness, getConfidenceAwareMessage, getFrequentFindings, summarizeHistory, type AssessmentBaseline, type AssessmentDelta } from '@deploybuddy/core';
import { formatPolicyReport, formatRecentRiskChanges, formatChangedAreas } from '../ui/outputChannel';
import { readWorkspaceBaseline } from '../services/baselineService';
import { readWorkspaceHistory } from '../services/historyService';
import type { Memento } from 'vscode';
export const PARTICIPANT_ID = 'deploybuddy.deployment';
/** Render untrusted branch names and AI prose as text, never trusted links/HTML. */
// eslint-disable-next-line no-control-regex
function text(value: string): string { return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').slice(0, 1200).replace(/[\\`*_{}[\]()<>#!|~]/g, '\\$&'); }
async function collect(session: DeploymentSession, fresh: boolean, token: vscode.CancellationToken): Promise<DeploymentSnapshot | undefined> {
  if (token.isCancellationRequested) return undefined;
  let cancel: vscode.Disposable | undefined;
  try {
    return await Promise.race([session.getSnapshot(fresh), new Promise<undefined>(resolve => {
      cancel = token.onCancellationRequested(() => resolve(undefined));
      if (token.isCancellationRequested) resolve(undefined);
    })]);
  } finally { cancel?.dispose(); }
}
function renderDelta(previous: AssessmentBaseline, current: AssessmentBaseline, delta: AssessmentDelta): string {
  const signed = (value: number): string => `${value > 0 ? '+' : ''}${value}`;
  const policy = (value: boolean | undefined): string => value === undefined ? 'Not configured' : value ? 'PASS' : 'FAIL';
  return `### Change from baseline\n- Risk: ${previous.risk.score}% → ${current.risk.score}% (${signed(delta.riskDelta)})\n- Confidence: ${previous.confidence.score}% → ${current.confidence.score}% (${signed(delta.confidenceDelta)})\n- Policy: ${policy(delta.previousPolicyPassed)} → ${policy(delta.currentPolicyPassed)}\n${delta.releaseGatesChanged ? `- Release gates: ${delta.previousReleaseGatesStatus?.toUpperCase()} → ${delta.currentReleaseGatesStatus?.toUpperCase()}\n` : ''}- Overall: ${delta.posture}\n\n**Evidence changed**\n${delta.changedSignals.length ? delta.changedSignals.map(item => `- ${text(item.code)}: ${item.previous ?? 'unknown'} → ${item.current ?? 'unknown'}`).join('\n') : '- None'}\n${delta.addedFindings.length ? `\n**New concerns**\n${delta.addedFindings.map(f => `- ${text(f.title)}`).join('\n')}\n` : ''}${delta.resolvedFindings.length ? `\n**Resolved**\n${delta.resolvedFindings.map(f => `- ${text(f.title)}`).join('\n')}\n` : ''}\n`;
}
export function createDeployBuddyHandler(session: DeploymentSession, publishAI: (snapshot: DeploymentSnapshot, ai: AIVerdictResponse) => void, state?: Memento, onExplicitCheck?: (snapshot: DeploymentSnapshot) => Promise<void>): vscode.ChatRequestHandler {
  return async (request, _context, stream, token) => {
    let intent = detectIntent(request.prompt, request.command);
    if (!request.command && /^what changed[?!. ]*$/i.test(request.prompt.trim())) {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const baseline = root && state ? readWorkspaceBaseline(state, root) : undefined;
      if (baseline?.status !== 'valid') intent = 'changes';
    }
    if (token.isCancellationRequested) return {};
    if (intent === 'history' || intent === 'trend' || intent === 'riskChanges') {
      stream.progress('DeployBuddy is reading local assessment history...');
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const stored = root && state ? readWorkspaceHistory(state, root) : { entries: [], invalidCount: 0, unsupportedCount: 0 };
      if (!root) stream.markdown('No workspace is open, so there is no project history to show. Run an explicit `/check` after opening a project.');
      else if (!stored.entries.length) stream.markdown('No explicit assessments have been recorded for this workspace yet. Run `/check` to start a local history.');
      else if (intent === 'riskChanges') stream.markdown(formatRecentRiskChanges(stored.entries));
      else if (intent === 'history') {
        const summary = summarizeHistory(stored.entries);
        const rows = [...stored.entries].slice(-5).reverse().map(item => `- ${item.recordedAt.slice(0, 16).replace('T', ' ')} · risk ${item.risk.score}% · confidence ${item.confidence.score}% · ${item.policy?.configured ? item.policy.passed ? 'policy PASS' : 'policy FAIL' : 'policy N/A'}`);
        stream.markdown(`## Recent deployment checks\n${rows.join('\n')}\n\n${summary.count} local assessment(s). Most common concern: ${summary.frequentFindings[0] ? `\`${text(summary.frequentFindings[0].code)}\` (${summary.frequentFindings[0].count})` : 'none recorded'}.`);
      } else {
        const risk = calculateRiskTrend(stored.entries); const confidence = calculateConfidenceTrend(stored.entries); const summary = summarizeHistory(stored.entries);
        const trendLine = (label: string, item: typeof risk): string => item.direction === 'insufficient-data' ? `**${label}:** Insufficient data (${item.sampleSize} checks; at least 6 are needed).` : `**${label}:** ${text(item.direction[0]!.toUpperCase() + item.direction.slice(1))} — recent average ${item.recentAverage}% vs ${item.olderAverage}% in the earlier window.`;
        const frequent = getFrequentFindings(stored.entries, 1)[0];
        const policyEntries = stored.entries.filter(item => item.policy?.configured);
        const policyPassed = policyEntries.filter(item => item.policy?.passed).length;
        stream.markdown(`## Deployment trend\n\n${trendLine('Risk', risk)}\n\n${trendLine('Confidence', confidence)}\n\n**Policy:** ${summary.policyPassRate === null ? 'No configured policy checks yet.' : `${policyPassed} of ${policyEntries.length} configured-policy checks passed (${summary.policyPassRate}%).`}\n\n**Most common concern:** ${frequent ? `\`${text(frequent.code)}\` appeared in ${frequent.count} assessment(s).` : 'None recorded.'}`);
      }
      if (stored.invalidCount || stored.unsupportedCount) stream.markdown('\n\n*Some malformed or unsupported history entries were skipped.*');
      return { metadata: { intent } };
    }
    stream.progress('DeployBuddy is checking the workspace...');
    try {
      const snapshot = await collect(session, intent === 'check' || intent === 'status' || intent === 'fix' || intent === 'git' || intent === 'policy' || intent === 'compare' || intent === 'baseline' || intent === 'changes' || intent === 'readiness' || intent === 'release', token);
      if (!snapshot || token.isCancellationRequested) return {};
      if (intent === 'check') await onExplicitCheck?.(snapshot);
      const { signals: s, result: r } = snapshot;
      const confidence = snapshot.confidence ?? calculateEvidenceConfidence(s);
      const policy = snapshot.policy ?? evaluatePolicy(s.policy, { risk: r, confidence, git: s.git, diagnostics: s.diagnostics, tests: s.tests, checks: s.checks ?? [], project: s.project });
      const readiness = snapshot.readiness ?? evaluateReleaseReadiness({ risk: r, confidence, policy, changes: snapshot.changes, signals: s, recommendations: getDeploymentRecommendations(s) });
      const releaseGates = snapshot.releaseGates ?? evaluateReleaseGates({ config: s.policy?.policy?.release, risk: r, confidence, policy, changes: snapshot.changes, readiness });
      if (intent === 'changes') {
        stream.markdown(formatChangedAreas(snapshot.changes ?? analyzeChanges([])));
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const history = root && state ? readWorkspaceHistory(state, root) : undefined;
        if (history?.entries.length) stream.markdown(`\n\n${formatRecentRiskChanges(history.entries)}`);
        return { metadata: { intent } };
      }
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const uncertainSafe = r.level === 'safe' && confidence.level === 'low';
      stream.markdown(`## ${r.verdict.replaceAll('_', ' ')}\n\n**Release Readiness:** ${readiness.status.replaceAll('_', ' ').toUpperCase()}\n\n**Release Gates:** ${releaseGates.status.replaceAll('_', ' ').toUpperCase()}\n\n**${uncertainSafe ? 'Observed risk' : 'Risk'}:** ${r.score}%\n\n`);
      if (releaseGates.configured && releaseGates.violations.length && ['check', 'fix'].includes(intent)) stream.markdown(`### Release gate violations\n${releaseGates.violations.map(item => `- ${text(item.detail)}`).join('\n')}\n\n`);
      if (uncertainSafe) stream.markdown(`> ${getConfidenceAwareMessage(r.level, confidence.level, r.message)}\n\n`);
      if (!s.workspaceFolders.length) stream.markdown("There's no workspace open, so I have nothing to send to production yet. This is an incomplete-context score, not release approval. Open your project and run /check.\n\n");
      stream.markdown(`*Checked: ${text(new Date(s.context.timestamp).toLocaleString())}${intent === 'explain' || intent === 'roast' ? ' · latest saved check; use /check to refresh' : ''}.*\n\n`);
      if (intent === 'git') {
        const push = /\bpush\b/i.test(request.prompt);
        stream.markdown(formatGitHealth(s.git).split('\n').map(line => text(line)).join('  \n') + '\n\n');
        if (push) {
          stream.markdown('### Pre-push concerns\n' + analyzeGitGuardrails(s.git, 'push').map(f => `- ${text(f.detail)}`).join('\n') + '\n\n');
        }
        stream.markdown('**First step:** ' + text(getDeploymentRecommendations(s)[0]?.detail ?? r.advice) + '\n\n');
      } else if (intent === 'status') {
        stream.markdown(`### DeployBuddy Status\n- Release readiness: ${readiness.status.toUpperCase()}\n- Release gates: ${releaseGates.status.toUpperCase()}\n- Branch: ${text(s.git.available ? s.git.branch ?? 'Detached HEAD / unborn branch' : 'Unavailable')}\n- Changed files: ${s.git.available ? s.git.changedFiles : 'Unknown'}\n- Errors: ${s.diagnostics.available ? s.diagnostics.errors : 'Unknown'}\n- Warnings: ${s.diagnostics.available ? s.diagnostics.warnings : 'Unknown'}\n- Tests: ${s.tests.testStatus}\n- Policy: ${!policy.configured ? 'Not configured' : policy.passed ? 'PASS' : `${policy.violations.length} violations`}\n- Time: ${s.context.day} ${String(s.context.hour).padStart(2, '0')}:${String(s.context.minute).padStart(2, '0')} (local)\n\n`);
      } else if (intent === 'fix') {
        const actions = [...readiness.recommendedActions.map(text), ...releaseGates.violations.map(item => `Release gate: ${text(item.title)} — ${text(item.detail)}`), ...getDeploymentRecommendations(s).map(item => `${text(item.title)} — ${text(item.detail)}`), ...policy.violations.map(item => `Policy: ${text(item.title)} — ${text(item.detail)}`)];
        stream.markdown('### What to fix first\n' + (actions.length ? actions.map((item, index) => `${index + 1}. ${item}`).join('\n') : 'No evidence-based fixes are currently suggested.') + '\n\n');
      } else if (intent === 'policy') {
        stream.markdown(`### Repository policy\n${text(formatPolicyReport(s.policy, policy)).replace(/\n/g, '  \n')}\n\n`);
      } else if (intent === 'readiness') {
        stream.markdown(`### Release Readiness: ${readiness.status.replaceAll('_', ' ').toUpperCase()}\n\n${readiness.reasons.map(item => `- ${text(item.detail)}`).join('\n') || '- No additional concerns.'}\n\n**Recommended actions**\n${readiness.recommendedActions.map((item, index) => `${index + 1}. ${text(item)}`).join('\n')}\n\n`);
      } else if (intent === 'release') {
        stream.markdown(`### Release Gates: ${releaseGates.status.replaceAll('_', ' ').toUpperCase()}\n\n${releaseGates.configured ? releaseGates.violations.map(item => `- ${text(item.detail)}`).join('\n') || 'All configured release criteria pass.' : 'No release gates are configured in .deploybuddy.json.'}\n\n`);
      } else if (intent === 'baseline') {
        const stored = root && state ? readWorkspaceBaseline(state, root) : undefined;
        stream.markdown(!root ? 'No workspace is open, so there is no project baseline.\n\n' : !stored ? 'No baseline is saved for the first workspace root. Run **DeployBuddy: Save Baseline** to create one.\n\n' : stored.status === 'valid' ? `Baseline saved ${text(stored.baseline.recordedAt)}.\n\nRisk: ${stored.baseline.risk.score}% · Confidence: ${stored.baseline.confidence.score}% · Policy: ${stored.baseline.policy.configured ? stored.baseline.policy.passed ? 'PASS' : 'FAIL' : 'Not configured'}\n\n` : `${text(stored.message)} Clear it with **DeployBuddy: Clear Baseline**.\n\n`);
      } else if (intent === 'compare') {
        const stored = root && state ? readWorkspaceBaseline(state, root) : undefined;
        if (!stored || stored.status !== 'valid') stream.markdown(!root ? 'No workspace is open, so there is no project baseline to compare.\n\n' : !stored ? 'No baseline is saved for this workspace. Run **DeployBuddy: Save Baseline** first.\n\n' : `${text(stored.message)} Clear it with **DeployBuddy: Clear Baseline**.\n\n`);
        else {
          const current = createAssessmentBaseline({ signals: s, risk: r, confidence, policy, readiness, releaseGates, recommendations: [] });
          stream.markdown(renderDelta(stored.baseline, current, compareAssessments(stored.baseline, current)));
        }
      } else if (!s.workspaceFolders.length) {
        stream.markdown('**Recommendation:** Open the intended project, then run /check. Production can wait until there is a workspace to inspect.\n\n');
      } else {
        stream.markdown('### Why\n' + (r.reasons.length ? r.reasons.map(reason => `- ${text(reason.message)}`).join('\n') : '- No configured risk rules were triggered.') + `\n\n**Recommendation:** ${text(r.advice)}\n\n`);
        if (policy.configured) stream.markdown(`### Policy\n${policy.passed ? '✅ Repository deployment policy satisfied.' : `❌ Failed — ${policy.violations.length} violation(s).\n${policy.violations.map(item => `- ${text(item.detail)}`).join('\n')}`}\n\n`);
        // The user's message, history, attachments, and references NEVER enter the model prompt.
        const ai = await generateAIVerdict(s, r, getAIOptions(intent === 'roast'), token, request.model);
        if (token.isCancellationRequested || ai.status === 'cancelled') return {};
        if (ai.status === 'success') stream.markdown(`### ${intent === 'roast' ? 'Deployment roast' : 'DeployBuddy explains'}\n**${text(ai.verdict.headline)}**\n\n${text(ai.verdict.explanation)}\n\n${text(ai.verdict.recommendedAction)}\n\n`);
        else stream.markdown(`*Classic deterministic personality${ai.status === 'disabled' ? ' · AI disabled' : ' · AI unavailable'}.*\n\n${text(ai.verdict.headline)}\n\n`);
        publishAI(snapshot, ai);
      }
      if (token.isCancellationRequested) return {};
      stream.markdown('*Advisory only. Unknown signals are not proof that production is safe.*\n');
      stream.button({ command: 'deploybuddy.showDetails', title: 'Show details' });
      return { metadata: { intent } };
    } catch {
      if (!token.isCancellationRequested) stream.markdown('DeployBuddy could not finish reading this workspace. No new score was issued. Your previous deterministic result is still available in the output channel. Try /check again.');
      return {};
    }
  };
}
export function registerDeployBuddyParticipant(session: DeploymentSession, publishAI: (snapshot: DeploymentSnapshot, ai: AIVerdictResponse) => void, state?: Memento, onExplicitCheck?: (snapshot: DeploymentSnapshot) => Promise<void>): vscode.ChatParticipant {
  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, createDeployBuddyHandler(session, publishAI, state, onExplicitCheck));
  participant.iconPath = new vscode.ThemeIcon('rocket');
  participant.followupProvider = { provideFollowups(result, _context, token) {
    if (token.isCancellationRequested || !result.metadata?.intent) return [];
    const followups: vscode.ChatFollowup[] = [
      { prompt: 'Run check again', command: 'check', label: 'Run check again', participant: PARTICIPANT_ID },
      { prompt: 'Roast this deployment', command: 'roast', label: 'Roast this deployment', participant: PARTICIPANT_ID },
      { prompt: 'What should I fix first?', command: 'fix', label: 'What should I fix first?', participant: PARTICIPANT_ID },
    ];
    return followups.filter(item => item.command !== result.metadata?.intent || item.command === 'check');
  } };
  return participant;
}
