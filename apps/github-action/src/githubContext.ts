import path from 'node:path';

export interface GitHubContext {
  workspace: string;
  repository: string;
  ref: string;
  sha: string;
  eventName: string;
  runId: string;
  pullRequestRevision?: { headSha?: string; baseSha?: string };
}

export function getGitHubContext(env: NodeJS.ProcessEnv = process.env, payload?: unknown): GitHubContext {
  const event = isObject(payload) ? payload : {};
  const pr = isObject(event.pull_request) ? event.pull_request : {};
  const head = isObject(pr.head) ? pr.head : {};
  const base = isObject(pr.base) ? pr.base : {};
  const sha = (value: unknown): string | undefined => typeof value === 'string' && /^[a-f0-9]{40,64}$/i.test(value) ? value.toLowerCase() : undefined;
  const headSha = sha(head.sha); const baseSha = sha(base.sha);
  return {
    workspace: path.resolve(env.GITHUB_WORKSPACE || process.cwd()),
    repository: env.GITHUB_REPOSITORY ?? '',
    ref: env.GITHUB_REF ?? '',
    sha: env.GITHUB_SHA ?? '',
    eventName: env.GITHUB_EVENT_NAME ?? '',
    runId: env.GITHUB_RUN_ID ?? '',
    ...(env.GITHUB_EVENT_NAME === 'pull_request' && (headSha || baseSha) ? { pullRequestRevision: { ...(headSha ? { headSha } : {}), ...(baseSha ? { baseSha } : {}) } } : {}),
  };
}

function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
