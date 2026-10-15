# GitHub Action

The Action bundles the shared Core and Node adapter. It performs local/read-only repository inspection, emits Actions outputs and a job summary, and can optionally create/update one PR comment. It does not execute project checks, deploy, or maintain persistent history.

```yaml
permissions:
  contents: read
  pull-requests: write # only needed when pr-comment is true

steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  - name: DeployBuddy
    uses: precrafts-labs/deploybuddy@v1
    with:
      pr-comment: true
```

Use least-privilege permissions. Fork pull requests may not receive a write-capable token; in that case the assessment, outputs, and summary still work and comment failure is reported as a concise warning. Do not use `pull_request_target` just to obtain write access for untrusted PR code. Details for all inputs/outputs are in [`apps/github-action/README.md`](../apps/github-action/README.md).

Action inputs/outputs and failure semantics are public workflow contracts. Additive outputs are compatible; changing input defaults, enum values, or failure behavior requires release notes and appropriate major versioning. `fail-on-risk`, `fail-on-readiness`, and `fail-on-release-gates` remain independent.

To show an Actions badge, open your own workflow in the GitHub Actions tab and use **Create status badge**. GitHub supplies the URL for your owner, repository, and workflow file; DeployBuddy does not assume a workflow name.

For release tagging, publish a tested immutable `v1.0.0` tag, then point the mutable `v1` major tag to that commit. Update `v1` only after each compatible v1 release. This repository is not tagged or published by the release checks.
