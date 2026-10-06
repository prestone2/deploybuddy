import * as vscode from 'vscode';
import { createDeploymentSession, type DeploymentSnapshot } from './services/deploymentSession';
import { formatGitHealth, formatPrePushCheck } from './ui/gitHealth';
import { analyzeGitGuardrails } from './core/analyzeGitGuardrails';
import { registerDeployBuddyParticipant } from './chat/deployBuddyParticipant';
import { generateAIVerdict, getAIOptions } from './services/aiVerdictService';
import { createStatusBar } from './ui/statusBar';
import { writeDeploymentReport, appendAIVerdict } from './ui/outputChannel';
import type { DeploymentRiskResult } from './types/deployment';
import type { AIVerdictResponse } from './types/ai';
export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('DeployBuddy');
  const status = createStatusBar();
  let generation: vscode.CancellationTokenSource | undefined;
  let disposed = false;
  const version = context.extension?.packageJSON?.version ?? '0.1.0';
  const session = createDeploymentSession(snapshot => {
    writeDeploymentReport(output, snapshot.signals, snapshot.result);
    status.update(snapshot.result, snapshot.signals.git);
  }, () => generation?.cancel());
  const publishAI = (snapshot: DeploymentSnapshot, response: AIVerdictResponse): void => {
    if (disposed || session.latest !== snapshot) return;
    writeDeploymentReport(output, snapshot.signals, snapshot.result);
    appendAIVerdict(output, response);
  };
  const explain = async (snapshot: DeploymentSnapshot, roast: boolean): Promise<AIVerdictResponse | undefined> => {
    generation?.cancel();
    const source = new vscode.CancellationTokenSource();
    generation = source;
    try {
      const options = getAIOptions(roast);
      const response = options.enabled ? await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'DeployBuddy: explaining your calculated risk', cancellable: true }, async (_, token) => {
        const cancel = token.onCancellationRequested(() => source.cancel());
        if (token.isCancellationRequested) source.cancel();
        try { return await generateAIVerdict(snapshot.signals, snapshot.result, options, source.token); }
        finally { cancel.dispose(); }
      }) : await generateAIVerdict(snapshot.signals, snapshot.result, options, source.token);
      if (disposed || source.token.isCancellationRequested || response.status === 'cancelled' || session.latest !== snapshot || generation !== source) return undefined;
      // Rewrite the same authoritative report so repeated explanations do not accumulate.
      publishAI(snapshot, response);
      return response;
    } finally { if (generation === source) generation = undefined; source.dispose(); }
  };
  const run = async (kind: 'check' | 'explain' | 'roast'): Promise<DeploymentRiskResult | undefined> => {
    try {
      const snapshot = await session.getSnapshot(kind === 'check');
      if (disposed) return snapshot.result;
      if (kind !== 'check') output.show(true);
      const ai = await explain(snapshot, kind === 'roast');
      if (!ai || kind !== 'check') return snapshot.result;
      const { signals, result } = snapshot;
      const caveat = !signals.workspaceFolders.length ? ' No workspace is open; signals are incomplete.' : !signals.git.available || !signals.diagnostics.available || signals.tests.testStatus === 'unknown' ? ' Some signals are unknown; see details.' : '';
      const message = `DeployBuddy: ${result.score}% risk — ${result.verdict.replaceAll('_', ' ')}. ${ai.verdict.headline}${caveat}`;
      const action = await (result.level === 'safe' ? vscode.window.showInformationMessage(message, 'Show Details') : result.level === 'caution' ? vscode.window.showWarningMessage(message, 'Show Details') : vscode.window.showErrorMessage(message, 'Show Details'));
      if (action === 'Show Details' && !disposed) output.show(true);
      return result;
    } catch (error: unknown) {
      if (disposed) return session.latest?.result;
      output.appendLine(`Deployment check could not complete: ${error instanceof Error ? error.message : 'Unknown error'}`);
      const action = await vscode.window.showWarningMessage('DeployBuddy could not complete this check. Production will have to wait a moment.', 'Show Details');
      if (action === 'Show Details' && !disposed) output.show(true);
      return session.latest?.result;
    }
  };
  const gitCommand = async (prePush: boolean): Promise<DeploymentSnapshot | undefined> => {
    try {
      const snapshot = await session.getSnapshot(true);
      if (disposed) return snapshot;
      output.appendLine('\n' + (prePush ? formatPrePushCheck(snapshot) : formatGitHealth(snapshot.signals.git)));
      output.show(true);
      if (prePush) {
        const findings = analyzeGitGuardrails(snapshot.signals.git, 'push');
        const danger = findings.find(f => f.severity === 'danger');
        const warning = findings.find(f => f.severity === 'warning');
        const message = `DeployBuddy Pre-Push: ${snapshot.result.score}% deployment risk — ${snapshot.result.verdict.replaceAll('_', ' ')} — ${danger?.detail ?? warning?.detail ?? (snapshot.signals.git.available ? 'Review the Git Health report before pushing.' : 'Git signals unavailable. Verify the repository manually.')}`;
        const action = await (danger || snapshot.result.level === 'danger' ? vscode.window.showErrorMessage(message, 'Show Details') : warning || snapshot.result.level === 'caution' ? vscode.window.showWarningMessage(message, 'Show Details') : vscode.window.showInformationMessage(message, 'Show Details'));
        if (action === 'Show Details' && !disposed) output.show(true);
      }
      return snapshot;
    } catch {
      if (!disposed) { output.appendLine('Git check could not finish. Please try again once the workspace is ready.'); output.show(true); }
      return undefined;
    }
  };
  context.subscriptions.push(output, status.item,
    vscode.commands.registerCommand('deploybuddy.checkDeployment', () => run('check')),
    vscode.commands.registerCommand('deploybuddy.explainRisk', () => run('explain')),
    vscode.commands.registerCommand('deploybuddy.roastDeployment', () => run('roast')),
    vscode.commands.registerCommand('deploybuddy.prePushCheck', () => gitCommand(true)),
    vscode.commands.registerCommand('deploybuddy.gitHealth', () => gitCommand(false)),
    vscode.commands.registerCommand('deploybuddy.about', async () => {
      const choice = await vscode.window.showInformationMessage(
        `DeployBuddy v${version}\nYour brutally honest pre-deployment sanity checker.\n\nSix user commands: deployment check, explain, roast, Pre-Push Check, Git Health, and About.\nThe deterministic risk engine sets the score; AI only explains it.`,
        'Show Details'
      );
      if (choice === 'Show Details') output.show(true);
    }),
    vscode.commands.registerCommand('deploybuddy.showDetails', () => output.show(true)),
    registerDeployBuddyParticipant(session, publishAI),
    { dispose() { disposed = true; session.dispose(); generation?.cancel(); generation?.dispose(); } });
  if (!context.globalState.get<boolean>('deploybuddy.onboardingShown')) {
    void context.globalState.update('deploybuddy.onboardingShown', true).then(() =>
      vscode.window.showInformationMessage('DeployBuddy is ready. Want to see whether deploying this workspace is a terrible idea?', 'Run Check', 'Not Now')
    ).then(choice => { if (choice === 'Run Check' && !disposed) void run('check'); });
  }
}
