import * as core from '@actions/core';
import type { DeploymentAssessment } from '@deploybuddy/core';
import type { PolicyEvaluation } from '@deploybuddy/core';
import type { ChangeAssessment } from '@deploybuddy/core';

export interface ActionAssessment extends DeploymentAssessment { policy: PolicyEvaluation; pullRequestRevision?: { headSha?: string; baseSha?: string }; changes?: ChangeAssessment }

export function assessmentJson(assessment: ActionAssessment): string {
  const { signals, risk, confidence, recommendations } = assessment;
  return JSON.stringify({
    risk: { score: risk.score, level: risk.level, verdict: risk.verdict },
    confidence: { score: confidence.score, level: confidence.level },
    ...(signals.git.revision ? { revision: signals.git.revision } : {}),
    ...(assessment.pullRequestRevision ? { pullRequest: assessment.pullRequestRevision } : {}),
    project: { frameworks: signals.project?.frameworks ?? [], packageManagers: signals.project?.packageManagers ?? [] },
    git: { available: signals.git.available, branch: signals.git.branch, upstream: signals.git.upstream, ahead: signals.git.ahead, behind: signals.git.behind, dirty: signals.git.hasUncommittedChanges, staged: signals.git.available ? signals.git.stagedFiles : null, unstaged: signals.git.unstagedFiles, untracked: signals.git.available ? signals.git.untrackedFiles : null, conflicts: signals.git.conflictFiles, detachedHead: signals.git.detachedHead },
    checks: signals.checks ?? [],
    recommendations,
    policy: assessment.policy,
    readiness: assessment.readiness,
    releaseGates: assessment.releaseGates,
    ...(assessment.changes ? { changes: { totalFiles: assessment.changes.summary.totalFiles, attention: assessment.changes.attention.level, categories: Object.fromEntries(assessment.changes.summary.categories.map(item => [item.category, item.count])), findings: assessment.changes.summary.findings.map(item => item.code) } } : {}),
  });
}

export function setOutputs(assessment: ActionAssessment, commentUrl = ''): string {
  const { signals, risk, confidence } = assessment;
  const json = assessmentJson(assessment);
  core.setOutput('risk-score', risk.score);
  core.setOutput('risk-level', risk.level);
  core.setOutput('verdict', risk.verdict);
  core.setOutput('confidence-score', confidence.score);
  core.setOutput('confidence-level', confidence.level);
  core.setOutput('release-readiness', assessment.readiness?.status ?? '');
  core.setOutput('release-gates-status', assessment.releaseGates?.status ?? 'not_configured');
  core.setOutput('release-gates-violations', JSON.stringify(assessment.releaseGates?.violations ?? []));
  core.setOutput('commit-sha', signals.git.revision?.sha ?? '');
  core.setOutput('commit-short-sha', signals.git.revision?.shortSha ?? '');
  core.setOutput('pull-request-head-sha', assessment.pullRequestRevision?.headSha ?? '');
  core.setOutput('pull-request-base-sha', assessment.pullRequestRevision?.baseSha ?? '');
  core.setOutput('frameworks', JSON.stringify(signals.project?.frameworks ?? []));
  core.setOutput('git-dirty', signals.git.available ? String(signals.git.hasUncommittedChanges) : 'unknown');
  core.setOutput('assessment-json', json);
  core.setOutput('comment-url', commentUrl);
  return json;
}
