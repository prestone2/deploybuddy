import { execFile as execFileCallback } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { detectChecks, detectProjectProfile, normalizeChangedFiles, parseDeployBuddyConfig, parseDeployBuddyPolicy, type ChangedFile, type CheckResult, type ConfigParseResult, type ContextSignals, type DiagnosticSignals, type GitSignals, type PolicyParseResult, type ProjectMarker, type ProjectProfile, type TestSignals, type WorkspaceAdapter } from '@deploybuddy/core';

const execFile = promisify(execFileCallback);
const GIT_TIMEOUT_MS = 10_000;
const MAX_CONFIG_BYTES = 256 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const excluded = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.next', '.nuxt', 'target']);
const unavailableGit = (): GitSignals => ({ available: false, repositories: [], branch: null, upstream: null, ahead: null, behind: null, modifiedFiles: 0, stagedFiles: 0, untrackedFiles: 0, changedFiles: 0, unstagedFiles: null, conflictFiles: null, detachedHead: null, hasUncommittedChanges: false, dirtyPrimaryBranch: false, note: 'Git is unavailable or this directory is not a Git repository.' });
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const keys = (value: unknown): string[] => Object.keys(object(value));
const stringMap = (value: unknown): Record<string, string> => Object.fromEntries(Object.entries(object(value)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));

