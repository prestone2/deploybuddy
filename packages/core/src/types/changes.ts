export type ChangeCategory = 'documentation' | 'tests' | 'database' | 'dependencies' | 'ci' | 'infrastructure' | 'security' | 'configuration' | 'api' | 'frontend' | 'backend' | 'mobile' | 'unknown';
export type ChangedFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'unknown';
export interface ChangedFile { path: string; status: ChangedFileStatus }
export interface ChangeCategorySummary { category: ChangeCategory; count: number }
export interface ChangeFinding { code: string; severity: 'info' | 'warning'; title: string; detail: string }
export interface ChangeSummary { totalFiles: number; categories: ChangeCategorySummary[]; findings: ChangeFinding[] }
export type ChangeAttentionLevel = 'low' | 'moderate' | 'high' | 'critical';
export interface ChangeAssessment { summary: ChangeSummary; attention: { level: ChangeAttentionLevel; reasons: string[] } }
