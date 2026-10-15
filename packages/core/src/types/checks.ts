export type CheckKind = 'build' | 'lint' | 'tests';
export type CheckAvailability = 'available' | 'unavailable' | 'unknown';

export interface CheckResult {
  kind: CheckKind;
  status: CheckAvailability;
  command: string | null;
  /** Set only when an adapter has reliable execution evidence, never for mere script discovery. */
  result?: 'passed' | 'failed' | 'not_run';
}
