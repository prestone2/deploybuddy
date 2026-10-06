# DeployBuddy

**Your brutally honest pre-deployment sanity checker.**

*Know before you ship.*

DeployBuddy checks the current VS Code workspace and gives you a deterministic deployment risk score with evidence you can inspect. It reads Git state, workspace diagnostics, and local time, then offers practical next steps with a little developer-friendly humor.

## Features

- Deterministic deployment risk score and concise verdict
- Workspace diagnostics and read-only Git health analysis
- Pre-Push Check and Git guardrails for conflicts, detached HEAD, upstream drift, and risky working trees
- Optional VS Code Language Model explanations and deployment roasts
- `@deploybuddy` chat participant with slash commands and natural-language intents
- Deterministic AI fallback, prioritized remediation, output channel, and status bar context
- Source Control title menu actions for Git workspaces
- No backend, database, telemetry, automatic deployment, or repository mutation

## Example

```text
DeployBuddy: 91% risk — DO NOT DEPLOY

Why:
- 3 workspace errors
- 8 uncommitted files
- branch is behind upstream
- you're on main
- it's Friday evening

Advice:
Fix the errors and sync your branch before touching production.
```

Exact findings depend on signals available from the current workspace. Unknown signals are reported as unknown instead of being treated as clean.

## Commands

- **DeployBuddy: Should I Deploy?** — collect current signals, calculate risk, and explain the result
- **DeployBuddy: Explain My Risk** — explain the latest result, collecting one if needed
- **DeployBuddy: Roast My Deployment** — give a grounded, slightly sharper explanation
- **DeployBuddy: Pre-Push Check** — calculate deployment risk and inspect advisory Git guardrails; it never pushes
- **DeployBuddy: Git Health** — show branch, upstream, ahead/behind, file counts, conflicts, and HEAD state
- **DeployBuddy: About** — show the extension version and its deterministic-risk model

The DeployBuddy status bar item runs a fresh deployment check. Git workspaces also get Pre-Push Check and Git Health actions in the Source Control title menu.

## Chat

```text
@deploybuddy should I deploy?
@deploybuddy /check
@deploybuddy /explain
@deploybuddy /roast
@deploybuddy /fix
@deploybuddy /status
@deploybuddy /git
```

Chat uses current workspace signals. `/fix` gives deterministic prioritized recommendations; `/git` gives Git health; natural-language requests such as “am I behind origin?” and “any merge conflicts?” are routed locally. Chat participants require a VS Code version and Chat mode that support them. AI wording also requires a compatible language model and any provider permissions it requests. The deterministic commands work without an AI provider.

## Risk model

**The deterministic risk engine is authoritative.** It calculates the score, level, and verdict from explicit rules. AI never calculates, edits, or overrides them; it only explains the supplied result. Git guardrails are a separate advisory analysis and do not add risk points.

The score starts at zero and adds: Friday +20; Saturday/Sunday +25; after 16:00 +15 and after 20:00 another +10; dirty working tree +10; more than 10 changed files +10; diagnostics errors +25 and at least five errors another +15; at least 10 warnings +10; known failed tests +35; unknown/not-run tests +15; dirty `main`/`master` +10. The result is capped at 100. Scores 0–30 are safe, 31–65 caution, and 66–100 danger.

Git guardrails separately report conflicts, dirty detached HEAD, dirty primary branches before an explicitly requested pre-push check, upstream drift, large changes, and untracked or unstaged files. A push check does not execute Git operations.

## Privacy

When AI is enabled, DeployBuddy may send the selected VS Code language model a minimal summary: branch and upstream names, Git file/ahead/behind/conflict counts, diagnostics counts, test status, risk score/verdict, deterministic reasons, and local day/time. The provider may process that request under its own account and data policies.

