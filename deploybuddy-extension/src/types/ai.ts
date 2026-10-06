export interface AIVerdict { headline: string; explanation: string; recommendedAction: string }
export type HumorLevel = 'low' | 'normal' | 'high';
export type AIVerdictStatus = 'success' | 'disabled' | 'unavailable' | 'failed' | 'invalid' | 'cancelled' | 'timeout';
export interface AIVerdictResponse { status: AIVerdictStatus; verdict: AIVerdict }
export interface AIVerdictOptions { enabled: boolean; humorLevel: HumorLevel; roast?: boolean }