export class NodeWorkspaceAdapter implements WorkspaceAdapter {
  readonly cwd: string;
  private markersPromise?: Promise<ProjectMarker[]>;
  private configTextPromise?: Promise<string | undefined>;
  private workingChangedFiles?: ChangedFile[];
  constructor(cwd = process.cwd()) { this.cwd = path.resolve(cwd); }
  beginCollection(): void { this.markersPromise = undefined; this.configTextPromise = undefined; this.workingChangedFiles = undefined; }
  async getWorkspaceFolders(): Promise<string[]> { return ['.']; }
  async getDiagnostics(): Promise<DiagnosticSignals> { return { available: false, errors: 0, warnings: 0, note: 'Node CLI has no language-server diagnostics. Use your project lint/build checks.' }; }
  async getTestSignals(): Promise<TestSignals> { return { testStatus: 'unknown', passed: null, failed: null, skipped: null, notRun: null, note: 'Test results have not been collected. Available test commands are listed by `deploybuddy checks`.' }; }
  async getContext(): Promise<ContextSignals> {
    const now = new Date();
    return { day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()] ?? 'Unknown', dayOfWeek: now.getDay(), hour: now.getHours(), minute: now.getMinutes(), timestamp: now.toISOString() };
  }
  async getGitSignals(): Promise<GitSignals> {
    try {
      const { stdout } = await execFile('git', ['--no-optional-locks', 'status', '--porcelain=v1', '--branch', '--untracked-files=all', '-z'], { cwd: this.cwd, maxBuffer: 1024 * 1024, timeout: GIT_TIMEOUT_MS, windowsHide: true });
      const entries = stdout.split('\0').filter(Boolean);
      const header = entries.shift() ?? '';
      const match = /^## (.*)$/.exec(header);
      const branchText = match?.[1] ?? '';
      const detached = /\(HEAD detached|HEAD \(no branch\)/i.test(branchText);
      const aheadBehind = /\[(?:ahead (\d+))?(?:, )?(?:behind (\d+))?\]/.exec(branchText);
      const upstreamMatch = /\.\.\.([^ ]+)/.exec(branchText);
      const branch = detached ? null : branchText.replace(/\.\.\..*$/, '').replace(/ \[.*$/, '').replace(/^No commits yet on /, '') || null;
      let revision: GitSignals['revision'];
      try {
        const [{ stdout: headOutput }, { stdout: branchOutput }] = await Promise.all([
          execFile('git', ['rev-parse', '--verify', 'HEAD'], { cwd: this.cwd, maxBuffer: 4096, timeout: GIT_TIMEOUT_MS, windowsHide: true }),
          execFile('git', ['branch', '--show-current'], { cwd: this.cwd, maxBuffer: 4096, timeout: GIT_TIMEOUT_MS, windowsHide: true }),
        ]);
        const sha = headOutput.trim().toLowerCase();
        if (/^[a-f0-9]{40,64}$/.test(sha)) revision = { sha, shortSha: sha.slice(0, 7), ...(branchOutput.trim() ? { branch: branchOutput.trim().slice(0, 255) } : {}), detached };
      } catch { /* Keep usable repository status when HEAD identity is unavailable. */ }
      const upstream = upstreamMatch?.[1] ?? null;
      const ahead = upstream ? Number(aheadBehind?.[1] ?? 0) : null;
      const behind = upstream ? Number(aheadBehind?.[2] ?? 0) : null;
      const changedPaths = new Set<string>();
      const fileChanges: ChangedFile[] = [];
      let stagedFiles = 0; let unstagedFiles = 0; let untrackedFiles = 0; let conflictFiles = 0;
      for (let i = 0; i < entries.length; i++) {
        const item = entries[i] ?? '';
        const xy = item.slice(0, 2);
        const file = item.slice(3);
        if (xy === '??') { untrackedFiles++; fileChanges.push({ path: file, status: 'added' }); }
        else {
          changedPaths.add(file);
          fileChanges.push({ path: file, status: xy.includes('R') || xy.includes('C') ? 'renamed' : xy.includes('A') ? 'added' : xy.includes('D') ? 'deleted' : xy.trim() ? 'modified' : 'unknown' });
          if (xy[0] !== ' ') stagedFiles++;
          if (xy[1] !== ' ') unstagedFiles++;
          if (['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD'].includes(xy)) conflictFiles++;
          if (xy.includes('R') || xy.includes('C')) i++;
        }
      }
      this.workingChangedFiles = normalizeChangedFiles(fileChanges);
      const changedFiles = changedPaths.size + untrackedFiles;
      const hasUncommittedChanges = changedFiles > 0;
      const repository = { root: '.', branch, upstream, ahead, behind, unstagedFiles, conflictFiles, detachedHead: detached, modifiedFiles: changedPaths.size, stagedFiles, untrackedFiles, changedFiles, hasUncommittedChanges, ...(revision ? { revision } : {}) };
      return { available: true, repositories: [repository], branch, upstream, ahead, behind, unstagedFiles, conflictFiles, detachedHead: detached, modifiedFiles: repository.modifiedFiles, stagedFiles, untrackedFiles, changedFiles, hasUncommittedChanges, dirtyPrimaryBranch: hasUncommittedChanges && (branch === 'main' || branch === 'master'), ...(revision ? { revision } : {}) };
    } catch { this.workingChangedFiles = []; return unavailableGit(); }
  }
  async getChangedFiles(range?: { from: string; to: string } | { base: string }): Promise<ChangedFile[]> {
    try {
      if (range && 'from' in range) {
        const from = await this.resolveRevision(range.from);
        const to = await this.resolveRevision(range.to);
        const { stdout } = await execFile('git', ['--no-optional-locks', 'diff', '--name-status', '-z', '--no-renames', `${from}...${to}`], { cwd: this.cwd, maxBuffer: 4 * 1024 * 1024, timeout: GIT_TIMEOUT_MS, windowsHide: true });
        return parseNameStatus(stdout);
      }
      if (range && 'base' in range) {
        const base = await this.resolveRevision(range.base);
        const { stdout } = await execFile('git', ['--no-optional-locks', 'diff', '--name-status', '-z', '--no-renames', `${base}...HEAD`], { cwd: this.cwd, maxBuffer: 4 * 1024 * 1024, timeout: GIT_TIMEOUT_MS, windowsHide: true });
        return parseNameStatus(stdout);
      }
      if (this.workingChangedFiles) return this.workingChangedFiles;
      const { stdout } = await execFile('git', ['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: this.cwd, maxBuffer: 4 * 1024 * 1024, timeout: GIT_TIMEOUT_MS, windowsHide: true });
      const parts = stdout.split('\0').filter(Boolean);
      const files: ChangedFile[] = [];
      for (let i = 0; i < parts.length; i++) {
        const record = parts[i] ?? '';
        const status = record.slice(0, 2);
        const filePath = record.slice(3);
        if (status === '??') files.push({ path: filePath, status: 'added' });
        else {
          const normalizedStatus = status.includes('R') || status.includes('C') ? 'renamed' : status.includes('A') ? 'added' : status.includes('D') ? 'deleted' : status.trim() ? 'modified' : 'unknown';
          files.push({ path: filePath, status: normalizedStatus });
          if (status.includes('R') || status.includes('C')) i++;
        }
      }
      return normalizeChangedFiles(files);
    } catch (error) {
      if (range) throw new Error(`Could not inspect the requested Git change range. Check that the revision exists and is reachable locally.`, { cause: error });
      return [];
    }
  }
  private async resolveRevision(revision: string): Promise<string> {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(revision) || revision.includes('..') || revision.includes('//') || revision.startsWith('-') || revision.endsWith('/') || revision.includes('@{')) throw new Error('Invalid Git revision.');
    const { stdout } = await execFile('git', ['--no-optional-locks', 'rev-parse', '--verify', `${revision}^{commit}`], { cwd: this.cwd, maxBuffer: 4096, timeout: GIT_TIMEOUT_MS, windowsHide: true });
    const resolved = stdout.trim().toLowerCase();
    if (!/^[a-f0-9]{40,64}$/.test(resolved)) throw new Error('Git revision could not be resolved.');
    return resolved;
  }
  async getProjectProfile(): Promise<ProjectProfile> { return detectProjectProfile(await this.getMarkers(), true); }
  async getCheckResults(): Promise<CheckResult[]> { return detectChecks(await this.getMarkers(), true); }
  async getConfig(): Promise<ConfigParseResult> {
    try { return parseDeployBuddyConfig(await this.getConfigText()); }
    catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return parseDeployBuddyConfig(undefined);
      if (isNodeError(error) && error.code === 'EFBIG') return parseDeployBuddyConfig(' '.repeat(MAX_CONFIG_BYTES + 1));
      return parseDeployBuddyConfig('{');
    }
  }
  async getPolicy(): Promise<PolicyParseResult> {
    try { return parseDeployBuddyPolicy(await this.getConfigText()); }
    catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return parseDeployBuddyPolicy(undefined);
      if (isNodeError(error) && error.code === 'EFBIG') return parseDeployBuddyPolicy(' '.repeat(MAX_CONFIG_BYTES + 1));
      return parseDeployBuddyPolicy('{');
    }
  }
  private getConfigText(): Promise<string | undefined> { this.configTextPromise ??= readOptionalBoundedText(this.cwd, '.deploybuddy.json', MAX_CONFIG_BYTES); return this.configTextPromise; }
  async getMarkers(): Promise<ProjectMarker[]> {
    this.markersPromise ??= this.readMarkers();
    return this.markersPromise;
  }
  private async readMarkers(): Promise<ProjectMarker[]> {
    const roots: Array<{ absolute: string; relative: string }> = [{ absolute: this.cwd, relative: './' }];
    try {
      const entries = await readdir(this.cwd, { withFileTypes: true });
      for (const entry of entries) if (entry.isDirectory() && !entry.name.startsWith('.') && !excluded.has(entry.name)) roots.push({ absolute: path.join(this.cwd, entry.name), relative: `./${safeSegment(entry.name)}` });
    } catch { return []; }
    const markers: ProjectMarker[] = [];
    for (const root of roots) {
      let files: string[];
      try { files = await readdir(root.absolute); } catch { continue; }
      if (!files.includes('package.json') && !files.includes('composer.json') && !files.includes('artisan') && !files.some(name => /^vite\.config\./.test(name))) continue;
      const marker: ProjectMarker = { root: root.relative, files, packageManagerFiles: files.filter(name => /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/.test(name)) };
      if (files.includes('package.json')) {
        try {
          const data = JSON.parse(await readBoundedText(root.absolute, 'package.json', MAX_MANIFEST_BYTES)) as unknown;
          const manifest = object(data);
          marker.packageDependencies = [...keys(manifest.dependencies), ...keys(manifest.devDependencies), ...keys(manifest.optionalDependencies)];
          marker.packageScripts = stringMap(manifest.scripts);
          marker.packageManager = typeof manifest.packageManager === 'string' ? manifest.packageManager : undefined;
        } catch { marker.parseErrors = [`Could not parse package.json in ${root.relative}`]; }
      }
      if (files.includes('composer.json')) {
        try {
          const manifest = object(JSON.parse(await readBoundedText(root.absolute, 'composer.json', MAX_MANIFEST_BYTES)) as unknown);
          marker.composerDependencies = [...keys(manifest.require), ...keys(manifest['require-dev'])];
          marker.composerScripts = stringMap(manifest.scripts);
        } catch { marker.parseErrors = [...(marker.parseErrors ?? []), `Could not parse composer.json in ${root.relative}`]; }
      }
      markers.push(marker);
    }
    return markers;
  }
}

