# DeployBuddy

**Your brutally honest pre-deployment sanity checker. Know before you ship.**

DeployBuddy turns local workspace, Git, diagnostics, checks, and changed-file metadata into a clear deployment assessment. Use the same deterministic intelligence in VS Code, the terminal, or GitHub Actions.

## Product surfaces

- **VS Code:** deployment checks, Git guardrails, Release Readiness, repository Release Gates, local history, and `@deploybuddy` Chat. Optional explanations use the VS Code Language Model API.
- **CLI:** `deploybuddy check`, `status`, `git`, `doctor`, `framework`, `checks`, `changes`, `readiness`, `release`, and local history/baseline commands.
- **GitHub Action:** shared Core assessment, annotations, outputs, summary, optional single PR comment, and independent opt-in risk/readiness gates plus configured release-gate enforcement.
- **Shared packages:** `@deploybuddy/core` owns deterministic platform-independent intelligence; `@deploybuddy/node-adapter` collects local Node/Git evidence.

## Example

```text
Release Readiness: BLOCKED
Risk: 78% — DO NOT DEPLOY
Confidence: 91% — HIGH
Policy: PASS
Change Attention: HIGH

Why:
- 2 validation checks failed
- Branch is behind upstream
- Database migrations changed

Next:
Fix failing checks, synchronize the branch, and review the migration changes.
```

Risk, confidence, policy, change attention, readiness, and release gates are separate values. AI wording never calculates or changes deterministic outcomes. See [Concepts](docs/concepts.md) for the canonical model.

## Documentation

- [Repository configuration and JSON Schema](docs/configuration.md)
- [CLI usage, JSON contract, and exit codes](docs/cli.md)
- [VS Code extension](docs/vscode.md)
- [GitHub Action](docs/github-action.md)
- [Privacy](docs/privacy.md)
- [Architecture and public APIs](docs/architecture.md)
- [Release process](docs/releasing.md)

## Development

```sh
npm install
npm run validate:platform
npm run release:check
npm run dev # browser demo
```

`release:check` builds and packages local artifacts only. It never publishes, tags, or pushes. Public package versions are independent; the published VS Code 0.1.0 extension is prepared as 0.2.0, while Core, Node adapter, and CLI remain at 0.1.0 for their initial public package line. Read [Version and compatibility policy](docs/architecture.md) before changing contracts.
