# DeployBuddy

**Your brutally honest pre-deployment sanity checker. Know before you ship.**

DeployBuddy inspects the current VS Code workspace and gives you a deterministic risk score, evidence confidence, repository policy result, changed-area attention, Release Readiness, and configured Release Gates. It includes Git guardrails, local assessment history, a status bar, and the `@deploybuddy` Chat participant.

## Highlights

- Shared deterministic assessment logic with the CLI and GitHub Action
- Read-only Git health and pre-push guardrails
- Optional VS Code Language Model explanations; AI never changes assessment outcomes
- Repository-local declarative `.deploybuddy.json` with editor schema validation
- Local-only baselines and history; changed-area classification inspects names/statuses, not source contents
- No telemetry, direct AI HTTP requests, deployment, or Git mutation

## Chat

```text
@deploybuddy should I deploy?
@deploybuddy /check
@deploybuddy /readiness
@deploybuddy /release
@deploybuddy /fix
@deploybuddy /git
@deploybuddy /changes
@deploybuddy /history
```

Chat/model availability depends on VS Code Chat support and a compatible provider. Core assessment commands work without AI. Settings are `deploybuddy.aiEnabled` (default `true`) and `deploybuddy.humorLevel` (`low`, `normal`, or `high`). Humor level affects wording only.

## Commands

Command Palette includes Should I Deploy?, Explain My Risk, Roast My Deployment, Pre-Push Check, Git Health, Show Policy, Release Readiness, Check Release Gates, Save/Compare/Clear Baseline, Show/Clear History, Show Recent Risk Changes, Show Changed Areas, and About.

## Risk and privacy

The deterministic risk score is authoritative. Confidence, policy, change attention, readiness, and release gates are separate outputs. AI only rephrases allowlisted summaries when enabled and invoked through the official VS Code Language Model API. DeployBuddy does not intentionally send source contents, diffs, changed filenames, secrets, credentials, environment variables, or terminal history. Model providers apply their own data policies. See the canonical [Privacy](../docs/privacy.md), [Concepts](../docs/concepts.md), and [Configuration](../docs/configuration.md) documents.

The extension does not run tests, deploy, intercept Git operations, or mutate repository state. VS Code does not expose reliable test outcomes for arbitrary third-party test extensions; missing test state remains unknown. There is no stable public pre-push interception hook, so checks are advisory commands.

## Development and release

Use Node.js 22 or newer in this directory:

```sh
npm install
npm run validate
npm run package:vsix
```

Open this directory in VS Code and press F5 to launch the Extension Development Host. Install a local package with `code --install-extension deploybuddy-0.2.0.vsix --force`. See [Release preparation](../docs/releasing.md) for the full manual checklist. Packaging never publishes.

The package version 0.1.0 was previously published. Version 0.2.0 prepares the additive capabilities introduced since that release. See [CHANGELOG](CHANGELOG.md) and the cross-platform [compatibility policy](../docs/architecture.md).
