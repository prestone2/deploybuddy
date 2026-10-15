# DeployBuddy concepts

DeployBuddy keeps six decisions separate so each one can be inspected and trusted:

- **Risk** asks what observed signals look dangerous. It is calculated by the shared deterministic Core engine.
- **Confidence** measures how much useful evidence was available. Low confidence means uncertainty; high confidence does not mean low risk.
- **Policy** checks declarative repository expectations in `.deploybuddy.json`.
- **Change Attention** classifies changed relative path names and statuses. It does not inspect source contents and is not the risk score.
- **Release Readiness** deterministically combines risk, confidence, policy, and change attention into a cautious overall posture.
- **Release Gates** are explicit final team criteria. They consume prior results but do not change them.

The precedence is Core risk → evidence confidence → repository policy → Release Readiness → Release Gates → platform-specific behavior. The deterministic risk engine remains authoritative; AI wording in VS Code cannot change scores, policy, readiness, or gates.

## Baseline and history

A **baseline** is a local, explicit comparison anchor. Saving a new assessment does not happen automatically. **History** is a separate local sequence of explicit assessments, retained to at most 100 entries per project. It supports trend and commit-attribution queries; it never replaces the selected baseline. Both store normalized summaries rather than source code, paths, diffs, or AI text. GitHub Actions do not persist history on ephemeral runners.
