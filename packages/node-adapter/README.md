# @deploybuddy/node-adapter

Read-only Node.js filesystem and Git evidence collection for DeployBuddy. Git is invoked through argument arrays with bounded execution; the adapter does not mutate repository state.

```ts
import { NodeWorkspaceAdapter } from '@deploybuddy/node-adapter';

const adapter = new NodeWorkspaceAdapter(process.cwd());
const git = await adapter.getGitSignals();
```

Build with `npm run build`. See the monorepo [architecture and compatibility policy](../../docs/architecture.md).
