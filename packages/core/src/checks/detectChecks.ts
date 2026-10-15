import type { CheckKind, CheckResult } from '../types/checks';
import type { ProjectMarker } from '../types/project';

export function detectChecks(markers: ProjectMarker[], projectAvailable = true): CheckResult[] {
  const found = new Map<CheckKind, string>();
  let manifestFound = false;
  for (const marker of markers) {
    if (marker.packageScripts || marker.composerScripts) manifestFound = true;
    for (const [name] of Object.entries(marker.packageScripts ?? {})) {
      if (!/^[a-z0-9][a-z0-9:_-]*$/i.test(name)) continue;
      const kind: CheckKind | undefined = /^(build|build:)/.test(name) ? 'build' : /^(lint|lint:)/.test(name) ? 'lint' : /^(test(?::|$)|check)$/.test(name) ? 'tests' : undefined;
      if (kind && !found.has(kind)) found.set(kind, `npm run ${name}`);
    }
    for (const [name] of Object.entries(marker.composerScripts ?? {})) {
      if (!/^[a-z0-9][a-z0-9:_-]*$/i.test(name)) continue;
      const kind: CheckKind | undefined = /^(build|build:)/.test(name) ? 'build' : /^(lint|lint:)/.test(name) ? 'lint' : /^(test|test:)$/.test(name) ? 'tests' : undefined;
      if (kind && !found.has(kind)) found.set(kind, `composer ${name}`);
    }
    if ((marker.files.includes('artisan') || marker.composerDependencies?.includes('laravel/framework')) && !found.has('tests')) found.set('tests', 'php artisan test');
  }
  return (['build', 'lint', 'tests'] as const).map(kind => ({
    kind,
    status: found.has(kind) ? 'available' : projectAvailable && manifestFound ? 'unavailable' : 'unknown',
    command: found.get(kind) ?? null,
  }));
}
