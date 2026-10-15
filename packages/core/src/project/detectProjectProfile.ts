import type { ProjectMarker, ProjectProfile } from '../types/project';

const knownFrameworks: Array<[string, string[]]> = [
  ['laravel', ['laravel/framework']], ['vite', ['vite']], ['react', ['react']], ['vue', ['vue']],
  ['next.js', ['next']], ['nuxt', ['nuxt']], ['svelte', ['svelte']], ['angular', ['@angular/core']],
  ['express', ['express']], ['nestjs', ['@nestjs/core']], ['astro', ['astro']],
];

export function detectProjectProfile(markers: ProjectMarker[], available = true): ProjectProfile {
  const frameworks = new Set<string>();
  const packageManagers = new Set<string>();
  const roots: string[] = [];
  const parseErrors = new Set<string>();
  for (const marker of markers) {
    if (marker.root && !roots.includes(marker.root)) roots.push(marker.root);
    for (const item of marker.parseErrors ?? []) parseErrors.add(item);
    const files = new Set(marker.files.map(file => file.toLowerCase()));
    const packageNames = new Set([...(marker.packageDependencies ?? []), ...(marker.composerDependencies ?? [])]);
    if (packageNames.has('laravel/framework') || files.has('artisan')) frameworks.add('laravel');
    for (const [framework, packages] of knownFrameworks) {
      if (framework !== 'laravel' && packages.some(name => packageNames.has(name))) frameworks.add(framework);
    }
    if ([...files].some(file => /^vite\.config\./.test(file)) || packageNames.has('vite')) frameworks.add('vite');
    if (files.has('composer.json')) packageManagers.add('Composer');
    if (files.has('package.json')) {
      const locks = new Set([...(marker.packageManagerFiles ?? []), ...marker.files]);
      if (marker.packageManager?.startsWith('pnpm')) packageManagers.add('pnpm');
      else if (marker.packageManager?.startsWith('yarn')) packageManagers.add('Yarn');
      else if (marker.packageManager?.startsWith('bun')) packageManagers.add('Bun');
      else if (locks.has('pnpm-lock.yaml')) packageManagers.add('pnpm');
      else if (locks.has('yarn.lock')) packageManagers.add('Yarn');
      else if (locks.has('bun.lock') || locks.has('bun.lockb')) packageManagers.add('Bun');
      else if (locks.has('package-lock.json')) packageManagers.add('npm');
      else packageManagers.add('npm');
    }
  }
  return { available, frameworks: [...frameworks].sort(), packageManagers: [...packageManagers].sort(), roots, parseErrors: [...parseErrors] };
}
