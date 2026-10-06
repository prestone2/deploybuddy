export type GitGuardrailSeverity = 'info' | 'warning' | 'danger';
export interface GitGuardrailFinding {
  severity: GitGuardrailSeverity; code: string; title: string; detail: string;
  repository?: string;
}
export type GitOperation = 'inspect' | 'push';
