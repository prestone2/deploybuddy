export type DeployBuddyIntent = 'check' | 'explain' | 'roast' | 'fix' | 'status' | 'git';
export function detectIntent(prompt: string, command?: string): DeployBuddyIntent {
  if (command && ['check', 'explain', 'roast', 'fix', 'status', 'git'].includes(command)) return command as DeployBuddyIntent;
  const text = prompt.toLowerCase().replace(/[’']/g, '');
  if (/\broast\b/.test(text)) return 'roast';
  if (/\b(fix|repair|prioriti[sz]e|what.*wrong)\b/.test(text)) return 'fix';
  if (/\b(git|push|origin|upstream|branch|merge conflicts?)\b/.test(text)) return 'git';
  if (/\b(status|summary|summari[sz]e)\b/.test(text)) return 'status';
  if (/\b(why|explain|reasons?)\b/.test(text)) return 'explain';
  if (/\b(deploy|ship|safe|production|check)\b/.test(text)) return 'check';
  return 'explain';
}
