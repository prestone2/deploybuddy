import * as core from '@actions/core';
import { run } from './run';

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
  if (process.env.DEBUG === 'true' || process.env.RUNNER_DEBUG === '1') {
    core.debug(error instanceof Error ? error.stack ?? '' : String(error));
  }
});
