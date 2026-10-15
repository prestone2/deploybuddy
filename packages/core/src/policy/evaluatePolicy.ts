import type { PolicyEvidence, PolicyEvaluation, PolicyParseResult, PolicyViolation } from '../types/policy';

export function evaluatePolicy(parsed: PolicyParseResult | undefined, evidence: PolicyEvidence): PolicyEvaluation {
  if (!parsed?.configured) return { configured: false, passed: true, rulesEvaluated: 0, violations: [] };
  const violations: PolicyViolation[] = [];
  if (!parsed.valid || !parsed.policy) {
    for (const error of parsed.errors) violations.push({ code: 'policy.invalid', severity: 'error', title: 'Invalid repository policy', detail: `${error.path}: ${error.message}` });
    return { configured: true, passed: false, rulesEvaluated: 0, violations };
  }
  const policy = parsed.policy;
  let rulesEvaluated = 0;
  const fail = (code: string, title: string, detail: string): void => { violations.push({ code, severity: 'error', title, detail }); };
  const rule = (condition: boolean, check: () => void): void => { rulesEvaluated++; if (condition) check(); };

  if (policy.risk?.maxScore !== undefined) rule(evidence.risk.score > policy.risk.maxScore, () => fail('risk.maximum', 'Risk exceeds repository limit', `Risk is ${evidence.risk.score}%, but policy allows at most ${policy.risk?.maxScore}%.`));
  if (policy.risk?.failOnQuestionable !== undefined) rule(policy.risk.failOnQuestionable && evidence.risk.level !== 'safe', () => fail('risk.questionable', 'Questionable risk is not allowed', `Policy requires a safe risk level; current verdict is ${evidence.risk.verdict}.`));
  if (policy.confidence?.minimumScore !== undefined) rule(evidence.confidence.score < policy.confidence.minimumScore, () => fail('confidence.minimum', 'Insufficient evidence confidence', `Confidence is ${evidence.confidence.score}%, but repository policy requires at least ${policy.confidence?.minimumScore}%.`));

  const git = evidence.git;
  if (policy.git?.requireClean !== undefined) rule(policy.git.requireClean && (!git.available || git.hasUncommittedChanges), () => fail('git.clean', 'Working tree must be clean', git.available ? `Working tree has ${git.changedFiles} uncommitted files; policy requires a clean tree.` : 'Git state is unavailable; policy requires a clean working tree.'));
  if (policy.git?.requireUpToDate !== undefined) rule(policy.git.requireUpToDate && (!git.available || !git.upstream || git.behind === null || git.behind > 0), () => fail('git.up-to-date', 'Branch must be synchronized with upstream', !git.available || !git.upstream || git.behind === null ? 'Upstream status is unknown; policy requires verified synchronization.' : `Branch is ${git.behind} commits behind upstream.`));
  if (policy.git?.allowDetachedHead !== undefined) rule(!policy.git.allowDetachedHead && (!git.available || git.detachedHead !== false), () => fail('git.detached-head', 'Branch must be attached', git.detachedHead === true ? 'HEAD is detached; policy does not allow detached HEAD.' : 'HEAD state is unknown; policy requires a verified branch.'));
  if (policy.git?.allowUntracked !== undefined) rule(!policy.git.allowUntracked && (!git.available || git.untrackedFiles > 0), () => fail('git.untracked', 'Untracked files are not allowed', git.available ? `Working tree has ${git.untrackedFiles} untracked files; policy allows none.` : 'Git state is unavailable; untracked-file status cannot be verified.'));

  if (policy.diagnostics?.maxErrors !== undefined) rule(!evidence.diagnostics.available || evidence.diagnostics.errors > policy.diagnostics.maxErrors, () => fail('diagnostics.errors', 'Diagnostic error limit exceeded', evidence.diagnostics.available ? `Workspace diagnostics contain ${evidence.diagnostics.errors} errors; policy allows ${policy.diagnostics?.maxErrors}.` : 'Diagnostic results are unknown; policy requires verified error counts.'));
  if (policy.diagnostics?.maxWarnings !== undefined) rule(!evidence.diagnostics.available || evidence.diagnostics.warnings > policy.diagnostics.maxWarnings, () => fail('diagnostics.warnings', 'Diagnostic warning limit exceeded', evidence.diagnostics.available ? `Workspace diagnostics contain ${evidence.diagnostics.warnings} warnings; policy allows ${policy.diagnostics?.maxWarnings}.` : 'Diagnostic results are unknown; policy requires verified warning counts.'));

  if (policy.evidence?.requireTests !== undefined) rule(policy.evidence.requireTests && (evidence.tests.testStatus !== 'known' || evidence.tests.passed === null || evidence.tests.failed === null || evidence.tests.failed > 0), () => fail('evidence.tests', 'Tests must pass with verified results', evidence.tests.testStatus !== 'known' || evidence.tests.passed === null || evidence.tests.failed === null ? 'Test results are unknown; a detected test command is not verified execution evidence.' : `${evidence.tests.failed} tests failed; policy requires verified passing tests.`));
  for (const kind of ['build', 'lint'] as const) {
    const required = policy.evidence?.[kind === 'build' ? 'requireBuild' : 'requireLint'];
    if (required !== undefined) rule(required && evidence.checks.find(check => check.kind === kind)?.result !== 'passed', () => fail(`evidence.${kind}`, `${kind === 'build' ? 'Build' : 'Lint'} must pass with verified results`, `No successful ${kind} execution result is available; command availability alone does not satisfy policy.`));
  }

  const detected = new Set(evidence.project?.frameworks ?? []);
  for (const required of policy.frameworks?.required ?? []) rule(!detected.has(required), () => fail('frameworks.required', 'Required framework is missing', `Repository policy requires ${required}, which was not detected.`));
  if (policy.frameworks?.allowed) {
    if (!evidence.project?.available) rule(true, () => fail('frameworks.unknown', 'Framework evidence is unavailable', 'Project framework detection is unknown; policy requires a verified allowed-framework set.'));
    else for (const framework of detected) rule(!policy.frameworks.allowed.includes(framework as typeof policy.frameworks.allowed[number]), () => fail('frameworks.allowed', 'Framework is not allowed', `${framework} was detected but is not in the repository policy allowlist.`));
  }

  return { configured: true, passed: violations.length === 0, rulesEvaluated, violations };
}
