import * as vscode from 'vscode';
import { detectChecks, detectProjectProfile, parseDeployBuddyConfig, parseDeployBuddyPolicy, type ChangedFile, type CheckResult, type ConfigParseResult, type ContextSignals, type DiagnosticSignals, type GitSignals, type PolicyParseResult, type ProjectMarker, type ProjectProfile, type TestSignals, type WorkspaceAdapter } from '@deploybuddy/core';
import { getChangedFiles, getGitSignals, unavailableGit } from './gitService';
import { getDiagnosticSignals } from './diagnosticsService';
import { getTestSignals } from './testingService';
import { getContextSignals } from './contextService';

const skipDirectories = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.next', '.nuxt', 'target']);
function jsonObject(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.');
  return value as Record<string, unknown>;
}
function strings(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value);
}
function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((item): item is [string, string] => typeof item[1] === 'string'));
}

/** VS Code-facing collector. Platform-neutral normalization and assessment stay in Core. */
export class VSCodeWorkspaceAdapter implements WorkspaceAdapter {
  private markersPromise?: Promise<ProjectMarker[]>;
  beginCollection(): void { this.markersPromise = undefined; }
  invalidate(): void { this.markersPromise = undefined; }
  async getWorkspaceFolders(): Promise<string[]> { return vscode.workspace.workspaceFolders?.map(folder => folder.name) ?? []; }
  async getGitSignals(): Promise<GitSignals> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([getGitSignals(), new Promise<GitSignals>(resolve => { timer = setTimeout(() => resolve(unavailableGit('Git signal collection timed out. Try checking again once Git finishes loading.')), 5000); })]); }
    finally { if (timer) clearTimeout(timer); }
  }
  async getChangedFiles(): Promise<ChangedFile[]> { return getChangedFiles(); }
  async getDiagnostics(): Promise<DiagnosticSignals> { return getDiagnosticSignals(); }
  async getTestSignals(): Promise<TestSignals> { return getTestSignals(); }
  async getContext(): Promise<ContextSignals> { return getContextSignals(); }
  async getProjectProfile(): Promise<ProjectProfile> {
    const open = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
    return detectProjectProfile(await this.getMarkers(), open);
  }
  async getCheckResults(): Promise<CheckResult[]> { return detectChecks(await this.getMarkers(), (vscode.workspace.workspaceFolders?.length ?? 0) > 0); }
  async getConfig(): Promise<ConfigParseResult> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return parseDeployBuddyConfig(undefined);
    try { return parseDeployBuddyConfig(Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, '.deploybuddy.json'))).toString('utf8')); }
    catch (error: unknown) {
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') return parseDeployBuddyConfig(undefined);
      return parseDeployBuddyConfig('{');
    }
  }
  async getPolicy(): Promise<PolicyParseResult> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return parseDeployBuddyPolicy(undefined);
    try { return parseDeployBuddyPolicy(Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, '.deploybuddy.json'))).toString('utf8')); }
    catch (error: unknown) {
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') return parseDeployBuddyPolicy(undefined);
      return parseDeployBuddyPolicy('{');
    }
  }
  private getMarkers(): Promise<ProjectMarker[]> {
    this.markersPromise ??= this.readMarkers();
    return this.markersPromise;
  }
  private async readMarkers(): Promise<ProjectMarker[]> {
    const markers: ProjectMarker[] = [];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const entries = await Promise.resolve(vscode.workspace.fs.readDirectory(folder.uri)).catch((): Array<[string, vscode.FileType]> => []);
      const roots: Array<{ uri: vscode.Uri; label: string }> = [{ uri: folder.uri, label: './' }];
      for (const [name, type] of entries) {
        if (type === vscode.FileType.Directory && !name.startsWith('.') && !skipDirectories.has(name)) roots.push({ uri: vscode.Uri.joinPath(folder.uri, name), label: `./${safeSegment(name)}` });
      }
      for (const root of roots) {
        const files = await Promise.resolve(vscode.workspace.fs.readDirectory(root.uri)).catch((): Array<[string, vscode.FileType]> => []);
        const names = files.filter(([, type]) => type === vscode.FileType.File).map(([name]) => name);
        if (!names.includes('package.json') && !names.includes('composer.json') && !names.includes('artisan') && !names.some(name => /^vite\.config\./.test(name))) continue;
        const marker: ProjectMarker = { root: root.label, files: names, packageManagerFiles: names.filter(name => /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/.test(name)) };
        if (names.includes('package.json')) {
          try {
            const data = jsonObject(Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root.uri, 'package.json'))).toString('utf8'));
            marker.packageDependencies = [...strings(data.dependencies), ...strings(data.devDependencies), ...strings(data.optionalDependencies)];
            marker.packageScripts = stringMap(data.scripts);
            marker.packageManager = typeof data.packageManager === 'string' ? data.packageManager : undefined;
          } catch { marker.parseErrors = [`Could not parse package.json in ${root.label}`]; }
        }
        if (names.includes('composer.json')) {
          try {
            const data = jsonObject(Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root.uri, 'composer.json'))).toString('utf8'));
            marker.composerDependencies = [...strings(data.require), ...strings(data['require-dev'])];
            marker.composerScripts = stringMap(data.scripts);
          } catch { marker.parseErrors = [...(marker.parseErrors ?? []), `Could not parse composer.json in ${root.label}`]; }
        }
        markers.push(marker);
      }
    }
    return markers;
  }
}

function safeSegment(value: string): string { return value.replace(/[^a-z0-9._ -]/gi, '_').slice(0, 64) || '_'; }
