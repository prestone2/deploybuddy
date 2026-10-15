import * as core from '@actions/core';
import { upsertPullRequestComment } from './prComment';
import { renderPullRequestComment, type AssessmentSections } from './presentation/report';

export async function publishPullRequestComment(enabled: boolean, token: string, report: AssessmentSections): Promise<string> {
  if (!enabled) return '';
  const github = await import('@actions/github');
  const context = github.context;
  if (context.eventName !== 'pull_request') return '';
  const number = context.payload.pull_request?.number;
  return upsertPullRequestComment({
    enabled,
    token,
    context: {
      eventName: context.eventName,
      repository: context.repo,
      pullRequestNumber: typeof number === 'number' ? number : undefined,
    },
  }, previousBody => renderPullRequestComment(report, previousBody), async authToken => {
    const client = github.getOctokit(authToken, { request: { timeout: 10_000 } });
    return {
      list: async (owner, repo, issueNumber) => {
        const comments = await client.paginate(client.rest.issues.listComments, {
          owner,
          repo,
          issue_number: issueNumber,
          per_page: 100,
        });
        return comments.map(comment => ({ id: comment.id, body: comment.body ?? null, html_url: comment.html_url }));
      },
      create: async (owner, repo, issueNumber, body) => {
        const result = await client.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
        return { html_url: result.data.html_url };
      },
      update: async (owner, repo, commentId, body) => {
        const result = await client.rest.issues.updateComment({ owner, repo, comment_id: commentId, body });
        return { html_url: result.data.html_url };
      },
    };
  }, message => core.warning(message));
}
