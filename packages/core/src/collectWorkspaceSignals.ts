import { parseDeployBuddyConfig } from './config/config';
import type { WorkspaceAdapter } from './types/adapters';
import type { WorkspaceSignals } from './types/deployment';

export async function collectWorkspaceSignals(adapter: WorkspaceAdapter): Promise<WorkspaceSignals> {
  adapter.beginCollection?.();
  const [workspaceFolders, git, diagnostics, project, checks, tests, context, configResult, policy] = await Promise.all([
    adapter.getWorkspaceFolders(), adapter.getGitSignals(), adapter.getDiagnostics(), adapter.getProjectProfile(),
    adapter.getCheckResults(), adapter.getTestSignals(), adapter.getContext(), adapter.getConfig?.() ?? Promise.resolve(undefined), adapter.getPolicy?.() ?? Promise.resolve(undefined),
  ]);
  return { workspaceFolders, git, diagnostics, project, checks, tests, context, ...(configResult ? { config: configResult.config } : { config: parseDeployBuddyConfig(undefined).config }), ...(policy ? { policy } : {}) };
}
