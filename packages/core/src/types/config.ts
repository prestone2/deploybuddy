export interface DeployBuddyConfig {
  thresholds: { safeMax: number; cautionMax: number };
  /** CLI process exit behavior only; it never changes the risk assessment. */
  exitOnDanger: boolean;
}

export interface ConfigParseResult {
  config: DeployBuddyConfig;
  valid: boolean;
  errors: string[];
}
