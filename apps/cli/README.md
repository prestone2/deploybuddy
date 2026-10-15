# DeployBuddy CLI

DeployBuddy checks local project, Git, diagnostics, policy, change, and release evidence. The CLI uses the same deterministic `@deploybuddy/core` assessment logic as the VS Code extension and GitHub Action. It does not make AI requests or send repository data externally.

## Install for local development

From the monorepo root:

```sh
npm install
npm run cli:build
node apps/cli/dist/cli.js check
```

## Commands

```sh
deploybuddy check
deploybuddy status
deploybuddy git
deploybuddy framework
deploybuddy checks
deploybuddy doctor
deploybuddy readiness
deploybuddy release
deploybuddy policy
deploybuddy changes
deploybuddy history
```

Use `deploybuddy check --json` for automation. JSON property names and enums are public contracts for a given CLI major version. `--quiet` emits `VERDICT SCORE`; color is automatic for TTY output and can be disabled with `--no-color` or `NO_COLOR`.

## Exit codes

- `check`: 0 for safe/caution by default; 1 for danger when `exitOnDanger` is enabled or when configured policy fails; 2 for invalid options/configuration or inspection failure.
- `release`: 0 for PASS or NOT CONFIGURED; 1 for FAIL; 2 for invalid configuration or inspection failure.
- `policy validate`: 0 for valid/unconfigured policy; 2 for malformed JSON or invalid policy.
- `compare`: 0 when a comparison is produced or no usable baseline exists; 2 for invalid input or inspection failure.
- `doctor`: 0 when integration is healthy; 2 when configuration or inspection is invalid.

These codes are stable within a CLI major version. See the root [CLI contract](../../docs/cli.md) for the full JSON and exit behavior.
