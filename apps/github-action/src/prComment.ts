export const DEPLOYBUDDY_COMMENT_MARKER = '<!-- deploybuddy-report -->';
export const COMMENT_PERMISSION_WARNING = 'DeployBuddy could not update the PR comment with the current token permissions.';

export interface PullRequestComment {
  id: number;
  body: string | null;
  html_url: string;
}

export interface PullRequestCommentApi {
  list(owner: string, repo: string, number: number): Promise<PullRequestComment[]>;
  create(owner: string, repo: string, number: number, body: string): Promise<{ html_url: string }>;
  update(owner: string, repo: string, id: number, body: string): Promise<{ html_url: string }>;
}

export interface PullRequestContext {
  eventName: string;
  repository: { owner: string; repo: string };
  pullRequestNumber?: number;
}

export interface CommentOptions {
  enabled: boolean;
  token: string;
  context: PullRequestContext;
}

export async function upsertPullRequestComment(
  options: CommentOptions,
  bodyForExisting: (previousBody: string) => string,
  makeApi: (token: string) => Promise<PullRequestCommentApi> | PullRequestCommentApi,
  warn: (message: string) => void,
): Promise<string> {
  if (!options.enabled || options.context.eventName !== 'pull_request') return '';
  const { owner, repo } = options.context.repository;
  const number = options.context.pullRequestNumber;
  if (!owner || !repo || !Number.isInteger(number) || !number) {
    warn('DeployBuddy could not identify the pull request for its comment.');
    return '';
  }
  if (!options.token) {
    warn(COMMENT_PERMISSION_WARNING);
    return '';
  }

  try {
    const api = await makeApi(options.token);
    const comments = await api.list(owner, repo, number);
    const existing = comments.find(comment => comment.body?.includes(DEPLOYBUDDY_COMMENT_MARKER));
    const body = bodyForExisting(existing?.body ?? '');
    const result = existing
      ? await api.update(owner, repo, existing.id, body)
      : await api.create(owner, repo, number, body);
    return result.html_url ?? '';
  } catch {
    // GitHub errors can contain request details. Do not log them or the token.
    warn(COMMENT_PERMISSION_WARNING);
    return '';
  }
}
