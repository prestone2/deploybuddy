import * as vscode from 'vscode';
import { formatGitHealth } from '../ui/gitHealth';
import { analyzeGitGuardrails } from '../core/analyzeGitGuardrails';
import { detectIntent } from './intent';
import { getDeploymentRecommendations } from '../core/getDeploymentRecommendations';
import { generateAIVerdict, getAIOptions } from '../services/aiVerdictService';
import type { DeploymentSession, DeploymentSnapshot } from '../services/deploymentSession';
import type { AIVerdictResponse } from '../types/ai';
export const PARTICIPANT_ID = 'deploybuddy.deployment';
/** Render untrusted branch names and AI prose as text, never trusted links/HTML. */
function text(value: string): string { return value.replace(/[\r\n\u2028\u2029]/g, ' ').replace(/[\\`*_{}[\]()<>#!|~]/g, '\\$&'); }
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
export function createDeployBuddyHandler(session: DeploymentSession, publishAI: (snapshot: DeploymentSnapshot, ai: AIVerdictResponse) => void): vscode.ChatRequestHandler {
  return async (request, _context, stream, token) => {
    const intent = detectIntent(request.prompt, request.command);
    if (token.isCancellationRequested) return {};
    stream.progress('DeployBuddy is checking the workspace...');
    try {
      const snapshot = await collect(session, intent === 'check' || intent === 'status' || intent === 'fix' || intent === 'git', token);
      if (!snapshot || token.isCancellationRequested) return {};
      const { signals: s, result: r } = snapshot;
      stream.markdown(`## ${r.verdict.replaceAll('_', ' ')}\n\n**Risk:** ${r.score}%\n\n`);
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
        stream.markdown(`### DeployBuddy Status\n- Branch: ${text(s.git.available ? s.git.branch ?? 'Detached HEAD / unborn branch' : 'Unavailable')}\n- Changed files: ${s.git.available ? s.git.changedFiles : 'Unknown'}\n- Errors: ${s.diagnostics.available ? s.diagnostics.errors : 'Unknown'}\n- Warnings: ${s.diagnostics.available ? s.diagnostics.warnings : 'Unknown'}\n- Tests: ${s.tests.testStatus}\n- Time: ${s.context.day} ${String(s.context.hour).padStart(2, '0')}:${String(s.context.minute).padStart(2, '0')} (local)\n\n`);
      } else if (intent === 'fix') {
        stream.markdown('### What to fix first\n' + getDeploymentRecommendations(s).map((item, index) => `${index + 1}. **${text(item.title)}** — ${text(item.detail)}`).join('\n') + '\n\n');
      } else if (!s.workspaceFolders.length) {
        stream.markdown('**Recommendation:** Open the intended project, then run /check. Production can wait until there is a workspace to inspect.\n\n');
      } else {
        stream.markdown('### Why\n' + (r.reasons.length ? r.reasons.map(reason => `- ${text(reason.message)}`).join('\n') : '- No configured risk rules were triggered.') + `\n\n**Recommendation:** ${text(r.advice)}\n\n`);
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
export function registerDeployBuddyParticipant(session: DeploymentSession, publishAI: (snapshot: DeploymentSnapshot, ai: AIVerdictResponse) => void): vscode.ChatParticipant {
  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, createDeployBuddyHandler(session, publishAI));
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
