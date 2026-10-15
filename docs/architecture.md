# Architecture and API contracts

`@deploybuddy/core` owns platform-independent deterministic risk, confidence, policy, change analysis, readiness, release gates, baselines, history, recommendations, and normalized types. It has no VS Code imports or UI dependency. `@deploybuddy/node-adapter` provides read-only filesystem/Git/project collection. The VS Code adapter and Node adapter normalize evidence before calling Core; the CLI and Action use the Node adapter. The Action reuses the same shared report presenter for summary/comment output.

The stable package API is each package's root export (`@deploybuddy/core`, `@deploybuddy/node-adapter`). Consumers should not import internal build paths. Type declarations are emitted with builds. CLI is a binary contract rather than a library API. The exact Core/adapter exports and CLI JSON are versioned public contracts.

Each distributable has independent versioning. Core, Node adapter, and CLI begin at 0.1.0; incompatible public API changes require a minor bump before 1.0 under npm semver, and a major bump after 1.0. VS Code was already released at 0.1.0 and is prepared as 0.2.0 for the accumulated additive capabilities. The Action remains 0.x while its input/output contract is still evolving; pin a tested immutable version and maintain a mutable major tag only after the first intentional stable 1.x release. Repository config uses its own `version: 1` schema boundary. Package versions are independent and are not automatically kept numerically identical.

## Read-only process inventory

Node Git collection uses `git status --porcelain`, `git rev-parse --verify`, `git branch --show-current`, `git diff --name-status`, and bounded revision resolution. These are read-only; user-provided revisions are validated and passed as argument-array values. No `git add/commit/checkout/reset/merge/rebase/push/pull` operation is present in runtime collection. CLI optional check execution is restricted to detected `npm run <script>`, `composer <script>`, or `php artisan test`, requires an interactive confirmation, uses argument arrays, and has a 15-minute timeout. Git calls have a 10-second timeout and bounded output buffers. No package installation or deploy command is invoked.

Node adapter discovery is marker-based: project root plus one directory level, excluding `.git`, `node_modules`, `vendor`, build output, and common generated folders. It avoids recursive scans. Assessment orchestration creates normalized signals once per CLI command; platform adapters may cache marker reads within that session.

The extension's risk rules are represented by Core; the VS Code wrapper files remain as compatibility adapters. Risk scoring is not recalculated by readiness, policy, release gates, AI, or presentation.
