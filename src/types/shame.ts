import type { DeploymentSituation } from './deployment'
export interface ShameEntry extends DeploymentSituation {
  id: string
  risk: number
  verdict: string
  message: string
  title: string
  timestamp: string
}
export interface ShameStats { worstDecision: number; total: number; survivalRate: number }
export type ShameSort = 'dangerous' | 'least' | 'newest' | 'oldest'
export interface Achievement { id: string; title: string; description: string; unlocked: boolean }
