import * as core from '@actions/core';
import { analyzeChanges, calculateDeploymentRisk, calculateEvidenceConfidence, collectWorkspaceSignals, getDeploymentRecommendations, type ChangedFile } from '@deploybuddy/core';
import { NodeWorkspaceAdapter } from '@deploybuddy/node-adapter';
import { publishAnnotations } from './annotations';
import { readInputs } from './inputs';
import { setOutputs } from './outputs';
import { writeSummary } from './summary';
import { buildAssessmentSections, normalizePullRequestFiles } from './presentation/report';
import { publishPullRequestComment } from './githubComment';
import { getGitHubContext } from './githubContext';

export async function run(): Promise<void> {
  const inputs = readInputs();
  core.info(`DeployBuddy is inspecting ${inputs.workingDirectory}.`);
  const adapter = new NodeWorkspaceAdapter(inputs.workingDirectory);
  adapter.beginCollection();
  const signals = await collectWorkspaceSignals(adapter);
  const risk = calculateDeploymentRisk(signals);
  const confidence = calculateEvidenceConfidence(signals);
  const recommendations = getDeploymentRecommendations(signals);
  const github = await import('@actions/github');
  const githubContext = getGitHubContext(process.env, github.context.payload);
  let changedFiles: ChangedFile[] = await adapter.getChangedFiles();
  const pullRequestNumber = github.context.payload.pull_request?.number;
  if (githubContext.pullRequestRevision && typeof pullRequestNumber === 'number') {
    try {
      if (inputs.githubToken) {
        const { owner, repo } = github.context.repo;
        const octokit = github.getOctokit(inputs.githubToken);
        const files = await octokit.paginate(octokit.rest.pulls.listFiles, { owner, repo, pull_number: pullRequestNumber, per_page: 100 });
        changedFiles = normalizePullRequestFiles(files);
      } else if (githubContext.pullRequestRevision.baseSha && githubContext.pullRequestRevision.headSha) {
        changedFiles = await adapter.getChangedFiles({ from: githubContext.pullRequestRevision.baseSha, to: githubContext.pullRequestRevision.headSha });
      }
    } catch {
      core.warning('DeployBuddy could not read pull request file metadata; change attention is based on checked-out workspace metadata.');
    }
  }
  const assessment = { signals, risk, confidence, recommendations, pullRequestRevision: githubContext.pullRequestRevision, changes: analyzeChanges(changedFiles) };
  const baseBranch = process.env.GITHUB_BASE_REF;
  const presentation = buildAssessmentSections({ ...assessment, changedFiles }, typeof baseBranch === 'string' ? baseBranch : 'unknown');
  const actionAssessment = { ...assessment, policy: presentation.policy, readiness: presentation.readiness, releaseGates: presentation.releaseGates };

  publishAnnotations(signals, inputs.createAnnotations, risk);
  await writeSummary(presentation);
  const commentUrl = await publishPullRequestComment(inputs.prComment, inputs.githubToken, presentation);
  setOutputs(actionAssessment, commentUrl);

  core.info(`DeployBuddy risk ${risk.score}% — ${risk.verdict}.`);
  if (presentation.policy.configured && !presentation.policy.passed) {
    core.setFailed(`DeployBuddy repository policy failed with ${presentation.policy.violations.length} violation(s). ${presentation.policy.violations.map(item => item.title).join('; ')}`);
  } else if (inputs.failOnRisk !== null && risk.score >= inputs.failOnRisk) {
    core.setFailed(`DeployBuddy risk ${risk.score}% met the configured failure threshold (${inputs.failOnRisk}%). ${risk.advice}`);
  } else if (inputs.failOnReadiness && ['blocked', 'insufficient_evidence'].includes(presentation.readiness.status)) {
    core.setFailed(`DeployBuddy release readiness is ${presentation.readiness.status}. ${presentation.readiness.reasons.map(item => item.detail).join('; ')}`);
  } else if (inputs.failOnReleaseGates && presentation.releaseGates.configured && presentation.releaseGates.status === 'fail') {
    core.setFailed(`DeployBuddy release gates failed with ${presentation.releaseGates.violations.length} violation(s). ${presentation.releaseGates.violations.map(item => item.title).join('; ')}`);
  } else {
    core.info(risk.message);
  }
}