function parseNameStatus(output: string): ChangedFile[] {
  const parts = output.split('\0');
  const files: ChangedFile[] = [];
  for (let i = 0; i < parts.length;) {
    const code = parts[i++] ?? '';
    if (!code) continue;
    const filePath = parts[i++] ?? '';
    const status = code[0] === 'A' ? 'added' : code[0] === 'D' ? 'deleted' : code[0] === 'R' || code[0] === 'C' ? 'renamed' : code[0] === 'M' || code[0] === 'T' ? 'modified' : 'unknown';
    files.push({ path: filePath, status });
    if (code[0] === 'R' || code[0] === 'C') i++;
  }
  return normalizeChangedFiles(files);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException { return error instanceof Error && 'code' in error; }
function safeSegment(value: string): string { return value.replace(/[^a-z0-9._ -]/gi, '_').slice(0, 64) || '_'; }
async function readOptionalBoundedText(directory: string, name: string, limit: number): Promise<string | undefined> {
  try { return await readBoundedText(directory, name, limit); }
  catch (error) { if (isNodeError(error) && error.code === 'ENOENT') return undefined; throw error; }
}
async function readBoundedText(directory: string, name: string, limit: number): Promise<string> {
  const filename = path.join(directory, name);
  const before = await lstat(filename);
  if (!before.isFile() || before.isSymbolicLink()) throw Object.assign(new Error('Expected a regular workspace file.'), { code: 'EINVAL' });
  if (before.size > limit) throw Object.assign(new Error('Workspace metadata file exceeds the size limit.'), { code: 'EFBIG' });
  const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;
  const handle = await open(filename, constants.O_RDONLY | noFollow);
  try {
    const after = await handle.stat();
    if (!after.isFile() || after.size > limit || before.dev !== after.dev || before.ino !== after.ino) throw Object.assign(new Error('Workspace metadata file changed during inspection or exceeds the size limit.'), { code: 'EFBIG' });
    return await handle.readFile({ encoding: 'utf8' });
  } finally { await handle.close(); }
}
