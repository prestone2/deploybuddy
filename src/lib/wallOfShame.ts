import { days, testOptions, type DeploymentSituation, type Verdict } from '../types/deployment'
import type { Achievement, ShameEntry, ShameSort, ShameStats } from '../types/shame'
const STORAGE_KEY = 'deploybuddy-wall-of-shame'
function isShameEntry(value: unknown): value is ShameEntry {
  if (!value || typeof value !== 'object') return false
  const e = value as Record<string, unknown>
  return ['id', 'verdict', 'message', 'title', 'timestamp'].every(key => typeof e[key] === 'string') &&
    typeof e.day === 'string' && days.some(day => day === e.day) && typeof e.tests === 'string' && testOptions.some(test => test === e.tests) &&
    typeof e.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(e.time) && typeof e.bossOnline === 'boolean' &&
    typeof e.risk === 'number' && Number.isFinite(e.risk) && e.risk >= 0 && e.risk <= 100 &&
    typeof e.coffee === 'number' && Number.isFinite(e.coffee) && e.coffee >= 0 &&
    typeof e.confidence === 'number' && Number.isFinite(e.confidence) && e.confidence >= 0 && e.confidence <= 100 &&
    Number.isFinite(Date.parse(e.timestamp as string))
}
export function getShameEntries(): ShameEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try { const parsed: unknown = JSON.parse(raw); return Array.isArray(parsed) ? parsed.filter(isShameEntry) : [] } catch { return [] }
}
export function generateShameTitle(s: DeploymentSituation, risk: number): string {
  const titles = ['Production Adventurer', 'Git Push Enthusiast', 'Works On My Machine Specialist']
  if (s.day === 'Friday') titles.push('Friday Deployment Enjoyer')
  if (s.day === 'Saturday' || s.day === 'Sunday') titles.push('Weekend Warrior')
  if (s.tests === "I didn't run them" || s.tests === 'What are tests?') titles.push('Test Suite Avoider', 'CI/CD Gambler')
  if (s.coffee >= 5) titles.push('Coffee-Driven Engineer')
  if (s.confidence < 50) titles.push('Confidence Not Found')
  if (risk >= 90) titles.push('Incident Report Speedrunner')
  return titles[Math.floor(Math.random() * titles.length)]
}
export function saveShameEntry(s: DeploymentSituation, v: Verdict): ShameEntry {
  if (v.risk < 31) throw new Error('Only risky attempts belong on the wall.')
  const entry: ShameEntry = { ...s, id: crypto.randomUUID(), risk: v.risk, verdict: v.title, message: v.explanation, title: generateShameTitle(s, v.risk), timestamp: new Date().toISOString() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...getShameEntries()]))
  return entry
}
export function deleteShameEntry(id: string): void { localStorage.setItem(STORAGE_KEY, JSON.stringify(getShameEntries().filter(e => e.id !== id))) }
export function clearShameEntries(): void { localStorage.removeItem(STORAGE_KEY) }
export function calculateShameStats(entries: ShameEntry[]): ShameStats {
  return { worstDecision: entries.reduce((max, e) => Math.max(max, e.risk), 0), total: entries.length, survivalRate: entries.length ? Math.max(0, Math.min(100, Math.round(100 - entries.reduce((sum, e) => sum + e.risk, 0) / entries.length))) : 100 }
}
export function sortShameEntries(entries: ShameEntry[], sort: ShameSort): ShameEntry[] {
  return [...entries].sort((a, b) => sort === 'dangerous' ? b.risk - a.risk : sort === 'least' ? a.risk - b.risk : sort === 'newest' ? Date.parse(b.timestamp) - Date.parse(a.timestamp) : Date.parse(a.timestamp) - Date.parse(b.timestamp))
}
export function getAchievements(entries: ShameEntry[]): Achievement[] {
  return [
    { id: 'friday', title: 'Friday Warrior', description: 'Saved a Friday deployment.', unlocked: entries.some(e => e.day === 'Friday') },
    { id: 'tests', title: 'No Tests, No Fear', description: 'Saved an attempt without running tests.', unlocked: entries.some(e => e.tests === "I didn't run them" || e.tests === 'What are tests?') },
    { id: 'coffee', title: 'Caffeine-Free Chaos', description: 'Saved a deployment with zero coffee.', unlocked: entries.some(e => e.coffee === 0) },
    { id: 'ninety', title: '90% Club', description: 'Recorded at least 90% risk.', unlocked: entries.some(e => e.risk >= 90) },
    { id: 'hundred', title: 'Production Has Left the Chat', description: 'Recorded a perfect 100% risk.', unlocked: entries.some(e => e.risk === 100) },
  ]
}
export function formatSavedTime(timestamp: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 60000))
  if (minutes < 1) return 'Saved just now'
  const [amount, unit] = minutes < 60 ? [minutes, 'minute'] : minutes < 1440 ? [Math.floor(minutes / 60), 'hour'] : [Math.floor(minutes / 1440), 'day']
  return `Saved ${amount} ${unit}${amount === 1 ? '' : 's'} ago`
}
export function formatDeploymentTime(time: string): string { const [hours, minutes] = time.split(':').map(Number); return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}` }
