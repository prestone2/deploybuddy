# Release preparation

Release checks are local and intentionally stop before external publication. They validate, build, pack, inspect metadata, and optionally warn about a dirty Git worktree. They never publish, create tags, or push.

```sh
npm run validate:platform
npm run release:check
```

Artifacts are written to a temporary directory printed by the command. Inspect them before release. Install the VSIX locally with `code --install-extension <file.vsix> --force`; install the CLI tarball in a temporary npm prefix and verify `deploybuddy --help`, `doctor`, `check`, and `release`. Run `code --install-extension` only when a local GUI installation is desired.

Manual Extension Development Host checklist:

1. Open `deploybuddy-extension` in normal VS Code and press F5.
2. In the host, run Should I Deploy, Git Health, Release Readiness, Release Gates, history, and changes.
3. Check `@deploybuddy` `/check`, `/status`, `/roast`, `/fix`, `/git`, `/readiness`, and `/release` in Chat; confirm follow-ups where supported.
4. Repeat with AI disabled and, if a compatible provider is available, enabled.
5. Check empty-window and non-Git workspaces, then confirm repository state is unchanged.
6. Install/uninstall/reinstall the generated VSIX and repeat a basic check.

Before Marketplace/npm/Action release, confirm the publisher and repository metadata, choose a public licensing/distribution policy (this repository currently carries MIT), run dependency and license review, test on supported Node/VS Code versions, and verify permissions in a repository-owned workflow. The Action's intended v1 tag strategy is immutable `v1.0.0` plus a mutable `v1` alias updated only for compatible releases. Nothing in `release:check` performs those release actions.

The VS Code 0.2.0 changelog records user-visible additions since the already published 0.1.0 baseline: evidence confidence, framework/project signals, repository policy, baselines and local history, changed-area intelligence, Release Readiness, and Release Gates. Compatibility claims apply only to documented contracts; review migrations for each surface.
