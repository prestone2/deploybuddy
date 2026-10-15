import type { ChangeCategory, ChangeFinding, ChangedFile, ChangedFileStatus } from '../types/changes';

const categoryOrder: ChangeCategory[] = ['documentation', 'tests', 'database', 'dependencies', 'ci', 'infrastructure', 'security', 'configuration', 'api', 'frontend', 'backend', 'mobile', 'unknown'];
const safePath = (raw: string): string | undefined => {
  if (!raw || raw.length > 4096 || [...raw].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || raw.startsWith('/') || /^[a-z]:/i.test(raw)) return undefined;
  const normalized = raw.replaceAll('\\', '/');
  const parts = normalized.split('/');
  if (parts.some(part => part === '..' || part === '')) return undefined;
  return normalized.replace(/^\.\//, '').toLowerCase();
};

export function classifyChangedPath(rawPath: string): ChangeCategory {
  const p = safePath(rawPath);
  if (!p) return 'unknown';
  const base = p.split('/').at(-1) ?? p;
  if (base.startsWith('readme') || p.startsWith('docs/') || /\.(md|mdx|rst|adoc)$/.test(base)) return 'documentation';
  if (/(^|\/)(__tests__|tests?|spec)\//.test(p) || /\.(test|spec)\.[^.]+$/.test(base)) return 'tests';
  if (/(^|\/)(database\/migrations|migrations|prisma\/migrations|db\/migrations)\//.test(p) || /(^|\/)(schema\.prisma|.*\.(sql|prisma))$/.test(p)) return 'database';
  if (/^(package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|composer\.json|composer\.lock|requirements[^/]*\.txt|poetry\.lock|pyproject\.toml|pubspec\.ya?ml|pubspec\.lock|go\.mod|go\.sum|cargo\.toml|cargo\.lock)$/.test(base)) return 'dependencies';
  if (p.startsWith('.github/workflows/') || ['.gitlab-ci.yml', 'jenkinsfile', 'azure-pipelines.yml', 'bitbucket-pipelines.yml'].includes(base)) return 'ci';
  if (/^dockerfile/.test(base) || /^docker-compose/.test(base) || /^compose\.(ya?ml)$/.test(base) || /(^|\/)(terraform|kubernetes|k8s|helm|charts|ansible)\//.test(p) || /\.tf(?:vars)?$/.test(base) || /(^|\/)(deployment|service|ingress|configmap|secret)\.ya?ml$/.test(p)) return 'infrastructure';
  if (/(^|\/)(auth|authentication|authorization|security|policies|permissions|guards|identity)\//.test(p) || /(^|\/)middleware\/auth[^/]*$/.test(p) || /(^|\/)(middleware\.ts|middleware\.js)$/.test(p)) return 'security';
  if (/^(vite\.config\.|tsconfig|eslint|phpunit|\.env\.|\.env$|\.editorconfig|\.nvmrc|\.node-version)/.test(base) || p.startsWith('config/') || /(^|\/)(nginx|supervisor)\//.test(p) || /^ecosystem\.config\./.test(base)) return 'configuration';
  if (/(^|\/)(routes|controllers|api|graphql|openapi|schema)\//.test(p) || /(^|\/)(openapi|swagger)\.[^.]+$/.test(p)) return 'api';
  if (/(^|\/)(android|ios|lib)\//.test(p) && (p.startsWith('android/') || p.startsWith('ios/')) || /\.(dart|swift|kt|kts)$/.test(base)) return 'mobile';
  if (/(^|\/)(src\/)?(components|pages|frontend|client|public)\//.test(p) || /\.(tsx|jsx|css|scss|vue|svelte)$/.test(base)) return 'frontend';
  if (/(^|\/)(app|src|server|backend)\//.test(p) || /\.(php|go|rs|py|java|cs)$/.test(base)) return 'backend';
  return 'unknown';
}

export function normalizeChangedFiles(files: readonly ChangedFile[]): ChangedFile[] {
  const byPath = new Map<string, ChangedFile>();
  for (const file of files) {
    const path = safePath(file.path);
    if (!path) continue;
    const status: ChangedFileStatus = ['added', 'modified', 'deleted', 'renamed', 'unknown'].includes(file.status) ? file.status : 'unknown';
    byPath.set(path, { path, status });
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function getChangeFindings(files: readonly ChangedFile[]): ChangeFinding[] {
  const normalized = normalizeChangedFiles(files);
  const categories = normalized.map(file => classifyChangedPath(file.path));
  const has = (category: ChangeCategory): boolean => categories.includes(category);
  const findings: ChangeFinding[] = [];
  if (has('database')) findings.push({ code: 'database.migrationsChanged', severity: 'warning', title: 'Database migrations changed', detail: 'Database migration or schema paths changed; review deployment order and rollback expectations.' });
  if (has('dependencies')) findings.push({ code: 'dependencies.changed', severity: 'warning', title: 'Dependency definitions changed', detail: 'Dependency manifests or lockfiles changed.' });
  const manifests = normalized.filter(file => ['package.json', 'composer.json', 'pyproject.toml', 'pubspec.yaml'].includes(file.path.split('/').at(-1) ?? ''));
  for (const manifest of manifests) {
    const base = manifest.path.split('/').at(-1) ?? '';
    const lockPair = base === 'package.json' ? ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'] : base === 'composer.json' ? ['composer.lock'] : base === 'pyproject.toml' ? ['poetry.lock'] : ['pubspec.lock'];
    const dir = manifest.path.slice(0, manifest.path.lastIndexOf('/') + 1);
    if (!normalized.some(file => file.path.startsWith(dir) && lockPair.includes(file.path.slice(dir.length)))) {
      findings.push({ code: 'dependencies.manifestWithoutLockfile', severity: 'info', title: 'Dependency manifest changed without a matching lockfile', detail: 'A dependency manifest changed without a matching lockfile in this change set. Some workflows intentionally update these separately.' });
    }
  }
  if (has('ci')) findings.push({ code: 'ci.workflowChanged', severity: 'warning', title: 'CI/CD configuration changed', detail: 'CI/CD workflow configuration changed; verify the intended checks still run.' });
  if (has('infrastructure')) findings.push({ code: 'infrastructure.changed', severity: 'warning', title: 'Infrastructure configuration changed', detail: 'Container, infrastructure, or deployment configuration changed.' });
  if (has('security')) findings.push({ code: 'security.sensitiveAreaChanged', severity: 'warning', title: 'Security-sensitive areas changed', detail: 'Security-sensitive paths changed. This is an area-change signal, not a vulnerability finding.' });
  if (has('api')) findings.push({ code: 'api.changed', severity: 'info', title: 'API or schema paths changed', detail: 'API routes, schemas, or interface definitions changed.' });
  if (has('configuration')) findings.push({ code: 'config.changed', severity: 'info', title: 'Application configuration changed', detail: 'Application or tool configuration paths changed.' });
  const docsOnly = normalized.length > 0 && categories.every(category => category === 'documentation');
  if (docsOnly) findings.push({ code: 'docs.only', severity: 'info', title: 'Documentation-only changes', detail: 'All classified changed paths are documentation.' });
  const hasTests = has('tests');
  const implementation = categories.some(category => !['documentation', 'tests'].includes(category));
  if (hasTests) findings.push({ code: implementation ? 'tests.changedWithImplementation' : 'tests.changed', severity: 'info', title: implementation ? 'Tests changed alongside implementation' : 'Tests changed', detail: implementation ? 'Test paths changed alongside other implementation areas.' : 'Test paths changed.' });
  else if (implementation) findings.push({ code: 'tests.notChangedWithImplementation', severity: 'info', title: 'Implementation changed without test-path changes', detail: 'No test paths were present in this change set; this heuristic does not determine test adequacy.' });
  return findings;
}

export { categoryOrder as CHANGE_CATEGORY_ORDER };
