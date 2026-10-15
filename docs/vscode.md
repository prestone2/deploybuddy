# VS Code extension

The extension provides the deployment check, Git Health, Pre-Push Check, Release Readiness, Release Gates, policy tools, local baseline/history, changed-area reporting, status bar, output channel, and `@deploybuddy` Chat participant. Chat/model availability depends on the installed VS Code version and compatible provider. AI is optional and can be disabled with `deploybuddy.aiEnabled`; `deploybuddy.humorLevel` changes wording only.

The extension reads workspace Git state, project marker/manifests, diagnostics, and VS Code test state where available. Its optional VS Code Language Model request contains only allowlisted summaries and never source content. See [Privacy](privacy.md).

## Commands and settings

Commands and settings are contributed in the extension manifest and surfaced through Command Palette, SCM menus, and Chat. The extension manifest/settings and command IDs are public contracts: existing IDs and setting meanings will not change within a major version. New commands/settings may be added in a minor version; removals or incompatible meaning changes require migration notes and a major version.

Run locally by opening `deploybuddy-extension` in VS Code and pressing F5. For package verification use `npm run vscode:build` and `npm --prefix deploybuddy-extension run package:vsix`.
