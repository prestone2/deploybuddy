const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeChanges, classifyChangedPath, normalizeChangedFiles } = require('../dist');

test('path classification covers requested categories and rejects traversal/control paths', () => {
  const cases = [
    ['README.md', 'documentation'], ['docs/guide.mdx', 'documentation'], ['src/a.test.ts', 'tests'],
    ['database/migrations/001.sql', 'database'], ['package-lock.json', 'dependencies'],
    ['.github/workflows/ci.yml', 'ci'], ['Dockerfile.prod', 'infrastructure'], ['terraform/main.tf', 'infrastructure'],
    ['app/auth/login.php', 'security'], ['routes/api.php', 'api'], ['src/components/Button.tsx', 'frontend'],
    ['app/Services/Ship.php', 'backend'], ['ios/Runner/AppDelegate.swift', 'mobile'],
    ['../escape.php', 'unknown'], ['$(rm -rf x)', 'unknown'], ['x\nred.txt', 'unknown'],
  ];
  for (const [path, expected] of cases) assert.equal(classifyChangedPath(path), expected, path);
  assert.equal(normalizeChangedFiles([{ path: '../escape', status: 'added' }]).length, 0);
});

test('summaries classify renames by destination, retain deletions, and never expose paths in the summary', () => {
  const value = analyzeChanges([
    { path: 'database/migrations/old.sql', status: 'deleted' },
    { path: 'package.json', status: 'modified' },
    { path: 'app/auth/Policy.php', status: 'renamed' },
    { path: 'src/service.ts', status: 'modified' },
    { path: 'src/service.test.ts', status: 'added' },
  ]);
  assert.equal(value.summary.totalFiles, 5);
  assert.deepEqual(Object.fromEntries(value.summary.categories.map(item => [item.category, item.count])), { tests: 1, database: 1, dependencies: 1, security: 1, backend: 1 });
  assert.equal(value.attention.level, 'critical');
  assert.ok(value.summary.findings.some(item => item.code === 'database.migrationsChanged'));
  assert.ok(value.summary.findings.some(item => item.code === 'tests.changedWithImplementation'));
  assert.ok(!JSON.stringify(value.summary).includes('database/migrations'));
});

test('docs-only, lockfile advisory, and attention classes are deterministic', () => {
  assert.equal(analyzeChanges([{ path: 'README.md', status: 'modified' }]).attention.level, 'low');
  assert.ok(analyzeChanges([{ path: 'package.json', status: 'modified' }]).summary.findings.some(item => item.code === 'dependencies.manifestWithoutLockfile'));
  assert.equal(analyzeChanges([{ path: 'composer.json', status: 'modified' }, { path: 'package.json', status: 'modified' }]).attention.level, 'moderate');
  assert.equal(analyzeChanges([{ path: 'Dockerfile', status: 'modified' }, { path: 'database/migrations/1.sql', status: 'deleted' }]).attention.level, 'critical');
  assert.equal(analyzeChanges([]).summary.totalFiles, 0);
});

test('configuration, API, frontend, backend, mobile, unknown, and package-manager paths classify deterministically', () => {
  assert.equal(classifyChangedPath('vite.config.ts'), 'configuration');
  assert.equal(classifyChangedPath('config/app.php'), 'configuration');
  assert.equal(classifyChangedPath('routes/api.php'), 'api');
  assert.equal(classifyChangedPath('app/api/route.ts'), 'api');
  assert.equal(classifyChangedPath('src/components/Card.vue'), 'frontend');
  assert.equal(classifyChangedPath('app/Services/Deploy.php'), 'backend');
  assert.equal(classifyChangedPath('lib/main.dart'), 'mobile');
  assert.equal(classifyChangedPath('random.data'), 'unknown');
  assert.equal(classifyChangedPath('pubspec.yaml'), 'dependencies');
  assert.equal(classifyChangedPath('pyproject.toml'), 'dependencies');
  assert.equal(classifyChangedPath('Dockerfile'), 'infrastructure');
  const paired = analyzeChanges([{ path: 'frontend/package.json', status: 'modified' }, { path: 'package-lock.json', status: 'modified' }]);
  assert.ok(paired.summary.findings.some(item => item.code === 'dependencies.manifestWithoutLockfile'));
  const lockInPlace = analyzeChanges([{ path: 'package.json', status: 'modified' }, { path: 'package-lock.json', status: 'modified' }]);
  assert.ok(!lockInPlace.summary.findings.some(item => item.code === 'dependencies.manifestWithoutLockfile'));
});
