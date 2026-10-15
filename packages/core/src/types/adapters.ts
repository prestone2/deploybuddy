import type { CheckResult } from './checks';
import type { ConfigParseResult } from './config';
import type { ContextSignals, DiagnosticSignals, GitSignals, TestSignals } from './deployment';
import type { ProjectProfile } from './project';
import type { PolicyParseResult } from './policy';
import type { ChangedFile } from './changes';

export interface WorkspaceAdapter {
  beginCollection?(): void;
  getWorkspaceFolders(): Promise<string[]>;
  getGitSignals(): Promise<GitSignals>;
  getDiagnostics(): Promise<DiagnosticSignals>;
  getProjectProfile(): Promise<ProjectProfile>;
  getCheckResults(): Promise<CheckResult[]>;
  getTestSignals(): Promise<TestSignals>;
  getContext(): Promise<ContextSignals>;
  getConfig?(): Promise<ConfigParseResult>;
  getPolicy?(): Promise<PolicyParseResult>;
  getChangedFiles?(range?: { from: string; to: string } | { base: string }): Promise<ChangedFile[]>;
}
