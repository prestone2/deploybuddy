# Repository configuration

DeployBuddy reads one `.deploybuddy.json` at the inspected repository/workspace root. In VS Code multi-root workspaces, the selected/first root is used consistently; configuration is not inherited by walking arbitrary parent directories. The format is declarative JSON with `version: 1`; unknown keys and unsupported versions are errors. It does not allow commands, scripts, environment interpolation, remote includes, or executable values.

The canonical schema is [`schemas/deploybuddy.schema.json`](../schemas/deploybuddy.schema.json). VS Code contributes that schema for `.deploybuddy.json`; other editors can associate the local schema file manually.

```json
{
  "version": 1,
  "risk": { "maxScore": 65 },
  "confidence": { "minimumScore": 60 },
  "git": { "requireClean": true, "requireUpToDate": true, "allowUntracked": false },
  "diagnostics": { "maxErrors": 0, "maxWarnings": 10 },
  "evidence": { "requireTests": true, "requireBuild": true },
  "release": {
    "requiredReadiness": "ready",
    "maxRisk": 30,
    "minimumConfidence": 85,
    "requirePolicyPass": true,
    "allowedChangeAttention": ["low", "moderate"]
  }
}
```

Policy rules describe repository expectations. Release gates describe stricter final criteria and are independently optional. A configured gate requiring a policy pass fails closed if no policy is configured. See [Concepts](concepts.md) for the distinction among risk, confidence, policy, readiness, and gates.
