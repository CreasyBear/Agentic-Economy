import type { ObjectType } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { MutationCtx } from '../../../_generated/server'
import { actionExecutionTransactArgs } from '../../../lib/actionExecution/control/contracts'
import { canonicalCommandReadbackMatches, commandMatchesDispatch, persistedDispatchMatches, type OpenDispatchValue } from './callIdentity'
import type { CallDispatchMutationResult } from './contracts'

type DispatchCommand = ObjectType<typeof actionExecutionTransactArgs>

export async function claimDispatchHandler(
  ctx: MutationCtx,
  { dispatch, command }: { dispatch: OpenDispatchValue; command: DispatchCommand },
): Promise<CallDispatchMutationResult> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', dispatch.callRef))
    .unique()
  if (
    row === null
    || !persistedDispatchMatches(row, dispatch)
    || row.state !== 'pending'
    || row.dispatchState === 'completed'
    || row.dispatchState === 'reconciliation_required'
    || dispatch.authority === undefined
    || !commandMatchesDispatch(command, dispatch)
  ) return { kind: 'refused', code: 'outer_identity_refused' }
  const canonicalResult = await ctx.runMutation(
    internal.actionExecutionControl.transact,
    command,
  )
  if (canonicalResult.kind === 'refused') return canonicalResult
  if (!await canonicalCommandReadbackMatches(ctx, command)) {
    return { kind: 'refused', code: 'command_identity_conflict' }
  }
  const attempt = command.currentAttemptWrite as { attemptRef: string; effectGeneration: number }
  await ctx.db.patch(row._id, {
    dispatchState: 'running',
    attemptRef: attempt.attemptRef,
    updatedAt: Date.now(),
    ...(dispatch.dispatchedCredentialId === undefined ? {} : { dispatchedCredentialId: dispatch.dispatchedCredentialId }),
  })
  return {
    kind: canonicalResult.kind,
    attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration,
  }
}
