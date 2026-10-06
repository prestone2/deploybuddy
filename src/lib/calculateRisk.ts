import type { DeploymentSituation } from '../types/deployment'
export function calculateRisk(s: DeploymentSituation): number {
  let risk = s.day === 'Friday' ? 30 : ['Saturday', 'Sunday'].includes(s.day) ? 20 : 0
  const [hours, minutes] = s.time.split(':').map(Number)
  if (hours * 60 + minutes > 16 * 60) risk += 25
  const testRisk = { 'All passing': 0, 'Most are passing': 20, 'Some are failing': 35, "I didn't run them": 45, 'What are tests?': 60 }
  risk += testRisk[s.tests]
  if (s.bossOnline) risk += 10
  if (s.coffee === 0) risk += 15
  if (s.coffee >= 5) risk += 10
  if (s.confidence < 50) risk += 20
  if (s.confidence < 25) risk += 15
  return Math.min(100, Math.max(0, risk))
}
