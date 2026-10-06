import type { TestSignals } from '../types/deployment';
/** Stable VS Code APIs do not expose other extensions' test results to consumers.
 * TestController owns its tests; finding test files does not establish a passing run.
 * Do not use proposed APIs, parse arbitrary reports, or execute workspace commands.
 */
export function getTestSignals(): TestSignals {
  return { testStatus: 'unknown', passed: null, failed: null, skipped: null, notRun: null,
    note: 'Stable VS Code APIs do not expose workspace-wide test results from other test controllers. Run your test suite and check its results separately.' };
}
