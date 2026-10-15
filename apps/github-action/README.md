# DeployBuddy GitHub Action

DeployBuddy provides a deterministic pre-deployment assessment for a checked-out repository. It uses the same `@deploybuddy/core` scoring, confidence, Git guardrails, project detection, and recommendation logic as the VS Code extension and CLI. The Action does not run tests/builds, deploy, or modify repository state; test results remain unknown unless collected by an environment adapter.

```yaml
name: DeployBuddy

on:
  pull_request:
  push:
    branches: [main]

jobs:
  deploybuddy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: DeployBuddy
        uses: ./apps/github-action
```

After release, consumers can pin a major tag:

```yaml
- name: DeployBuddy
  uses: precrafts-labs/deploybuddy@v1
```

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `working-directory` | `.` | Directory to inspect, relative to `GITHUB_WORKSPACE`; paths outside the workspace are rejected. |
| `fail-on-risk` | `66` | Fail the step when risk is at least this integer from 0 to 100. Set empty to disable the gate. |
| `fail-on-readiness` | `false` | Optionally fail for BLOCKED or INSUFFICIENT EVIDENCE readiness. |
| `fail-on-release-gates` | `true` | Fail when configured repository release gates fail; set false for advisory rollout. No configured gates do not fail. |
| `create-annotations` | `true` | Add workflow annotations for workspace diagnostics and deterministic Git guardrails. |
| `pr-comment` | `false` | Create or update one report comment only for `pull_request` events. |
| `github-token` | — | Standard `${{ github.token }}` passed by the workflow; used only when PR comments are enabled. Do not use a custom PAT. |

The check always publishes its outputs and job summary before applying execution failure behavior. A threshold of 66 matches the Core danger band by default. The repository's optional v1 `.deploybuddy.json` policy is evaluated automatically and independently; a failed policy fails the Action even when `fail-on-risk: ''` disables the risk gate. Configured release-gate failure is also enforced by default; set `fail-on-release-gates: false` for advisory rollout. The risk, readiness, and release-gate outputs and failure controls remain separate. See the root README's **Repository Policy** and **Release Gates** sections for the schema and behavior.

## Outputs

- `risk-score`, `risk-level`, `verdict`
- `confidence-score`, `confidence-level`
- `release-readiness`, `release-gates-status`, `release-gates-violations` (`release-gates-violations` is a JSON array)
- `frameworks` (JSON array)
- `git-dirty` (`true`, `false`, or `unknown`)
- `commit-sha` and `commit-short-sha` (checked-out revision identity when available)
- `pull-request-head-sha` and `pull-request-base-sha` (validated PR event metadata)
- `assessment-json` (stable JSON containing risk, confidence, policy evaluation, project, Git summary, available checks, and recommendations)
- `comment-url` (created or updated comment URL; empty when disabled, outside pull requests, or unavailable)

Revision outputs contain commit identity only. For `pull_request`, validated head/base SHAs from event metadata are included in assessment JSON and the job summary as context; DeployBuddy does not run the base revision or invent persistent history on ephemeral runners.

## Pull request comments

Commenting is opt-in. When enabled on a pull request, DeployBuddy searches paginated issue comments for `<!-- deploybuddy-report -->` and updates the existing comment, or creates one if none exists. Every run renders the report again from the latest assessment so fixed blockers disappear; a lower score receives a short improvement note. Pushes and other events never write comments. Comment failures are a warning and leave the assessment, outputs, and summary intact.

Grant only the permissions this job needs and pass GitHub's built-in token:

```yaml
jobs:
  deploybuddy:
    name: DeployBuddy
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: DeployBuddy
        uses: ./apps/github-action
        with:
          pr-comment: true
          github-token: ${{ github.token }}
    # Optional: fail on BLOCKED or INSUFFICIENT EVIDENCE readiness.
    fail-on-readiness: true
```

For least privilege, scope write permission to this job rather than granting it globally. Fork pull requests normally receive a read-only token; DeployBuddy then keeps its normal outputs and job summary, warns that the comment could not be updated, and does not fail the assessment. Do not use `pull_request_target` just to acquire write access: it changes the security boundary for untrusted pull request data. Test comment writing with a trusted same-repository PR or in a private fixture repository with narrow job permissions.

The report separates blockers, cautions, positive findings, unknown evidence, policy state, and next steps. It escapes untrusted branch names, policy findings, and manifest-derived text, limits each section, and places overflow in a details block. Low-risk/low-confidence results are labeled **Observed risk** and include: “Observed risk is low, but DeployBuddy does not yet have enough evidence to call this deployment safe.”

## Workflow badge

Add a badge after creating your own workflow. Replace all placeholders with your repository and workflow file names; DeployBuddy does not assume a repository URL:

```markdown
[![DeployBuddy](https://github.com/OWNER/REPOSITORY/actions/workflows/WORKFLOW_FILE/badge.svg)](https://github.com/OWNER/REPOSITORY/actions/workflows/WORKFLOW_FILE)
```

Example downstream use:

```yaml
- name: DeployBuddy
  id: deploybuddy
  uses: ./apps/github-action
  with:
    fail-on-risk: '80'
- run: echo "DeployBuddy risk: ${{ steps.deploybuddy.outputs.risk-score }}%"
```

## Build and test locally

```sh
npm install
npm --prefix apps/github-action install
npm --prefix apps/github-action test
```

The build produces `dist/index.js`, a self-contained Node 20 action bundle. Commit that generated entrypoint when changing Action or shared Core code so workflows using a repository ref can execute it. `npm run validate:platform` builds and tests Core, the Node adapter, VS Code, CLI, website, and Action together.

DeployBuddy uses Git read-only for local status inspection. It does not fetch, push, stage, commit, switch branches, or execute project checks. It has no telemetry or external service calls. The Action uses only summarized local project metadata and Git state; it does not transmit source files, diffs, credentials, or secrets.
