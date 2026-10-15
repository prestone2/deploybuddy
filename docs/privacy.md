# Privacy and local data

DeployBuddy does not add telemetry or a hosted backend. Repository configuration is local and declarative.

| Surface | Reads | Stores | Sends externally |
| --- | --- | --- | --- |
| Core | Normalized input values | Nothing | Nothing |
| CLI | Project marker files, read-only Git metadata, local `.deploybuddy.json`, check declarations | Explicit baseline/history summaries in a user cache scoped to project identity | Nothing; no AI |
| VS Code | Workspace signals, VS Code diagnostics/tests, Git metadata, `.deploybuddy.json` | Explicit baseline/history summaries in extension global state scoped to first/selected root | Only when AI is enabled and an available VS Code Language Model is invoked: risk/verdict, branch, signal counts/statuses, day/time, deterministic reasons/actions, and summarized changed-area categories/counts |
| GitHub Action | Checked-out repository markers, read-only Git metadata, `.deploybuddy.json`, trusted event SHA metadata | Nothing persistent | GitHub Actions APIs only for workflow outputs/summary/annotations and optional PR comment using the supplied built-in token; no AI |

AI requests are made only through the official VS Code Language Model API after the user invokes an explanation/chat feature and `deploybuddy.aiEnabled` is true. DeployBuddy does not intentionally send source text, file contents, diffs, changed filenames, commit messages, terminal history, environment variables, credentials, secrets, or remote authentication details. Branch names and deterministic summary data may be included. The selected model/provider applies its own data handling terms.

CLI and Action do not make model or arbitrary network requests. Git inspection uses local read-only commands. Optional project checks in the CLI are explicit, interactive, allowlisted, and time-limited.
