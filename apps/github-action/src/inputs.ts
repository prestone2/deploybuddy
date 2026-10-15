import * as core from '@actions/core';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { getGitHubContext } from './githubContext';

export interface ActionInputs {
  workingDirectory: string;
  failOnRisk: number | null;
  failOnReadiness: boolean;
  failOnReleaseGates: boolean;
  createAnnotations: boolean;
  prComment: boolean;
  githubToken: string;
}

export function readInputs(workspace = getGitHubContext().workspace): ActionInputs {
  const requested = core.getInput('working-directory') || '.';
  const workspacePath = path.resolve(workspace);
  const requestedPath = path.resolve(workspacePath, requested);
  const relative = path.relative(workspacePath, requestedPath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('working-directory must stay inside GITHUB_WORKSPACE.');
  }
  let workingDirectory: string;
  try {
    const realWorkspace = realpathSync.native(workspacePath);
    workingDirectory = realpathSync.native(requestedPath);
    const realRelative = path.relative(realWorkspace, workingDirectory);
    if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
      throw new Error('working-directory must stay inside GITHUB_WORKSPACE, including through symbolic links.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('must stay inside')) throw error;
    throw new Error(`working-directory does not exist or cannot be accessed: ${requested}`, { cause: error });
  }

  const rawThreshold = core.getInput('fail-on-risk');
  let failOnRisk: number | null = null;
  if (rawThreshold.trim() !== '') {
    const threshold = Number(rawThreshold);
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) {
      throw new Error('fail-on-risk must be an integer from 0 to 100, or empty to disable failing the step.');
    }
    failOnRisk = threshold;
  }

  const annotationInput = core.getInput('create-annotations');
  if (!['true', 'false'].includes(annotationInput.toLowerCase())) {
    throw new Error('create-annotations must be true or false.');
  }
  const prCommentInput = core.getInput('pr-comment') || 'false';
  if (!['true', 'false'].includes(prCommentInput.toLowerCase())) {
    throw new Error('pr-comment must be true or false.');
  }
  const failOnReadinessInput = core.getInput('fail-on-readiness') || 'false';
  if (!['true', 'false'].includes(failOnReadinessInput.toLowerCase())) throw new Error('fail-on-readiness must be true or false.');
  const failOnReleaseGatesInput = core.getInput('fail-on-release-gates') || 'true';
  if (!['true', 'false'].includes(failOnReleaseGatesInput.toLowerCase())) throw new Error('fail-on-release-gates must be true or false.');
  return {
    workingDirectory,
    failOnRisk,
    failOnReadiness: failOnReadinessInput.toLowerCase() === 'true',
    failOnReleaseGates: failOnReleaseGatesInput.toLowerCase() === 'true',
    createAnnotations: annotationInput.toLowerCase() === 'true',
    prComment: prCommentInput.toLowerCase() === 'true',
    githubToken: core.getInput('github-token'),
  };
}
