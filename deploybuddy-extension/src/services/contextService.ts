import type { ContextSignals } from '../types/deployment';
export function getContextSignals(now = new Date()): ContextSignals {
  return { day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()] ?? 'Unknown', dayOfWeek: now.getDay(), hour: now.getHours(), minute: now.getMinutes(), timestamp: now.toISOString() };
}
