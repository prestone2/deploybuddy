#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, stderr } from 'node:process';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { analyzeChanges, analyzeGitGuardrails, calculateDeploymentRisk, calculateEvidenceConfidence, collectWorkspaceSignals, compareAssessments, compareRevisionEntries, createAssessmentBaseline, createAssessmentHistoryEntry, evaluatePolicy, evaluateReleaseGates, evaluateReleaseReadiness, findMaterialRiskChanges, findPolicyTransitions, findReadinessTransitions, findReleaseGateTransitions, findRevisionAssessment, getConfidenceAwareMessage, getDeploymentRecommendations, MATERIAL_RISK_CHANGE_THRESHOLD, parseDeployBuddyPolicy, summarizeHistory, type AssessmentBaseline, type AssessmentDelta, type AssessmentHistoryEntry, type ChangeAssessment, type CheckResult, type DeploymentAssessment, type HistorySummary, type PolicyEvaluation, type PolicyParseResult, type ProjectProfile, type ReleaseGateEvaluation, type ReleaseReadiness, type WorkspaceSignals } from '@deploybuddy/core';
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NodeWorkspaceAdapter } from './adapters/NodeWorkspaceAdapter';
import { clearLocalBaseline, readLocalBaseline, saveLocalBaseline } from './baselineStore';
import { appendLocalHistory, clearLocalHistory, readLocalHistory } from './historyStore';

