# DeployBuddy CLI

The first-party `deploybuddy` CLI uses shared Core and the Node adapter. It runs locally, has no AI requests or telemetry, and does not mutate Git state. Project checks are only executed by `deploybuddy checks --run` after an interactive confirmation.

## Commands

```sh
deploybuddy check
deploybuddy status
deploybuddy git
deploybuddy framework
deploybuddy checks
deploybuddy doctor
deploybuddy changes
deploybuddy readiness
deploybuddy release
deploybuddy policy validate
deploybuddy history
```

`--json` output is a public machine-readable contract within a CLI major version. JSON mode emits JSON only on stdout (diagnostics use stderr); fields are normalized summaries, never changed file paths. `check --quiet` prints `VERDICT SCORE`, such as `QUESTIONABLE 42`. ANSI output is disabled when stdout is not a TTY and can be forced off with `--no-color` or `NO_COLOR`.

## Exit codes

| Command | 0 | 1 | 2 |
| --- | --- | --- | --- |
| `check` | Safe/caution unless a configured policy fails | Danger when `exitOnDanger` is true, or configured policy failure | Invalid input/configuration or inspection failure |
| `release` | Gates pass or are not configured | Configured gates fail | Invalid configuration or inspection failure |
| `policy validate` | Valid or no policy configured | — | Invalid policy/configuration |
| `compare` | Comparison produced, or no comparable baseline exists | — | Invalid input or inspection failure |
| `doctor` | Integration/configuration valid | — | Invalid configuration or inspection failure |

The legacy `check` exit behavior is preserved; release gates do not silently turn `check` into a release-blocking command. `readiness` separately exits 1 for BLOCKED or INSUFFICIENT EVIDENCE. CLI JSON shapes and exit codes are stable within a major version; additive JSON fields are permitted in minor versions and breaking removals/meaning changes require a major version.

For local development run `npm install`, `npm run cli:build`, then `node apps/cli/dist/cli.js check`. See [the package README](../apps/cli/README.md) for more examples.
