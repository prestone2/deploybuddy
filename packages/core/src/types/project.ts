export interface ProjectMarker {
  /** Sanitized root relative to the inspected project, such as ./ or ./frontend. */
  root: string;
  files: string[];
  packageDependencies?: string[];
  packageScripts?: Record<string, string>;
  composerDependencies?: string[];
  composerScripts?: Record<string, string>;
  packageManagerFiles?: string[];
  packageManager?: string;
  parseErrors?: string[];
}

export interface ProjectProfile {
  available: boolean;
  frameworks: string[];
  packageManagers: string[];
  roots: string[];
  parseErrors: string[];
}
