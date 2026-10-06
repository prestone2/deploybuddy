import * as vscode from 'vscode';
import type { GitSignals, RepositorySignals } from '../types/deployment';
// Minimal read-only subset of vscode.git API v1. No Git mutation APIs are exposed here.
interface GitChange { readonly uri: vscode.Uri; readonly status: number }
interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly state: {
    readonly HEAD?: { readonly name?: string; readonly commit?: string; readonly upstream?: { readonly name: string; readonly remote?: string }; readonly ahead?: number; readonly behind?: number };
    readonly workingTreeChanges: readonly GitChange[];
    readonly indexChanges: readonly GitChange[];
    readonly mergeChanges: readonly GitChange[];
    readonly untrackedChanges?: readonly GitChange[];
  };
}
interface GitApi { readonly repositories: readonly GitRepository[] }
interface GitExtension { getAPI(version: 1): GitApi }
const UNTRACKED = 7; // vscode.git Status.UNTRACKED; older versions place these in workingTreeChanges.
const IGNORED = 8;
export function unavailableGit(note: string): GitSignals {
  return { available: false, repositories: [], branch: null, modifiedFiles: 0, stagedFiles: 0, untrackedFiles: 0, changedFiles: 0, hasUncommittedChanges: false, dirtyPrimaryBranch: false, upstream: null, ahead: null, behind: null, unstagedFiles: null, conflictFiles: null, detachedHead: null, note };
}
function isRelated(root: vscode.Uri, folder: vscode.Uri): boolean {
  if (root.scheme !== folder.scheme || root.authority !== folder.authority) return false;
  const contains = (a: string, b: string): boolean => b === a || b.startsWith(a.replace(/\/$/, '') + '/');
  return contains(root.path, folder.path) || contains(folder.path, root.path);
}
function snapshot(repository: GitRepository): RepositorySignals {
  const state = repository.state;
  const working = state.workingTreeChanges.filter(c => c.status !== IGNORED);
  const modified = [...working.filter(c => c.status !== UNTRACKED), ...(state.mergeChanges ?? [])];
  const untracked = [...working.filter(c => c.status === UNTRACKED), ...(state.untrackedChanges ?? [])];
  const count = (changes: readonly GitChange[]): number => new Set(changes.map(c => c.uri.toString())).size;
  const changedFiles = count([...modified, ...untracked, ...state.indexChanges]);
  const head = state.HEAD;
  const upstream = head?.upstream;
  const upstreamName = upstream ? upstream.remote && !upstream.name.startsWith(upstream.remote + '/') ? `${upstream.remote}/${upstream.name}` : upstream.name : null;
  const commits = (value: number | undefined): number | null => typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
  const conflicts = [...(state.mergeChanges ?? []), ...working.filter(c => c.status >= 12 && c.status <= 18)];
  return { root: repository.rootUri.toString(), branch: head?.name ?? null,
    upstream: upstreamName, ahead: commits(head?.ahead), behind: commits(head?.behind), unstagedFiles: count(modified),
    conflictFiles: state.mergeChanges ? count(conflicts) : conflicts.length ? count(conflicts) : null,
    detachedHead: head?.name ? false : head?.commit ? true : null,
    modifiedFiles: count(modified), stagedFiles: count(state.indexChanges), untrackedFiles: count(untracked),
    changedFiles, hasUncommittedChanges: changedFiles > 0 };
}
export async function getGitSignals(): Promise<GitSignals> {
  if (!vscode.workspace.workspaceFolders?.length) return unavailableGit('No workspace folder is open.');
  try {
    const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!extension) return unavailableGit('The built-in Git extension is unavailable or disabled.');
    const exports = extension.isActive ? extension.exports : await extension.activate();
    const api = exports.getAPI(1);
    const repositories = api.repositories.filter(repo => vscode.workspace.workspaceFolders?.some(folder => isRelated(repo.rootUri, folder.uri))).map(snapshot);
    if (!repositories.length) return unavailableGit('No repository is currently detected by the built-in Git extension.');
    const total = (key: 'ahead' | 'behind' | 'unstagedFiles' | 'conflictFiles'): number | null => repositories.some(r => r[key] === null) ? null : repositories.reduce((sum, r) => sum + (r[key] ?? 0), 0);
    return { available: true, repositories, upstream: repositories.length === 1 ? repositories[0]?.upstream ?? null : null, ahead: total('ahead'), behind: total('behind'), unstagedFiles: total('unstagedFiles'), conflictFiles: total('conflictFiles'), detachedHead: repositories.some(r => r.detachedHead === true) ? true : repositories.some(r => r.detachedHead === null) ? null : false, branch: repositories.length === 1 ? repositories[0]?.branch ?? null : 'Multiple repositories (see details)',
      modifiedFiles: repositories.reduce((n, r) => n + r.modifiedFiles, 0), stagedFiles: repositories.reduce((n, r) => n + r.stagedFiles, 0),
      untrackedFiles: repositories.reduce((n, r) => n + r.untrackedFiles, 0), changedFiles: repositories.reduce((n, r) => n + r.changedFiles, 0),
      hasUncommittedChanges: repositories.some(r => r.hasUncommittedChanges), dirtyPrimaryBranch: repositories.some(r => r.hasUncommittedChanges && (r.branch === 'main' || r.branch === 'master')),
      note: 'Read-only snapshot from the built-in Git extension. Counts cover each detected repository, including its files outside a nested workspace folder. Modified includes deletions and conflicts; distinct changed files are deduplicated per repository.' };
  } catch { return unavailableGit('The built-in Git extension could not provide repository signals.'); }
}
