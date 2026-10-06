import { calculateRisk } from './calculateRisk'
import type { DeploymentSituation, Verdict } from '../types/deployment'
export function generateVerdict(s: DeploymentSituation): Verdict {
  const risk = calculateRisk(s)
  const level = risk <= 30 ? 'safe' : risk <= 65 ? 'warning' : 'danger'
  const clues: string[] = []
  if (s.day === 'Friday') clues.push("It's Friday")
  else if (['Saturday', 'Sunday'].includes(s.day)) clues.push("It's the weekend")
  if (s.time > '16:00') clues.push('the workday is packing its bags')
  if (s.tests !== 'All passing') clues.push(s.tests === 'What are tests?' ? 'tests are apparently a philosophical concept' : s.tests === "I didn't run them" ? 'your tests are living in mystery' : `the tests are “${s.tests.toLowerCase()}”`)
  if (s.bossOnline) clues.push('your boss has a front-row seat')
  if (s.confidence < 50) clues.push('your confidence slider is trying to tell you something')
  if (s.coffee === 0) clues.push('you are running on zero coffee')
  if (s.coffee >= 5) clues.push('your bloodstream is mostly espresso')
  const explanation = level === 'safe' ? (clues.length ? `${clues.join(', ')}. Still, you have reached the rare green zone. Don't ruin it.` : 'Passing tests, a sensible hour, and a steady hand. The gods of CI/CD are with you.') : `${clues.join(', ')}. ${level === 'danger' ? 'This smells like a future incident report.' : 'Production remembers everything. Maybe give this one another look.'}`
  return { risk, level, title: level === 'safe' ? 'DEPLOY' : level === 'warning' ? 'QUESTIONABLE LIFE CHOICES' : 'DO NOT DEPLOY', explanation, advice: level === 'safe' ? 'Ship it. Keep an eye on the logs, and enjoy your moment of glory.' : s.tests === 'Some are failing' ? 'If the tests are failing locally, production will not magically become supportive.' : level === 'danger' ? 'Close VS Code. Production has a family.' : 'Double-check the diff. Deploy tomorrow. Future-you deserves better.' }
}
