export type ConfidenceLevel = 'low' | 'medium' | 'high';
export interface EvidenceConfidence {
  score: number;
  level: ConfidenceLevel;
  available: string[];
  missing: string[];
}
