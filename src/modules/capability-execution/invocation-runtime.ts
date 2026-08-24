"use node";

import type { ActionCtx } from '../../../convex/_generated/server'
import {
  recoverCapabilityOperationInvocation,
  recoveryArgs,
} from './invocation-worker/recover'
import { prepareInvocationRun } from './invocation-worker/runPreparation'
import { releaseInvocationRun } from './invocation-worker/runRelease'
import type { WorkerResult } from './invocation-worker/charge'

/**
 * Execution-owned durable Call worker surface for the thin Convex host.
 * Claim/fence/attempt details remain behind capability-execution.
 */
export async function runCapabilityOperationInvocation(
  ctx: ActionCtx,
  args: Readonly<{ invocationRef: string }>,
): Promise<WorkerResult> {
  const prepared = await prepareInvocationRun(ctx, args)
  return prepared.kind === 'prepared'
    ? await releaseInvocationRun(ctx, prepared)
    : prepared
}

export {
  recoverCapabilityOperationInvocation,
  recoveryArgs,
}
export type { WorkerResult }
