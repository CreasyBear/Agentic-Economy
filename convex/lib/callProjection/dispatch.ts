import type { ActionCtx } from '../../_generated/server'
import { internal } from '../../_generated/api'
import { buildCanonicalTerminalOutcomeCommand, toCallDispatchCommand, type CanonicalClaimSnapshot, type CanonicalTerminalOutcome, type OpenDispatch } from '@/modules/capability-execution/convex'
import type { CallDispatchProjection } from '../callLifecycle/contracts'


export async function finalizeCallDispatch(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  snapshot: CanonicalClaimSnapshot,
  outcome: CanonicalTerminalOutcome,
  projection: CallDispatchProjection,
  recordedAt: string,
): Promise<void> {
  const command = buildCanonicalTerminalOutcomeCommand({ snapshot, outcome, recordedAt })
  const persistedCommand = toCallDispatchCommand(command)
  const result = await ctx.runMutation(internal.capabilityCalls.finalizeDispatch, {
    dispatch,
    command: persistedCommand,
    projection,
  })
  if (result.kind === 'refused') throw new Error(`operation_finalize_${result.code}`)
}
