import type { ConfidenceLevel } from '../types/confidence';
import type { RiskLevel } from '../types/deployment';

export const LOW_RISK_LOW_CONFIDENCE_MESSAGE = 'Observed risk is low, but DeployBuddy does not yet have enough evidence to call this deployment safe.';

/** Add an evidence caveat to low-risk language without changing risk or verdict. */
export function getConfidenceAwareMessage(level: RiskLevel, confidence: ConfidenceLevel, ordinaryMessage: string): string {
  return level === 'safe' && confidence === 'low' ? LOW_RISK_LOW_CONFIDENCE_MESSAGE : ordinaryMessage;
}
