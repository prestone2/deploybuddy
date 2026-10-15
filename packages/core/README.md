# @deploybuddy/core

Platform-independent deterministic deployment intelligence for DeployBuddy. The package contains no VS Code, UI, network, or storage APIs. Import supported operations and types from the package root; internal paths are not exported.

```ts
import { calculateDeploymentRisk, evaluatePolicy, evaluateReleaseReadiness } from '@deploybuddy/core';
```

Build with `npm run build`. See the monorepo [architecture and compatibility policy](../../docs/architecture.md).