const execFile = promisify(execFileCallback);
type Command = 'check' | 'status' | 'git' | 'framework' | 'checks' | 'doctor' | 'policy' | 'baseline' | 'compare' | 'history' | 'changes' | 'readiness' | 'release' | 'help';
type PolicyAction = 'show' | 'validate' | 'init';
type BaselineAction = 'save' | 'show' | 'clear';
type HistoryAction = 'list' | 'stats' | 'clear' | 'show' | 'commit' | 'changes';
interface ParsedArgs { command: Command; policyAction: PolicyAction; baselineAction: BaselineAction; historyAction: HistoryAction; historyQuery?: string; limit: number; yes: boolean; head: boolean; json: boolean; quiet: boolean; noColor: boolean; run: boolean; debug: boolean; base?: string; from?: string; to?: string }
export interface CliIO {
  readonly isTTY: boolean;
  write(text: string): void;
  writeError(text: string): void;
  confirm(message: string): Promise<boolean>;
  execute?(program: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string }>;
}
export interface Assessment extends DeploymentAssessment {
  readiness: ReleaseReadiness;
  releaseGates: ReleaseGateEvaluation;
  policy: PolicyEvaluation;
  policyParse: PolicyParseResult;
  changeAssessment?: ChangeAssessment;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const commands = new Set<Command>(['check', 'status', 'git', 'framework', 'checks', 'doctor', 'policy', 'baseline', 'compare', 'history', 'changes', 'readiness', 'release', 'help']);
  const commandName = argv.find(value => !value.startsWith('-')) ?? 'help';
  if (!commands.has(commandName as Command)) throw new Error(`Unknown command: ${commandName}. Run deploybuddy --help.`);
  const allowed = new Set(['--json', '--quiet', '--no-color', '--run', '--debug', '--help', '-h', '--limit', '--yes', '--head', '--base', '--from', '--to']);
  for (const arg of argv) if (arg.startsWith('-') && !allowed.has(arg)) throw new Error(`Unknown option: ${arg}.`);
  const command = argv.includes('--help') || argv.includes('-h') ? 'help' : commandName as Command;
  const policyAction: PolicyAction = argv.includes('validate') ? 'validate' : argv.includes('init') ? 'init' : 'show';
  const baselineAction: BaselineAction = argv.includes('save') ? 'save' : argv.includes('clear') ? 'clear' : 'show';
  const historyAction: HistoryAction = command === 'history' ? (['clear', 'stats', 'show', 'commit', 'changes'].find(item => argv.includes(item)) as HistoryAction | undefined) ?? 'list' : 'list';
  const limitIndex = argv.indexOf('--limit');
  const optionValue = (flag: string): string | undefined => { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1] : undefined; };
  const base = optionValue('--base'); const from = optionValue('--from'); const to = optionValue('--to');
  const validRevision = (value: string | undefined): value is string => Boolean(value && /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(value) && !value.includes('..') && !value.includes('//') && !value.endsWith('/') && !value.includes('@{'));
  for (const [flag, value] of [['--base', base], ['--from', from], ['--to', to]] as const) if (argv.includes(flag) && !validRevision(value)) throw new Error(`${flag} requires a valid Git revision.`);
  const rawLimit = limitIndex >= 0 ? argv[limitIndex + 1] : undefined;
  const limit = rawLimit === undefined ? 10 : Number(rawLimit);
  if (limitIndex >= 0 && (!/^\d+$/.test(rawLimit ?? '') || limit < 1 || limit > 100)) throw new Error('--limit must be an integer between 1 and 100.');
  if (argv.includes('validate') && argv.includes('init')) throw new Error('Choose one `deploybuddy policy` subcommand: validate or init.');
  const consumedValues = new Set([limitIndex + 1, argv.indexOf('--base') + 1, argv.indexOf('--from') + 1, argv.indexOf('--to') + 1]);
  const positionals = argv.filter((value, index) => !value.startsWith('-') && !consumedValues.has(index));
  if (command === 'policy' && positionals.some(value => !['policy', 'validate', 'init'].includes(value))) throw new Error(`Unknown policy subcommand: ${positionals.find(value => !['policy', 'validate', 'init'].includes(value))}.`);
  if (command === 'baseline' && positionals.some(value => !['baseline', 'save', 'show', 'clear'].includes(value))) throw new Error(`Unknown baseline subcommand: ${positionals.find(value => !['baseline', 'save', 'show', 'clear'].includes(value))}.`);
  if (command !== 'policy' && (argv.includes('validate') || argv.includes('init'))) throw new Error('`validate` and `init` are subcommands of `deploybuddy policy`.');
  if ((command !== 'baseline' && argv.includes('save')) || (command !== 'baseline' && command !== 'history' && argv.includes('clear'))) throw new Error('`save` and `clear` are subcommands of `deploybuddy baseline` (or `history clear`).');
  if (command !== 'history' && (argv.some(value => ['stats', 'commit'].includes(value) || (value === 'changes' && command !== 'changes')) || limitIndex >= 0 || argv.includes('--yes'))) throw new Error('History options are supported only by `deploybuddy history`.');
  if (command === 'history' && historyAction !== 'list' && limitIndex >= 0) throw new Error('--limit is supported only by the history list command.');
  if (command === 'history' && ['show', 'commit'].includes(historyAction) && positionals.filter(value => !['history', 'show', 'commit'].includes(value)).length !== 1) throw new Error(`Usage: deploybuddy history ${historyAction} <id-or-sha>.`);
  if (command === 'history' && !['show', 'commit'].includes(historyAction)) {
    const extra = positionals.filter(value => !['history', historyAction].includes(value));
    if (extra.length) throw new Error(`Unknown history subcommand or argument: ${extra[0]}.`);
  }
  if (argv.includes('--head') && command !== 'compare') throw new Error('--head is supported only by `deploybuddy compare`.');
  if ((base || from || to) && command !== 'changes') throw new Error('--base, --from and --to are supported only by `deploybuddy changes`.');
  if (command === 'changes' && (base !== undefined && (from !== undefined || to !== undefined) || (from === undefined) !== (to === undefined))) throw new Error('Use either `changes --base <revision>` or `changes --from <revision> --to <revision>`.');
  if (command === 'changes' && positionals.length !== 0) throw new Error('Usage: deploybuddy changes [--base <revision> | --from <revision> --to <revision>].');
  if (argv.includes('--yes') && (command !== 'history' || historyAction !== 'clear')) throw new Error('--yes is supported only by `deploybuddy history clear`.');
  if (command === 'history' && historyAction === 'clear' && argv.includes('--json')) throw new Error('--json is not supported by `deploybuddy history clear`.');
  const historyQuery = command === 'history' && ['show', 'commit'].includes(historyAction) ? positionals.filter(value => !['history', 'show', 'commit'].includes(value))[0] : undefined;
  return { command, policyAction, baselineAction, historyAction, ...(historyQuery ? { historyQuery } : {}), limit, yes: argv.includes('--yes'), head: argv.includes('--head'), json: argv.includes('--json'), quiet: argv.includes('--quiet'), noColor: argv.includes('--no-color'), run: argv.includes('--run'), debug: argv.includes('--debug') || Boolean(process.env.DEBUG?.split(',').some(value => value === '*' || value === 'deploybuddy')), ...(base ? { base } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

function color(text: string, ansi: string, enabled: boolean): string { return enabled ? `\u001b[${ansi}m${text}\u001b[0m` : text; }
function green(text: string, enabled: boolean): string { return color(text, '32', enabled); }
function yellow(text: string, enabled: boolean): string { return color(text, '33', enabled); }
function red(text: string, enabled: boolean): string { return color(text, '31', enabled); }
function mark(text: string, enabled: boolean, level: 'good' | 'warn' | 'bad' = 'good'): string { return level === 'bad' ? red(text, enabled) : level === 'warn' ? yellow(text, enabled) : green(text, enabled); }
// eslint-disable-next-line no-control-regex
function terminalText(value: string): string { return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, 240); }
const verdictDisplay = (risk: DeploymentAssessment['risk']): string => risk.verdict.replaceAll('_', ' ');

export async function getAssessment(adapter = new NodeWorkspaceAdapter()): Promise<Assessment> {
  const signals = await collectWorkspaceSignals(adapter);
  const risk = calculateDeploymentRisk(signals);
  const confidence = calculateEvidenceConfidence(signals);
  const policyParse = signals.policy ?? await adapter.getPolicy?.() ?? parseDeployBuddyPolicy(undefined);
  const policy = evaluatePolicy(policyParse, { risk, confidence, git: signals.git, diagnostics: signals.diagnostics, tests: signals.tests, checks: signals.checks ?? [], project: signals.project });
  const files = await adapter.getChangedFiles?.();
  const changeAssessment = files ? analyzeChanges(files) : undefined;
  const recommendations = getDeploymentRecommendations(signals);
  const readiness = evaluateReleaseReadiness({ risk, confidence, policy, changes: changeAssessment, signals, recommendations });
  const releaseGates = evaluateReleaseGates({ config: policyParse.policy?.release, risk, confidence, policy, changes: changeAssessment, readiness });
  return { signals, risk, confidence, recommendations, policy, readiness, releaseGates, policyParse, ...(changeAssessment ? { changeAssessment } : {}) };
}

function jsonReport(assessment: Assessment): string {
  const { signals: s, risk, confidence, recommendations } = assessment;
  return JSON.stringify({
    risk: { score: risk.score, verdict: risk.verdict, level: risk.level },
    confidence: { score: confidence.score, level: confidence.level },
    project: { frameworks: s.project?.frameworks ?? [] },
    ...(s.git.revision ? { revision: s.git.revision } : {}),
    ...(assessment.changeAssessment ? { changes: changeSummaryJSON(assessment.changeAssessment) } : {}),
    git: { available: s.git.available, branch: s.git.branch, upstream: s.git.upstream, ahead: s.git.ahead, behind: s.git.behind, dirty: s.git.hasUncommittedChanges, staged: s.git.available ? s.git.stagedFiles : null, unstaged: s.git.unstagedFiles, untracked: s.git.available ? s.git.untrackedFiles : null, conflicts: s.git.conflictFiles, detachedHead: s.git.detachedHead },
    checks: s.checks ?? [],
    recommendations,
    policy: assessment.policy,
    readiness: assessment.readiness,
    releaseGates: assessment.releaseGates,
  }, null, 2);
}

function changeSummaryJSON(assessment: ChangeAssessment): object {
  return { totalFiles: assessment.summary.totalFiles, attention: assessment.attention.level, categories: Object.fromEntries(assessment.summary.categories.map(item => [item.category, item.count])), findings: assessment.summary.findings.map(item => item.code) };
}

function changeReport(assessment: ChangeAssessment, json = false): string {
  if (json) return JSON.stringify({ totalFiles: assessment.summary.totalFiles, attention: assessment.attention.level, categories: Object.fromEntries(assessment.summary.categories.map(item => [item.category, item.count])), findings: assessment.summary.findings.map(item => item.code), reasons: assessment.attention.reasons }, null, 2);
  const label = (value: string): string => value[0]!.toUpperCase() + value.slice(1);
  return ['DeployBuddy Changes', '', `Changed files: ${assessment.summary.totalFiles}`, '', 'Categories:', ...(assessment.summary.categories.length ? assessment.summary.categories.map(item => `${label(item.category).padEnd(16)} ${item.count}`) : ['None detected.']), '', `Change attention: ${assessment.attention.level.toUpperCase()}`, '', 'Change findings:', ...(assessment.summary.findings.length ? assessment.summary.findings.map(item => `${item.severity === 'warning' ? '⚠' : '✓'} ${item.title}`) : ['No change findings.']), '', ...assessment.attention.reasons.map(reason => `- ${reason}`), '', 'No source code was inspected.'].join('\n');
}

function checkReport(assessment: Assessment, useColor: boolean): string {
  const { signals: s, risk, confidence, recommendations } = assessment;
  const uncertainSafe = risk.level === 'safe' && confidence.level === 'low';
  const lines = ['DeployBuddy', '', 'Project:', s.project?.frameworks.length ? s.project.frameworks.map(labelFramework).join(' + ') : 'Unknown', '', 'Branch:', s.git.available ? terminalText(s.git.branch ?? 'Detached HEAD / unborn') : 'Unavailable', ...(s.git.revision ? [`Commit: ${terminalText(s.git.revision.shortSha ?? s.git.revision.sha ?? '-')}`] : []), '', `${uncertainSafe ? 'Observed risk' : 'Risk'}: ${risk.score}% — ${verdictDisplay(risk)}`, `Confidence: ${confidence.score}% — ${confidence.level.toUpperCase()}`, ''];
  const blockers = risk.reasons.filter(item => ['errors', 'many-errors', 'failed-tests', 'primary-branch'].includes(item.code));
  const cautions = risk.reasons.filter(item => !blockers.includes(item));
  const findings = analyzeGitGuardrails(s.git);
  const dangerous = findings.filter(item => item.severity === 'danger');
  const blockerLines = dangerous.length ? dangerous.map(item => mark(`✗ ${terminalText(item.detail)}`, useColor, 'bad')) : blockers.map(item => mark(`✗ ${item.message}`, useColor, 'bad'));
  lines.push('BLOCKERS', ...(blockerLines.length ? blockerLines : ['None detected.']));
  const warningLines = findings.filter(item => item.severity === 'warning').map(item => mark(`! ${terminalText(item.detail)}`, useColor, 'warn'));
  const cautionLines = [...cautions.map(item => mark(`! ${item.message}`, useColor, 'warn')), ...warningLines];
  lines.push('', 'CAUTIONS', ...(cautionLines.length ? cautionLines : ['None detected.']));
  const positives: string[] = [];
  if (s.git.available && !s.git.hasUncommittedChanges) positives.push('Git working tree clean');
  if (s.checks?.some(item => item.kind === 'build' && item.status === 'available')) positives.push('Build available');
  lines.push('', 'LOOKS GOOD', ...(positives.length ? positives.map(item => mark(`✓ ${item}`, useColor)) : ['No positive checks confirmed.']));
  const unknown: string[] = [];
  if (s.tests.testStatus !== 'known') unknown.push('Tests have not been verified');
  if (!s.diagnostics.available) unknown.push('Workspace diagnostics unavailable in the CLI');
  lines.push('', 'UNKNOWN', ...(unknown.length ? unknown.map(item => `? ${item}`) : ['No unknown signals.']));
  if (s.project?.parseErrors.length) lines.push('', 'Project manifest warnings', ...s.project.parseErrors.map(item => `! ${item}`));
  const personality = risk.level === 'safe' ? 'Suspiciously responsible. Carry on.' : risk.level === 'caution' ? 'Technically deployable. Emotionally complicated.' : 'Production has reviewed your application and respectfully declined.';
  lines.push('', 'Policy:', !assessment.policy.configured ? 'Not configured' : assessment.policy.passed ? 'PASSED' : 'FAILED');
  lines.push('', 'Release Readiness:', assessment.readiness.status.replaceAll('_', ' ').toUpperCase(), '', 'Release Gates:', assessment.releaseGates.status.replaceAll('_', ' ').toUpperCase());
  if (assessment.releaseGates.violations.length) lines.push('Gate violations:', ...assessment.releaseGates.violations.map(item => `- ${terminalText(item.detail)}`));
  if (assessment.readiness.reasons.length) lines.push('Why:', ...assessment.readiness.reasons.map(item => `- ${terminalText(item.detail)}`));
  if (assessment.policy.violations.length) lines.push('Policy violations:', ...assessment.policy.violations.map(item => mark(`✗ ${terminalText(item.detail)}`, useColor, 'bad')));
  if (assessment.policy.configured && !assessment.policy.passed) lines.push('', risk.level === 'safe'
    ? 'Observed deployment risk is low, but this repository does not currently satisfy its deployment policy.'
    : `Observed deployment risk is ${risk.score}%, and this repository does not currently satisfy its deployment policy.`);
  if (assessment.changeAssessment) lines.push('', 'Change attention:', assessment.changeAssessment.attention.level.toUpperCase(), ...assessment.changeAssessment.summary.categories.map(item => `- ${item.category}: ${item.count}`), ...assessment.changeAssessment.attention.reasons.map(reason => `- ${reason}`));
  lines.push('', 'Next:', ...assessment.readiness.recommendedActions.slice(0, 3).map((action, index) => `${index + 1}. ${action}`), '', 'Recommendation:', recommendations[0]?.detail ?? risk.advice, '', getConfidenceAwareMessage(risk.level, confidence.level, personality));
  return lines.join('\n');
}

function labelFramework(value: string): string { return ({ 'laravel': 'Laravel', 'vite': 'Vite', 'react': 'React', 'vue': 'Vue', 'next.js': 'Next.js', 'nuxt': 'Nuxt', 'svelte': 'Svelte', 'angular': 'Angular', 'express': 'Express', 'nestjs': 'NestJS', 'astro': 'Astro' } as Record<string, string>)[value] ?? value; }
function statusReport(assessment: Assessment): string {
  const s = assessment.signals;
  const check = (kind: CheckResult['kind']): string => s.checks?.find(item => item.kind === kind)?.status === 'available' ? 'Available' : s.checks?.find(item => item.kind === kind)?.status === 'unavailable' ? 'Unavailable' : 'Unknown';
  const uncertainSafe = assessment.risk.level === 'safe' && assessment.confidence.level === 'low';
  return [`${uncertainSafe ? 'Observed risk' : 'Risk'}: ${assessment.risk.score}%`, `Confidence: ${assessment.confidence.score}%`, `Verdict: ${verdictDisplay(assessment.risk)}`, `Release Readiness: ${assessment.readiness.status.toUpperCase()}`, `Release Gates: ${assessment.releaseGates.status.toUpperCase()}`, `Policy: ${!assessment.policy.configured ? 'Not configured' : assessment.policy.passed ? 'PASS' : `${assessment.policy.violations.length} violations`}`, ...(uncertainSafe ? [getConfidenceAwareMessage(assessment.risk.level, assessment.confidence.level, assessment.risk.message)] : []), `Frameworks: ${s.project?.frameworks.map(labelFramework).join(', ') || 'None detected'}`, `Git: ${!s.git.available ? 'Unavailable' : s.git.hasUncommittedChanges ? 'Dirty' : 'Clean'}`, `Tests: ${s.tests.testStatus === 'known' ? 'Known results' : 'Unknown'}`, `Build: ${check('build')}`].join('\n');
}

function readinessReport(assessment: Assessment, json: boolean): string {
  if (json) return JSON.stringify(assessment.readiness, null, 2);
  return ['Release Readiness', '', 'Status:', assessment.readiness.status.replaceAll('_', ' ').toUpperCase(), '', 'Reasons:', ...(assessment.readiness.reasons.length ? assessment.readiness.reasons.map(reason => `- ${reason.detail}`) : ['No additional concerns.']), '', 'Recommended actions:', ...assessment.readiness.recommendedActions.map((action, index) => `${index + 1}. ${action}`)].join('\n');
}

function releaseReport(assessment: Assessment, json: boolean): string {
  if (json) return JSON.stringify(assessment.releaseGates, null, 2);
  const gates = assessment.releaseGates;
  if (!gates.configured) return 'DeployBuddy Release Gate\n\nStatus:\nNOT CONFIGURED\n\nNo release gates are configured in .deploybuddy.json.';
  return ['DeployBuddy Release Gate', '', 'Status:', gates.status.toUpperCase(), '', `Readiness: ${assessment.readiness.status.replaceAll('_', ' ').toUpperCase()}`, '', 'Gate violations:', ...(gates.violations.length ? gates.violations.map((item, index) => `${index + 1}. ${terminalText(item.detail)}`) : ['None.'])].join('\n');
}

function policyReport(assessment: Assessment, json: boolean): string {
  if (json) return JSON.stringify(assessment.policy, null, 2);
  const source = assessment.policy.configured ? '.deploybuddy.json' : 'Not configured';
  return ['DeployBuddy Policy', '', `Source: ${source}`, `Status: ${!assessment.policy.configured ? 'NOT CONFIGURED' : assessment.policy.passed ? 'PASSED' : 'FAILED'}`, `Rules evaluated: ${assessment.policy.rulesEvaluated}`, `Violations: ${assessment.policy.violations.length}`, ...(assessment.policy.violations.length ? assessment.policy.violations.map(item => `- ${terminalText(item.title)}: ${terminalText(item.detail)}`) : ['No policy violations.'])].join('\n');
}
export function formatDelta(previous: AssessmentBaseline, current: AssessmentBaseline, delta: AssessmentDelta): string {
  const signed = (value: number): string => `${value > 0 ? '+' : ''}${value}`;
  const value = (item: boolean | number | null): string => item === null ? 'unknown' : String(item);
  const policy = (value: boolean | undefined): string => value === undefined ? 'Not configured' : value ? 'PASS' : 'FAIL';
  return ['DeployBuddy Delta', '', `Risk: ${previous.risk.score}% → ${current.risk.score}% (${signed(delta.riskDelta)})`, `Confidence: ${previous.confidence.score}% → ${current.confidence.score}% (${signed(delta.confidenceDelta)})`, `Policy: ${policy(delta.previousPolicyPassed)} → ${policy(delta.currentPolicyPassed)}`, ...(delta.releaseGatesChanged ? [`Release Gates: ${delta.previousReleaseGatesStatus?.toUpperCase()} → ${delta.currentReleaseGatesStatus?.toUpperCase()}`] : []), '', 'Evidence changed:', ...(delta.changedSignals.length ? delta.changedSignals.map(item => `- ${item.code}: ${value(item.previous)} → ${value(item.current)}`) : ['None.']), '', 'New concerns:', ...(delta.addedFindings.length ? delta.addedFindings.map(item => `- ${item.title}`) : ['None.']), '', 'Resolved:', ...(delta.resolvedFindings.length ? delta.resolvedFindings.map(item => `- ${item.title}`) : ['None.']), '', `Overall: Deployment posture ${delta.posture.toLowerCase()}.`].join('\n');
}
function jsonDelta(previous: AssessmentBaseline, current: AssessmentBaseline, delta: AssessmentDelta): string {
  return JSON.stringify({ schemaVersion: 1, baseline: { risk: previous.risk, confidence: previous.confidence, policy: previous.policy }, current: { risk: current.risk, confidence: current.confidence, policy: current.policy }, delta }, null, 2);
}
function directionLabel(direction: HistorySummary['riskTrend']): string { return direction === 'insufficient-data' ? 'Insufficient data' : direction[0]!.toUpperCase() + direction.slice(1); }
function formatHistoryStats(summary: HistorySummary): string {
  return ['Summary', `Assessments: ${summary.count}`, `Average risk: ${summary.averageRisk === null ? 'Unknown' : `${summary.averageRisk}%`}`, `Highest risk: ${summary.highestRisk === null ? 'Unknown' : `${summary.highestRisk}%`}`, `Lowest risk: ${summary.lowestRisk === null ? 'Unknown' : `${summary.lowestRisk}%`}`, `Latest risk: ${summary.latestRisk === null ? 'Unknown' : `${summary.latestRisk}%`}`, '', `Average confidence: ${summary.averageConfidence === null ? 'Unknown' : `${summary.averageConfidence}%`}`, `Policy pass rate: ${summary.policyPassRate === null ? 'Not configured' : `${summary.policyPassRate}%`}`, `Release readiness pass rate: ${summary.readinessPassRate === null ? 'No readiness history' : `${summary.readinessPassRate}%`}`, `Release gate pass rate: ${summary.releaseGatePassRate === null ? 'No release gate history' : `${summary.releaseGatePassRate}%`}`, `Readiness: READY ${summary.readinessCounts.ready}, NEEDS ATTENTION ${summary.readinessCounts.needs_attention}, BLOCKED ${summary.readinessCounts.blocked}, INSUFFICIENT EVIDENCE ${summary.readinessCounts.insufficient_evidence}`, `Risk trend: ${directionLabel(summary.riskTrend)}`, `Confidence trend: ${directionLabel(summary.confidenceTrend)}`, '', 'Most common concerns:', ...(summary.frequentFindings.length ? summary.frequentFindings.map((item, index) => `${index + 1}. ${item.code} — ${item.count}`) : ['None recorded.'])].join('\n');
}
function formatHistory(entries: AssessmentHistoryEntry[], summary: HistorySummary, limit: number, warning?: string): string {
  const recent = entries.slice(-limit).reverse();
  const date = (value: string): string => value.slice(0, 16).replace('T', ' ');
  const policy = (entry: AssessmentHistoryEntry): string => !entry.policy?.configured ? 'N/A' : entry.policy.passed ? 'PASS' : 'FAIL';
  const rows = recent.map(entry => `${date(entry.recordedAt).padEnd(19)} ${(entry.revision?.shortSha ?? '-').padEnd(9)} ${`${entry.risk.score}%`.padEnd(6)} ${`${entry.confidence.score}%`.padEnd(12)} ${policy(entry)}`);
  return ['DeployBuddy History', '', `Last ${recent.length} assessment${recent.length === 1 ? '' : 's'}`, '', 'Date                 Commit    Risk   Confidence   Policy', ...rows, '', `Risk trend: ${directionLabel(summary.riskTrend)}`, `Confidence trend: ${directionLabel(summary.confidenceTrend)}`, '', formatHistoryStats(summary), ...(warning ? ['', `Warning: ${warning}`] : [])].join('\n');
}
function formatHistoryEntry(entry: AssessmentHistoryEntry): string {
  return ['DeployBuddy Recorded Assessment', '', `ID: ${terminalText(entry.id)}`, `Recorded: ${terminalText(entry.recordedAt)}`, `Commit: ${terminalText(entry.revision?.shortSha ?? entry.revision?.sha ?? '-')}`, `Branch: ${terminalText(entry.revision?.branch ?? '-')}`, `Detached HEAD: ${entry.revision?.detached === undefined ? 'Unknown' : entry.revision.detached ? 'Yes' : 'No'}`, `Risk: ${entry.risk.score}% — ${entry.risk.verdict}`, `Confidence: ${entry.confidence.score}% — ${entry.confidence.level.toUpperCase()}`, `Policy: ${!entry.policy?.configured ? 'Not configured' : entry.policy.passed ? 'PASS' : 'FAIL'}`, `Frameworks: ${entry.profile?.frameworks.map(labelFramework).join(', ') || 'Unknown'}`, `Signals: Git dirty ${entry.signals.gitDirty === null ? 'unknown' : entry.signals.gitDirty ? 'yes' : 'no'}; errors ${entry.signals.errors ?? 'unknown'}; warnings ${entry.signals.warnings ?? 'unknown'}; tests ${entry.signals.testsKnown ? 'known' : 'unknown'}; build ${entry.signals.buildKnown ? 'known' : 'unknown'}; lint ${entry.signals.lintKnown ? 'known' : 'unknown'}`, `Findings: ${entry.findings.map(terminalText).join(', ') || 'None'}`].join('\n');
}
function formatRiskChanges(entries: AssessmentHistoryEntry[]): string {
  const jumps = findMaterialRiskChanges(entries);
  return ['Deployment posture changes', '', ...(jumps.length ? jumps.slice().reverse().map((item, index) => {
    const from = entries.find(entry => entry.id === item.fromEntryId)!; const to = entries.find(entry => entry.id === item.toEntryId)!;
    return [`${index + 1}. Risk ${item.riskDelta > 0 ? `increased +${item.riskDelta}` : `decreased ${item.riskDelta}`}`, `   ${item.fromRevision ?? '-'} → ${item.toRevision ?? '-'}`, `   ${from.risk.score}% → ${to.risk.score}%`, ...(item.addedFindings.length ? ['   New:', ...item.addedFindings.map(code => `   - ${code}`)] : []), ...(item.resolvedFindings.length ? ['   Resolved:', ...item.resolvedFindings.map(code => `   - ${code}`)] : []), ...(item.policyChanged ? [`   Policy: ${from.policy?.passed ? 'PASS' : 'FAIL'} → ${to.policy?.passed ? 'PASS' : 'FAIL'}`] : [])].join('\n');
  }) : [`No material risk changes (${MATERIAL_RISK_CHANGE_THRESHOLD} points or more) are recorded.`])].join('\n');
}
async function recordHistory(assessment: Assessment, adapter: NodeWorkspaceAdapter, io: CliIO): Promise<void> {
  try {
    const entry = createAssessmentHistoryEntry(assessment, randomUUID());
    const result = await appendLocalHistory(adapter.cwd, entry);
    if (result.warning) io.writeError(`DeployBuddy: ${result.warning}\n`);
  } catch {
    io.writeError('DeployBuddy could not save this assessment to local history; the check result is unaffected.\n');
  }
}
function gitReport(signals: WorkspaceSignals, useColor: boolean): string {
  const git = signals.git;
  const guardrails = analyzeGitGuardrails(git);
  const count = (value: number | null): string => value === null ? 'Unknown' : String(value);
  const guardrailLines = guardrails.map(item => `${item.severity === 'danger' ? '✗' : item.severity === 'warning' ? '!' : '✓'} ${item.title}: ${item.detail}`);
  if (!guardrailLines.length) guardrailLines.push('✓ Branch synchronized enough for review.', '✓ No conflicts.');
  return ['Git Health', '', `Branch: ${git.available ? terminalText(git.branch ?? 'Detached HEAD / unborn') : 'Unavailable'}`, `Upstream: ${git.available ? terminalText(git.upstream ?? 'None configured') : 'Unknown'}`, '', `Ahead: ${count(git.ahead)}`, `Behind: ${count(git.behind)}`, '', 'Working tree:', !git.available ? 'Unknown' : git.hasUncommittedChanges ? 'Dirty' : 'Clean', `Staged: ${git.available ? git.stagedFiles : 'Unknown'}`, `Unstaged: ${count(git.unstagedFiles)}`, `Untracked: ${git.available ? git.untrackedFiles : 'Unknown'}`, `Conflicts: ${count(git.conflictFiles)}`, `Detached HEAD: ${git.detachedHead === null ? 'Unknown' : git.detachedHead ? 'Yes' : 'No'}`, '', 'Guardrails:', ...guardrailLines.map(line => { const safe = terminalText(line); return safe.startsWith('✗') ? red(safe, useColor) : safe.startsWith('!') ? yellow(safe, useColor) : green(safe, useColor); })].join('\n');
}
function frameworkReport(project: ProjectProfile): string {
  const frameworkLines = project.frameworks.length ? project.frameworks.map(item => `✓ ${labelFramework(item)}`) : ['? No framework markers detected.'];
  const managerLines = project.packageManagers.length ? project.packageManagers.map(item => `✓ ${item}`) : ['? None detected.'];
  return ['Detected project technologies:', '', ...frameworkLines, '', 'Package managers:', ...managerLines, '', 'Project roots:', ...(project.roots.length ? project.roots : ['(none detected)']), ...project.parseErrors.map(item => `Warning: ${item}`)].join('\n');
}
function checksReport(checks: CheckResult[]): string {
  return checks.map(item => `${capitalize(item.kind)}:\n${item.status.toUpperCase()}${item.command ? ` — ${terminalText(item.command)}` : ''}`).join('\n\n');
}
function capitalize(value: string): string { return value[0]?.toUpperCase() + value.slice(1); }

function doctorReport(assessment: Assessment, configValid: boolean, useColor: boolean): string {
  const s = assessment.signals;
  const hasPackage = (s.project?.roots.length ?? 0) > 0;
  const parseFailed = (s.project?.parseErrors.length ?? 0) > 0;
  const hasLaravel = s.project?.frameworks.includes('laravel') ?? false;
  const hasVite = s.project?.frameworks.includes('vite') ?? false;
  const testsKnown = s.tests.testStatus === 'known';
  const manifestState = parseFailed ? '! Project manifest parsing failed' : hasPackage ? '✓ Project manifests parsed' : '? No recognized project manifest';
  const lines = ['DeployBuddy Doctor', '', `${mark(s.git.available ? '✓ Git available' : '! Git unavailable', useColor, s.git.available ? 'good' : 'warn')}`, `${mark(s.git.available ? '✓ Repository detected' : '! No Git repository detected', useColor, s.git.available ? 'good' : 'warn')}`, '✓ Node.js available', `${mark(manifestState, useColor, hasPackage && !parseFailed ? 'good' : 'warn')}`];
  if (hasLaravel) lines.push(mark('✓ Laravel detected', useColor));
  if (hasVite) lines.push(mark('✓ Vite detected', useColor));
  const policyValid = assessment.policyParse.valid;
  lines.push(`${mark(configValid ? '✓ Configuration valid' : '! Configuration invalid; defaults are active', useColor, configValid ? 'good' : 'warn')}`, `${mark(policyValid ? '✓ Repository policy valid' : '! Repository policy invalid', useColor, policyValid ? 'good' : 'warn')}`, `${mark(testsKnown ? '✓ Test results available' : '! Test results unavailable', useColor, testsKnown ? 'good' : 'warn')}`, mark(configValid && policyValid ? '✓ No dangerous DeployBuddy configuration' : '! Review .deploybuddy.json before relying on its options', useColor, configValid && policyValid ? 'good' : 'warn'));
  for (const error of assessment.policyParse.errors) lines.push(`! Policy ${error.path}: ${error.message}`);
  for (const item of s.project?.parseErrors ?? []) lines.push(`! ${item}`);
  return lines.join('\n');
}

async function runDetectedChecks(checks: CheckResult[], adapter: NodeWorkspaceAdapter, io: CliIO): Promise<number> {
  if (!io.isTTY || !(await io.confirm('Run project scripts now? This executes commands declared in project manifests. [y/N] '))) {
    io.writeError('Checks were not run. Use an interactive terminal and confirm when prompted.\n');
    return 2;
  }
  let exitCode = 0;
  for (const check of checks) {
    if (check.status !== 'available' || !check.command) continue;
    const npmMatch = /^npm run ([a-z0-9][a-z0-9:_-]*)$/i.exec(check.command);
    const composerMatch = /^composer ([a-z0-9][a-z0-9:_-]*)$/i.exec(check.command);
    const artisanTests = check.command === 'php artisan test';
    const program = npmMatch ? 'npm' : composerMatch ? 'composer' : artisanTests ? 'php' : undefined;
    const args = npmMatch ? ['run', npmMatch[1] ?? ''] : composerMatch ? ['run-script', composerMatch[1] ?? ''] : artisanTests ? ['artisan', 'test'] : undefined;
    if (!program || !args) { io.writeError(`Skipping an unsupported check command: ${check.command}\n`); exitCode = 2; continue; }
    io.write(`\nRunning ${check.kind}: ${check.command}\n`);
    try {
      const result = io.execute ? await io.execute(program, args, adapter.cwd) : await execFile(program, args, { cwd: adapter.cwd, maxBuffer: 4 * 1024 * 1024, timeout: 15 * 60 * 1000, windowsHide: true });
      io.write(result.stdout + result.stderr);
    } catch (error) {
      const value = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
      io.write((value.stdout ?? '') + (value.stderr ?? ''));
      io.writeError(`${check.kind} failed${typeof value.code === 'number' ? ` with exit code ${value.code}` : ''}.\n`);
      exitCode = 1;
    }
  }
  return exitCode;
}

const usage = 'DeployBuddy CLI\n\nUsage: deploybuddy <check|status|git|framework|doctor|checks|policy|baseline|compare|history|changes|readiness|release> [--json] [--quiet] [--no-color]\n       deploybuddy checks --run\n       deploybuddy readiness [--json]\n       deploybuddy release [--json]\n       deploybuddy policy [--json]\n       deploybuddy policy validate\n       deploybuddy policy init\n       deploybuddy baseline save|show|clear\n       deploybuddy compare [--json]\n       deploybuddy compare --head [--json]\n       deploybuddy history [--limit 20] [--json]\n       deploybuddy history stats [--json]\n       deploybuddy history show <id-or-sha> [--json]\n       deploybuddy history commit <sha> [--json]\n       deploybuddy history changes [--json]\n       deploybuddy history clear [--yes]\n';

export async function runCLI(argv: string[], adapter = new NodeWorkspaceAdapter(), io: CliIO = {
  isTTY: Boolean(stdout.isTTY), write: text => stdout.write(text), writeError: text => stderr.write(text),
  confirm: async message => {
    const rl = createInterface({ input: stdin, output: stdout });
    try { return /^y(es)?$/i.test((await rl.question(message)).trim()); } finally { rl.close(); }
  },
}): Promise<number> {
  let args: ParsedArgs;
  try { args = parseArgs(argv); }
  catch (error) { io.writeError(`${terminalText(error instanceof Error ? error.message : String(error))}\n`); return 2; }
  adapter.beginCollection?.();
  const useColor = io.isTTY && !args.noColor && !process.env.NO_COLOR;
  if (args.command === 'help') { io.write(usage); return 0; }
  if ((args.json && !['check', 'policy', 'compare', 'baseline', 'history', 'changes', 'readiness', 'release'].includes(args.command)) || (args.quiet && args.command !== 'check')) { io.writeError('--json is supported by check, policy, baseline, compare, history, changes, readiness and release; --quiet is supported by check.\n'); return 2; }
  if (args.run && args.command !== 'checks') { io.writeError('--run is supported only by `deploybuddy checks`.\n'); return 2; }
  try {
    if (args.command === 'baseline') {
      if (args.baselineAction === 'clear') { await clearLocalBaseline(adapter.cwd); io.write('Local baseline cleared.\n'); return 0; }
      if (args.baselineAction === 'save') {
        const assessment = await getAssessment(adapter);
        const baseline = createAssessmentBaseline(assessment);
        await saveLocalBaseline(adapter.cwd, baseline);
        io.write(`Baseline saved locally for this project (${baseline.risk.score}% risk, ${baseline.confidence.score}% confidence).\n`); return 0;
      }
      const stored = await readLocalBaseline(adapter.cwd);
      if (!stored) { io.write(args.json ? `${JSON.stringify({ configured: false, baseline: null })}\n` : 'No local baseline saved for this project. Run `deploybuddy baseline save`.\n'); return 0; }
      const output = stored.status === 'valid' ? `DeployBuddy Baseline\n\nSaved: ${stored.baseline.recordedAt}\nRisk: ${stored.baseline.risk.score}% — ${stored.baseline.risk.verdict}\nConfidence: ${stored.baseline.confidence.score}% — ${stored.baseline.confidence.level.toUpperCase()}\nPolicy: ${stored.baseline.policy.configured ? stored.baseline.policy.passed ? 'PASS' : 'FAIL' : 'Not configured'}\n` : `${stored.message} Use deploybuddy baseline clear to reset it.\n`;
      io.write(args.json ? `${JSON.stringify({ configured: true, ...stored })}\n` : output);
      return stored.status === 'invalid' || stored.status === 'unsupported' ? 2 : 0;
    }
    if (args.command === 'compare') {
      if (args.head) {
        const assessment = await getAssessment(adapter);
        const current = createAssessmentHistoryEntry(assessment, randomUUID());
        const stored = await readLocalHistory(adapter.cwd);
        const currentRevision = current.revision?.sha ?? current.revision?.shortSha;
        const sameCommit = currentRevision ? findRevisionAssessment(stored.entries, currentRevision) : { status: 'missing' as const };
        const sameCommitIds = new Set(sameCommit.status === 'found' ? sameCommit.entries.map(entry => entry.id) : []);
        const previous = currentRevision ? [...stored.entries].reverse().find(entry => {
          const recorded = entry.revision?.sha ?? entry.revision?.shortSha;
          return recorded !== undefined && !sameCommitIds.has(entry.id);
        }) : undefined;
        if (!previous) {
          const payload = { schemaVersion: 1, available: false, message: currentRevision ? 'No prior assessment from a different recorded commit was found.' : 'Current Git revision is unavailable.' };
          io.write(args.json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`); return 0;
        }
        const comparison = compareRevisionEntries(previous, current);
        io.write(args.json ? `${JSON.stringify({ schemaVersion: 1, available: true, previous, current, comparison }, null, 2)}\n` : [`Compared recorded commit ${previous.revision?.shortSha ?? previous.revision?.sha ?? '-'} with current HEAD ${current.revision?.shortSha ?? current.revision?.sha ?? '-'}.`, `Risk: ${previous.risk.score}% → ${current.risk.score}% (${comparison.riskDelta > 0 ? '+' : ''}${comparison.riskDelta})`, `Confidence: ${previous.confidence.score}% → ${current.confidence.score}% (${comparison.confidenceDelta > 0 ? '+' : ''}${comparison.confidenceDelta})`, `Policy: ${previous.policy?.passed ? 'PASS' : 'FAIL'} → ${current.policy?.passed ? 'PASS' : 'FAIL'}`, `New findings: ${comparison.addedFindings.join(', ') || 'None'}`, `Resolved findings: ${comparison.resolvedFindings.join(', ') || 'None'}`].join('\n') + '\n'); return 0;
      }
      const stored = await readLocalBaseline(adapter.cwd);
      if (!stored) { io.write(args.json ? `${JSON.stringify({ schemaVersion: 1, available: false, message: 'No local baseline is saved.' })}\n` : 'No local baseline saved for this project. Run `deploybuddy baseline save` first.\n'); return 0; }
      if (stored.status !== 'valid') { io.write(args.json ? `${JSON.stringify({ schemaVersion: 1, available: false, baselineStatus: stored.status, message: stored.message })}\n` : `${stored.message} Use deploybuddy baseline clear to reset it.\n`); return 2; }
      const assessment = await getAssessment(adapter);
      const current = createAssessmentBaseline(assessment);
      const delta = compareAssessments(stored.baseline, current);
      io.write(`${args.json ? jsonDelta(stored.baseline, current, delta) : formatDelta(stored.baseline, current, delta)}\n`);
      return 0;
    }
    if (args.command === 'history') {
      if (args.historyAction === 'clear') {
        if (!args.yes && (!io.isTTY || !(await io.confirm('Clear all local DeployBuddy history for this project? [y/N] ')))) {
          io.writeError('History was not cleared. Use an interactive confirmation or pass --yes.\n'); return 2;
        }
        await clearLocalHistory(adapter.cwd); io.write('Local DeployBuddy history cleared.\n'); return 0;
      }
      const stored = await readLocalHistory(adapter.cwd);
      if (args.historyAction === 'show') {
        const query = args.historyQuery ?? '';
        const byId = stored.entries.find(entry => entry.id === query);
        if (byId) { io.write(args.json ? `${JSON.stringify({ schemaVersion: 1, entry: byId }, null, 2)}\n` : `${formatHistoryEntry(byId)}\n`); return 0; }
        const lookup = findRevisionAssessment(stored.entries, query);
        if (lookup.status === 'ambiguous') { io.writeError(`Revision prefix ${query} is ambiguous; use a longer SHA.\n`); return 2; }
        if (lookup.status === 'missing') { io.write(args.json ? `${JSON.stringify({ schemaVersion: 1, found: false })}\n` : `No assessment matches ID or revision ${query}.\n`); return 0; }
        const entry = lookup.entries.at(-1)!;
        io.write(args.json ? `${JSON.stringify({ schemaVersion: 1, entry }, null, 2)}\n` : `${formatHistoryEntry(entry)}\n`); return 0;
      }
      if (args.historyAction === 'commit') {
        const lookup = findRevisionAssessment(stored.entries, args.historyQuery ?? '');
        if (lookup.status === 'ambiguous') { io.writeError(`Revision prefix ${args.historyQuery} is ambiguous; use a longer SHA.\n`); return 2; }
        const entries = lookup.status === 'found' ? lookup.entries : [];
        io.write(args.json ? `${JSON.stringify({ schemaVersion: 1, revision: args.historyQuery, entries }, null, 2)}\n` : entries.length ? formatHistory(entries, summarizeHistory(entries), entries.length, stored.warning) + '\n' : `No local assessment is associated with revision ${args.historyQuery}.\n`); return 0;
      }
      if (args.historyAction === 'changes') {
        const jumps = findMaterialRiskChanges(stored.entries);
        const transitions = findPolicyTransitions(stored.entries);
        const readinessTransitions = findReadinessTransitions(stored.entries);
        const releaseGateTransitions = findReleaseGateTransitions(stored.entries);
        const payload = { schemaVersion: 1, threshold: MATERIAL_RISK_CHANGE_THRESHOLD, riskChanges: jumps, policyTransitions: transitions, readinessTransitions, releaseGateTransitions };
        if (args.json) io.write(`${JSON.stringify(payload, null, 2)}\n`);
        else {
          io.write(`${formatRiskChanges(stored.entries)}\n`);
          const startedFailing = transitions.find(item => item.transition === 'PASS_TO_FAIL');
          if (startedFailing) io.write(`\nPolicy started failing at: ${startedFailing.toRevision ?? '-'}\nViolations introduced: ${startedFailing.introducedViolations.join(', ') || 'Unknown'}\n`);
          for (const transition of readinessTransitions) io.write(`\nRelease readiness changed: ${transition.previous.toUpperCase()} → ${transition.current.toUpperCase()}\n`);
          for (const transition of releaseGateTransitions) io.write(`\nRelease gates changed: ${transition.previous.toUpperCase()} → ${transition.current.toUpperCase()}\n`);
        }
        return 0;
      }
      const summary = summarizeHistory(stored.entries);
      const entries = args.historyAction === 'stats' ? [] : stored.entries.slice(-args.limit).reverse();
      const payload = { schemaVersion: 1, entries, summary, ...(stored.warning ? { warnings: [stored.warning] } : {}) };
      io.write(args.json ? `${JSON.stringify(payload, null, 2)}\n` : args.historyAction === 'stats' ? `${formatHistoryStats(summary)}${stored.warning ? `\n\nWarning: ${stored.warning}` : ''}\n` : `${formatHistory(stored.entries, summary, args.limit, stored.warning)}\n`);
      return 0;
    }
    if (args.command === 'changes') {
      const range = args.from && args.to ? { from: args.from, to: args.to } : args.base ? { base: args.base } : undefined;
      const files = await adapter.getChangedFiles?.(range);
      io.write(`${changeReport(analyzeChanges(files ?? []), args.json)}\n`);
      return 0;
    }
    if (args.command === 'policy') {
      if (args.policyAction === 'init') {
        const target = path.join(adapter.cwd, '.deploybuddy.json');
        let exists = true;
        try { await access(target); } catch { exists = false; }
        if (exists && (!io.isTTY || !(await io.confirm(`Overwrite ${target}? This replaces the existing policy/configuration. [y/N] `)))) {
          io.writeError(`Refusing to overwrite ${target} without confirmation.\n`); return 2;
        }
        const template = `${JSON.stringify({ version: 1, risk: { maxScore: 65 }, confidence: { minimumScore: 60 }, git: { requireClean: true } }, null, 2)}\n`;
        await writeFile(target, template, exists ? 'utf8' : { encoding: 'utf8', flag: 'wx' });
        io.write(`Created policy template: ${target}\n`); return 0;
      }
      if (args.policyAction === 'validate') {
        const parsed = await adapter.getPolicy?.() ?? parseDeployBuddyPolicy(undefined);
        if (!parsed.configured) { io.write('No repository deployment policy is configured.\n'); return 0; }
        if (parsed.valid) { io.write('✓ .deploybuddy.json is valid.\n'); return 0; }
        io.write(`Invalid DeployBuddy policy:\n\n${parsed.errors.map(error => `${terminalText(error.path)}: ${terminalText(error.message)}`).join('\n')}\n`); return 2;
      }
      const assessment = await getAssessment(adapter);
      io.write(`${policyReport(assessment, args.json)}\n`);
      return assessment.policy.configured && !assessment.policy.passed ? 1 : 0;
    }
    if (args.command === 'readiness') {
      const assessment = await getAssessment(adapter);
      io.write(`${readinessReport(assessment, args.json)}\n`);
      return ['blocked', 'insufficient_evidence'].includes(assessment.readiness.status) ? 1 : 0;
    }
    if (args.command === 'release') {
      const assessment = await getAssessment(adapter);
      if (!assessment.policyParse.valid) {
        io.write(args.json ? `${JSON.stringify({ error: { message: 'Repository configuration is invalid.', errors: assessment.policyParse.errors } })}\n` : `Invalid DeployBuddy policy/configuration:\n\n${assessment.policyParse.errors.map(error => `${terminalText(error.path)}: ${terminalText(error.message)}`).join('\n')}\n`);
        return 2;
      }
      io.write(`${releaseReport(assessment, args.json)}\n`);
      return assessment.releaseGates.status === 'fail' ? 1 : 0;
    }
    if (args.command === 'check' || args.command === 'status' || args.command === 'git') {
      const assessment = await getAssessment(adapter);
      if (args.command === 'check') {
        await recordHistory(assessment, adapter, io);
        if (args.json) io.write(`${jsonReport(assessment)}\n`);
        else if (args.quiet) io.write(`${verdictDisplay(assessment.risk)} ${assessment.risk.score}\n`);
        else io.write(`${checkReport(assessment, useColor)}\n`);
        return (assessment.risk.level === 'danger' && (assessment.signals.config?.exitOnDanger ?? true)) || (assessment.policy.configured && !assessment.policy.passed) ? 1 : 0;
      }
      io.write(args.command === 'status' ? `${statusReport(assessment)}\n` : `${gitReport(assessment.signals, useColor)}\n`);
      return 0;
    }
    if (args.command === 'framework') { io.write(`${frameworkReport(await adapter.getProjectProfile())}\n`); return 0; }
    if (args.command === 'checks') {
      const checks = await adapter.getCheckResults();
      return args.run ? await runDetectedChecks(checks, adapter, io) : (io.write(`${checksReport(checks)}\n`), 0);
    }
    const assessment = await getAssessment(adapter);
    const config = await adapter.getConfig?.();
    const configValid = (config?.valid ?? true) && assessment.policyParse.valid;
    io.write(`${doctorReport(assessment, configValid, useColor)}\n`);
    return configValid ? 0 : 2;
  } catch (error) {
    if (args.json) io.write(`${JSON.stringify({ error: { message: 'DeployBuddy could not inspect this project. Check file permissions and try again.', code: 'INSPECTION_FAILED' } })}\n`);
    else {
      io.writeError(`DeployBuddy could not inspect this project: ${terminalText(error instanceof Error ? error.message : String(error))}\n`);
      if (args.debug) io.writeError(error instanceof Error ? `${error.stack ?? ''}\n` : '');
    }
    return 2;
  }
}

if (require.main === module) void runCLI(process.argv.slice(2)).then(code => { process.exitCode = code; });
