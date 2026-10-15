export type ReleaseReadinessStatus = 'ready' | 'needs_attention' | 'blocked' | 'insufficient_evidence';
export interface ReleaseReadinessReason {
  code: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
  detail: string;
}
export interface ReleaseReadiness {
  status: ReleaseReadinessStatus;
  reasons: ReleaseReadinessReason[];
  recommendedActions: string[];
}
