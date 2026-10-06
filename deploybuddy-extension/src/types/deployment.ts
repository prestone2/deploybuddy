export type RiskLevel = 'safe' | 'caution' | 'danger';
export type DeploymentVerdict = 'DEPLOY' | 'QUESTIONABLE' | 'DO_NOT_DEPLOY';
export interface GitHealthSignals {
  upstream: string | null; ahead: number | null; behind: number | null;
  unstagedFiles: number | null; conflictFiles: number | null; detachedHead: boolean | null;
}
export interface RepositorySignals extends GitHealthSignals {
  root: string; branch: string | null; modifiedFiles: number; stagedFiles: number;
  untrackedFiles: number; changedFiles: number; hasUncommittedChanges: boolean;
}
export interface GitSignals extends GitHealthSignals {
  available: boolean; repositories: RepositorySignals[]; branch: string | null;
  modifiedFiles: number; stagedFiles: number; untrackedFiles: number;
  changedFiles: number; hasUncommittedChanges: boolean; dirtyPrimaryBranch: boolean;
  note?: string;
}
export interface DiagnosticSignals { available: boolean; errors: number; warnings: number; note?: string }
export interface TestSignals {
  testStatus: 'known' | 'unknown'; passed: number | null; failed: number | null;
  skipped: number | null; notRun: number | null; note: string;
}
export interface ContextSignals { day: string; dayOfWeek: number; hour: number; minute: number; timestamp: string }
export interface WorkspaceSignals {
  workspaceFolders: string[]; git: GitSignals; diagnostics: DiagnosticSignals;
  tests: TestSignals; context: ContextSignals;
}
export interface RiskReason { code: string; points: number; message: string }
export interface DeploymentRiskResult {
  score: number; level: RiskLevel; verdict: DeploymentVerdict;
  reasons: RiskReason[]; message: string; advice: string;
}
