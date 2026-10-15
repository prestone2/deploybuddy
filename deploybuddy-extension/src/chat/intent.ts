export type DeployBuddyIntent = 'check' | 'explain' | 'roast' | 'fix' | 'status' | 'git' | 'policy' | 'compare' | 'baseline' | 'history' | 'trend' | 'changes' | 'riskChanges' | 'readiness' | 'release';
export function detectIntent(prompt: string, command?: string): DeployBuddyIntent {
  if (command && ['check', 'explain', 'roast', 'fix', 'status', 'git', 'policy', 'compare', 'baseline', 'history', 'trend', 'changes', 'riskChanges', 'readiness'].includes(command)) return command as DeployBuddyIntent;
  if (command === 'release') return 'release';
  if (/\b(can this ship|pass release gates|blocking release|release gates|according to repo rules)\b/.test(prompt.toLowerCase())) return 'release';
  const text = prompt.toLowerCase().replace(/[’']/g, '');
  if (/\b(release readiness|release ready|ready to release|should this release proceed|readiness)\b/.test(text)) return 'readiness';
  if (/\b(what commit made this worse|when did risk (increase|go up)|recent risk changes|risk changes|when did policy start failing|policy first begin failing)\b/.test(text)) return 'riskChanges';
  if (/\b(baseline|what changed|compare with my last baseline)\b/.test(text)) return 'compare';
  if (/\b(history|recent checks|keeps? going wrong|common (deployment )?(issue|concern))\b/.test(text)) return 'history';
  if (/\b(what areas changed|what files changed|touch migrations|did dependencies change|changed areas|are these changes risky)\b/.test(text)) return 'changes';
  if (/\b(how are we doing|getting safer|safer over time|deployment trend|trend|over time)\b/.test(text)) return 'trend';
  if (/\b(compare|riskier|improv(e|ed|ement))\b/.test(text)) return 'compare';
  if (/\broast\b/.test(text)) return 'roast';
  if (/\b(fix|repair|prioriti[sz]e|what.*wrong)\b/.test(text)) return 'fix';
  if (/\b(git|push|origin|upstream|branch|merge conflicts?)\b/.test(text)) return 'git';
  if (/\b(policy|policies|repository rules)\b/.test(text)) return 'policy';
  if (/\b(status|summary|summari[sz]e)\b/.test(text)) return 'status';
  if (/\b(why|explain|reasons?)\b/.test(text)) return 'explain';
  if (/\b(deploy|ship|safe|production|check)\b/.test(text)) return 'check';
  return 'explain';
}
