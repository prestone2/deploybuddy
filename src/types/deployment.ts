export const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export const testOptions = ['All passing', 'Most are passing', 'Some are failing', "I didn't run them", 'What are tests?'] as const
export interface DeploymentSituation { day: typeof days[number]; time: string; coffee: number; tests: typeof testOptions[number]; bossOnline: boolean; confidence: number }
export type RiskLevel = 'safe' | 'warning' | 'danger'
export interface Verdict { risk: number; level: RiskLevel; title: string; explanation: string; advice: string }