DeployBuddy intentionally excludes source code, file contents, diagnostic text, Git diffs, commit contents, repository paths, remote authentication details, environment variables, credentials, secrets, terminal history, chat history, and arbitrary workspace files. Disable `deploybuddy.aiEnabled` to keep explanations local and deterministic. DeployBuddy itself has no telemetry or direct network requests.

## Limitations

- Stable VS Code APIs do not provide reliable workspace-wide results from arbitrary third-party test extensions. Test status is currently `unknown`; DeployBuddy does not infer test outcomes from test files.
- There is no stable public before-push interception hook. Pre-Push Check is an explicit advisory command; Git actions are never blocked, replaced, or intercepted.
- Chat and AI availability depends on VS Code, participant-capable Chat mode, a compatible model provider, and permissions. AI failure falls back to deterministic wording.
- Git counts use the built-in Git extension's cached local view. DeployBuddy does not fetch, so upstream counts may be stale.
- DeployBuddy is advisory. It does not deploy, run tests, or modify files, commits, branches, remotes, Git configuration, or repository state.

## Settings

- `deploybuddy.aiEnabled` — boolean, default `true`. Turn off model discovery and requests for deterministic explanations only.
- `deploybuddy.humorLevel` — `low`, `normal` (default), or `high`. Changes wording only and never changes the score.

## Development

Use Node.js 22 or newer in this directory:

```bash
npm install
npm run compile
npm run lint
npm test
npm run validate
```

Press **F5** and choose **Run DeployBuddy Extension** to start an Extension Development Host. The built-in test suite mocks VS Code APIs; separate host harnesses in `test/` cover real Git, non-Git, and empty workspaces. Chat participant autocomplete and submission should also be checked manually in a normal VS Code installation (see the release checklist).

The extension has no production npm dependencies. TypeScript compiles to `out/`, which is included in the VSIX.

## Release

The current package version is **0.1.0**, the first public preview. Versions follow semantic versioning: increment the patch for compatible fixes, minor for compatible features, and major for incompatible changes. Create a release only after reviewing the checklist below.

`publisher` in `package.json` is the explicit placeholder `your-marketplace-publisher-id`. Replace it with a publisher ID you control before Marketplace publication. The repository URL and Marketplace homepage are not configured because no canonical public project URL has been established; add verified URLs to `repository`, `homepage`, and `bugs` when known. Do not publish with the placeholder publisher.

An MIT `LICENSE` is included. Build a local package with `npm run package:vsix`; this command does not publish or upload anything. The expected artifact is `deploybuddy-0.1.0.vsix`.

### Manual release checklist

- Install the VSIX locally and confirm it appears in the Extensions view.
- Open a Git workspace; run Should I Deploy, Git Health, and Pre-Push Check.
- Inspect the DeployBuddy status bar and output channel.
- Verify `deploybuddy.aiEnabled` off; when a compatible provider is available, verify it on too.
- Test `@deploybuddy` and `/check`, `/status`, `/roast`, `/fix`, `/git` in participant-capable Chat.
- Test an empty window and a non-Git workspace.
- Confirm the project repository remains unchanged after checks.
- Uninstall and reinstall the packaged extension once.
- Confirm a real publisher ID and canonical project URLs are configured before publishing.

### Security and distribution review

The release source contains no hardcoded credentials or tokens. Production AI uses the VS Code Language Model API and an explicit summarized-signal allowlist; the extension does not make direct HTTP requests. Production Git inspection uses the built-in read-only API and does not shell out or invoke Git mutation methods. No arbitrary workspace file contents are read or sent to a model. `npm run validate` checks compilation, lint, tests, and package metadata before packaging.

Review the current development dependency audit with `npm audit` before each release. A clean audit is not a substitute for reviewing updates; avoid automatic major upgrades. The VSIX excludes tests, development configuration, source files, source maps, and web-app artifacts while retaining runtime output, package metadata, README, license, and icon.

## Changelog

The package includes `CHANGELOG.md`.

## License

MIT. The full license text is included in `LICENSE`.
