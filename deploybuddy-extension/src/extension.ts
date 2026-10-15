import * as vscode from 'vscode';
import { createDeploymentSession, type DeploymentSnapshot } from './services/deploymentSession';
import { formatGitHealth, formatPrePushCheck } from './ui/gitHealth';
import { analyzeGitGuardrails } from './core/analyzeGitGuardrails';
import { registerDeployBuddyParticipant } from './chat/deployBuddyParticipant';
import { generateAIVerdict, getAIOptions } from './services/aiVerdictService';
import { createStatusBar } from './ui/statusBar';
import { writeDeploymentReport, appendAIVerdict, formatPolicyReport, formatHistoryReport, formatRecentRiskChanges, formatChangedAreas, formatReadinessReport, formatReleaseGatesReport } from './ui/outputChannel';
import type { DeploymentRiskResult } from './types/deployment';
import type { AIVerdictResponse } from './types/ai';
import { getConfidenceAwareMessage } from '@deploybuddy/core';
import { calculateRiskTrend, compareAssessments, createAssessmentBaseline, createAssessmentHistoryEntry } from '@deploybuddy/core';
import { clearWorkspaceBaseline, readWorkspaceBaseline, saveWorkspaceBaseline } from './services/baselineService';
import { appendWorkspaceHistory, clearWorkspaceHistory, readWorkspaceHistory } from './services/historyService';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('DeployBuddy');
  const status = createStatusBar();
  let generation: vscode.CancellationTokenSource | undefined;
  let disposed = false;
  const version = context.extension?.packageJSON?.version ?? '0.1.0';
  const firstRoot = (): string | undefined => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const getDelta = (snapshot: DeploymentSnapshot) => {
    const stored = readWorkspaceBaseline(context.globalState, firstRoot());
    if (stored?.status !== 'valid') return undefined;
    return compareAssessments(stored.baseline, createAssessmentBaseline({ signals: snapshot.signals, risk: snapshot.result, confidence: snapshot.confidence, policy: snapshot.policy, readiness: snapshot.readiness, releaseGates: snapshot.releaseGates, recommendations: [] }));
  };
  const updateStatus = (snapshot: DeploymentSnapshot): void => {
    const history = readWorkspaceHistory(context.globalState, firstRoot());
    status.update(snapshot.result, snapshot.signals.git, snapshot.policy, getDelta(snapshot), calculateRiskTrend(history.entries).direction, snapshot.readiness, snapshot.confidence.score, snapshot.changes.attention.level, snapshot.releaseGates);
  };
  const recordSnapshot = async (snapshot: DeploymentSnapshot): Promise<void> => {
    const root = firstRoot();
    if (!root) return;
    try {
      const entry = createAssessmentHistoryEntry({ signals: snapshot.signals, risk: snapshot.result, confidence: snapshot.confidence, policy: snapshot.policy, readiness: snapshot.readiness, releaseGates: snapshot.releaseGates, recommendations: [] }, snapshot.sessionId);
      const { duplicate, history } = await appendWorkspaceHistory(context.globalState, root, entry);
      if (!duplicate) updateStatus(snapshot);
      if (history.invalidCount || history.unsupportedCount) output.appendLine(`History note: skipped ${history.invalidCount + history.unsupportedCount} invalid or unsupported entr${history.invalidCount + history.unsupportedCount === 1 ? 'y' : 'ies'}.`);
    } catch {
      output.appendLine('History could not be saved; the deployment assessment is unaffected.');
    }
  };
  const session = createDeploymentSession(snapshot => {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const stored = readWorkspaceBaseline(context.globalState, root);
    const baseline = stored?.status === 'valid' ? stored.baseline : undefined;
    const current = createAssessmentBaseline({ signals: snapshot.signals, risk: snapshot.result, confidence: snapshot.confidence, policy: snapshot.policy, readiness: snapshot.readiness, releaseGates: snapshot.releaseGates, recommendations: [] });
    const delta = baseline ? compareAssessments(baseline, current) : undefined;
    writeDeploymentReport(output, snapshot.signals, snapshot.result, snapshot.confidence, snapshot.policy, delta, snapshot.changes, snapshot.readiness, snapshot.releaseGates);
    updateStatus(snapshot);
  }, () => generation?.cancel());
  const publishAI = (snapshot: DeploymentSnapshot, response: AIVerdictResponse): void => {
    if (disposed || session.latest !== snapshot) return;
    writeDeploymentReport(output, snapshot.signals, snapshot.result, snapshot.confidence, snapshot.policy, getDelta(snapshot), snapshot.changes, snapshot.readiness, snapshot.releaseGates);
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
      if (kind === 'check') await recordSnapshot(snapshot);
      if (kind !== 'check') output.show(true);
      const ai = await explain(snapshot, kind === 'roast');
      if (!ai || kind !== 'check') return snapshot.result;
      const { signals, result, confidence } = snapshot;
      const caveat = !signals.workspaceFolders.length ? ' No workspace is open; signals are incomplete.' : !signals.git.available || !signals.diagnostics.available || signals.tests.testStatus === 'unknown' ? ' Some signals are unknown; see details.' : '';
      const confidenceMessage = getConfidenceAwareMessage(result.level, confidence.level, ai.verdict.headline);
      const uncertainSafe = result.level === 'safe' && confidence.level === 'low';
      const scoreLabel = uncertainSafe ? 'observed risk' : 'risk';
      const policyMessage = snapshot.policy.configured ? snapshot.policy.passed ? ' Repository policy passes.' : ` Repository policy failed with ${snapshot.policy.violations.length} violation(s).` : '';
      const gateMessage = snapshot.releaseGates.configured ? ` Release gates: ${snapshot.releaseGates.status.toUpperCase()}${snapshot.releaseGates.violations.length ? ` (${snapshot.releaseGates.violations.length} violations).` : '.'}` : '';
      const message = `DeployBuddy: ${result.score}% ${scoreLabel} — ${result.verdict.replaceAll('_', ' ')}. Release readiness: ${snapshot.readiness.status.replaceAll('_', ' ').toUpperCase()}.${gateMessage} ${confidenceMessage}${policyMessage}${caveat}`;
      const policyNeedsAttention = snapshot.policy.configured && !snapshot.policy.passed && result.level === 'safe';
      const action = await (snapshot.readiness.status === 'blocked' || result.level === 'danger' ? vscode.window.showErrorMessage(message, 'Show Details') : uncertainSafe || policyNeedsAttention || snapshot.readiness.status !== 'ready' || snapshot.releaseGates.status === 'fail' ? vscode.window.showWarningMessage(message, 'Show Details') : vscode.window.showInformationMessage(message, 'Show Details'));
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
      if (prePush) await recordSnapshot(snapshot);
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
    vscode.commands.registerCommand('deploybuddy.showPolicy', async () => {
      try {
        const snapshot = await session.getSnapshot(true);
        if (disposed) return;
        output.appendLine(`\n${formatPolicyReport(snapshot.signals.policy, snapshot.policy)}`);
        output.show(true);
      } catch { if (!disposed) vscode.window.showWarningMessage('DeployBuddy could not read the repository policy.'); }
    }),
    vscode.commands.registerCommand('deploybuddy.releaseReadiness', async () => {
      try {
        const snapshot = await session.getSnapshot(true);
        if (disposed) return;
        output.appendLine(`\n${formatReadinessReport(snapshot.readiness, snapshot.result.score, snapshot.confidence.score, snapshot.policy, snapshot.changes.attention.level)}`);
        output.show(true);
      } catch { if (!disposed) vscode.window.showWarningMessage('DeployBuddy could not evaluate release readiness.'); }
    }),
    vscode.commands.registerCommand('deploybuddy.checkReleaseGates', async () => {
      try { const snapshot = await session.getSnapshot(true); if (disposed) return; output.appendLine(`\\n${formatReleaseGatesReport(snapshot.releaseGates, snapshot.readiness, snapshot.result.score, snapshot.confidence.score, snapshot.policy, snapshot.changes.attention.level, snapshot.signals.policy?.policy?.release)}`); output.show(true); }
      catch { if (!disposed) vscode.window.showWarningMessage('DeployBuddy could not evaluate release gates.'); }
    }),
    vscode.commands.registerCommand('deploybuddy.createPolicyTemplate', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) { await vscode.window.showWarningMessage('Open a workspace folder before creating a DeployBuddy policy.'); return; }
      const uri = vscode.Uri.joinPath(folder.uri, '.deploybuddy.json');
      let exists = true;
      try { await vscode.workspace.fs.stat(uri); } catch { exists = false; }
      const action = await vscode.window.showWarningMessage(
        `${exists ? 'Overwrite' : 'Create'} DeployBuddy policy at ${uri.fsPath}?`,
        exists ? 'Overwrite Policy' : 'Create Policy', 'Cancel',
      );
      if (action !== (exists ? 'Overwrite Policy' : 'Create Policy')) return;
      const template = `${JSON.stringify({ version: 1, risk: { maxScore: 65 }, confidence: { minimumScore: 60 }, git: { requireClean: true } }, null, 2)}\n`;
      try { await vscode.workspace.fs.writeFile(uri, Buffer.from(template)); await vscode.window.showInformationMessage(`Created DeployBuddy policy: ${uri.fsPath}`); }
      catch { await vscode.window.showWarningMessage('DeployBuddy could not write the policy file. Check workspace permissions.'); }
    }),
    vscode.commands.registerCommand('deploybuddy.about', async () => {
      const choice = await vscode.window.showInformationMessage(
        `DeployBuddy v${version}\nYour brutally honest pre-deployment sanity checker.\n\nCommands include deployment check, explain, roast, Pre-Push Check, Git Health, Show Policy, and About.\nThe deterministic risk engine sets the score; policy is evaluated separately and AI only explains it.`,
        'Show Details'
      );
      if (choice === 'Show Details') output.show(true);
    }),
    vscode.commands.registerCommand('deploybuddy.showDetails', () => output.show(true)),
    vscode.commands.registerCommand('deploybuddy.saveBaseline', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { await vscode.window.showWarningMessage('Open a workspace folder before saving a DeployBuddy baseline.'); return; }
      try {
        const snapshot = await session.getSnapshot(true);
        const baseline = createAssessmentBaseline({ signals: snapshot.signals, risk: snapshot.result, confidence: snapshot.confidence, policy: snapshot.policy, readiness: snapshot.readiness, releaseGates: snapshot.releaseGates, recommendations: [] });
        await saveWorkspaceBaseline(context.globalState, root, baseline);
        await vscode.window.showInformationMessage(`DeployBuddy baseline saved locally (${baseline.risk.score}% risk).`);
      } catch { await vscode.window.showWarningMessage('DeployBuddy could not save a baseline for this workspace.'); }
    }),
    vscode.commands.registerCommand('deploybuddy.compareBaseline', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { await vscode.window.showWarningMessage('Open a workspace folder before comparing a DeployBuddy baseline.'); return; }
      const stored = readWorkspaceBaseline(context.globalState, root);
      if (!stored) { await vscode.window.showInformationMessage('No baseline is saved for the first workspace root.'); return; }
      if (stored.status !== 'valid') { output.appendLine(`${stored.message} Run Clear Baseline to reset it.`); output.show(true); return; }
      try {
        const snapshot = await session.getSnapshot(true);
        const current = createAssessmentBaseline({ signals: snapshot.signals, risk: snapshot.result, confidence: snapshot.confidence, policy: snapshot.policy, readiness: snapshot.readiness, releaseGates: snapshot.releaseGates, recommendations: [] });
        const delta = compareAssessments(stored.baseline, current);
        writeDeploymentReport(output, snapshot.signals, snapshot.result, snapshot.confidence, snapshot.policy, delta, snapshot.changes, snapshot.readiness, snapshot.releaseGates);
        output.show(true);
      } catch { await vscode.window.showWarningMessage('DeployBuddy could not compare the baseline.'); }
    }),
    vscode.commands.registerCommand('deploybuddy.clearBaseline', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { await vscode.window.showInformationMessage('There is no workspace baseline to clear.'); return; }
      await clearWorkspaceBaseline(context.globalState, root);
      await vscode.window.showInformationMessage('DeployBuddy baseline cleared.');
    }),
    vscode.commands.registerCommand('deploybuddy.showHistory', () => {
      const history = readWorkspaceHistory(context.globalState, firstRoot());
      output.appendLine(formatHistoryReport(history.entries));
      if (history.invalidCount || history.unsupportedCount) output.appendLine(`History note: skipped ${history.invalidCount + history.unsupportedCount} invalid or unsupported entries.`);
      output.show(true);
    }),
    vscode.commands.registerCommand('deploybuddy.showRiskChanges', () => {
      const history = readWorkspaceHistory(context.globalState, firstRoot());
      output.appendLine(formatRecentRiskChanges(history.entries));
      output.show(true);
    }),
    vscode.commands.registerCommand('deploybuddy.showChangedAreas', async () => {
      try { const snapshot = await session.getSnapshot(true); if (disposed) return; output.appendLine(`\n${formatChangedAreas(snapshot.changes)}`); output.show(true); }
      catch { if (!disposed) await vscode.window.showWarningMessage('DeployBuddy could not inspect changed file metadata.'); }
    }),
    vscode.commands.registerCommand('deploybuddy.clearHistory', async () => {
      const root = firstRoot();
      if (!root) { await vscode.window.showInformationMessage('There is no workspace history to clear.'); return; }
      const action = await vscode.window.showWarningMessage('Clear locally stored DeployBuddy assessment history for the first workspace root?', 'Clear History', 'Cancel');
      if (action !== 'Clear History') return;
      await clearWorkspaceHistory(context.globalState, root);
      if (session.latest) updateStatus(session.latest);
      await vscode.window.showInformationMessage('DeployBuddy assessment history cleared.');
    }),
    registerDeployBuddyParticipant(session, publishAI, context.globalState, recordSnapshot),
    { dispose() { disposed = true; session.dispose(); generation?.cancel(); generation?.dispose(); } });
  if (!context.globalState.get<boolean>('deploybuddy.onboardingShown')) {
    void context.globalState.update('deploybuddy.onboardingShown', true).then(() =>
      vscode.window.showInformationMessage('DeployBuddy is ready. Want to see whether deploying this workspace is a terrible idea?', 'Run Check', 'Not Now')
    ).then(choice => { if (choice === 'Run Check' && !disposed) void run('check'); });
  }
}
