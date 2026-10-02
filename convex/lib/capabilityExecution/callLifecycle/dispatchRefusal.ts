import { recordCallTerminal } from '@/lib/observability/journey'
import { internal } from '../../../_generated/api'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { callResultValue } from '@/modules/capability-execution/convex'
import { type Infer, type ObjectType, v } from 'convex/values'
import { assertCallEnvironment, callEnvironmentMatches, purchaseIdentityMatches } from './callIdentity'


type CallRow = Doc<'capabilityCalls'>
type CallResultValue = Infer<typeof callResultValue>

/**
 * Refuse a Call only while its dispatch work is still unclaimed. The mutation
 * reads the Call and canonical execution control in one transaction, so a
 * claim or release fence wins the race without being overwritten.
 */
export const refuseUnclaimedArgs = {
  callRef: v.string(),
  principalId: v.string(),
  credentialId: v.string(),
  idempotencyKey: v.string(),
  code: v.string(),
  retryable: v.boolean(),
  nextAction: v.optional(v.string()),
} as const

export const refuseUnclaimedResult = v.union(
  v.object({ kind: v.literal('refused'), releaseRequired: v.boolean() }),
  v.object({ kind: v.literal('claimed') }),
  v.object({ kind: v.literal('possibly_released') }),
  v.object({ kind: v.literal('terminal') }),
  v.object({ kind: v.literal('not_found') }),
)

export const readPreClaimRefundArgs = {
  callRef: v.string(),
} as const
export const readPreClaimRefundResult = v.boolean()

export type RefuseUnclaimedArgs = ObjectType<typeof refuseUnclaimedArgs>
export type RefuseUnclaimedResult = Infer<typeof refuseUnclaimedResult>
export type ReadPreClaimRefundArgs = ObjectType<typeof readPreClaimRefundArgs>

function refusalResultForRow(
  row: CallRow,
): Extract<RefuseUnclaimedResult, { kind: 'refused' }> {
  return {
    kind: 'refused',
    releaseRequired: row.reconciliation?.reason === 'refund_pending',
  }
}

function persistedPreClaimRefusal(
  row: CallRow,
  control: Doc<'actionExecutionControls'> | null,
  attempts: Doc<'actionExecutionAttempts'>[],
): boolean {
  return [
    row.state === 'refused',
    row.dispatchState === 'failed',
    row.result?.kind === 'refused',
    row.attemptRef === undefined,
    control === null,
    attempts.length === 0,
  ].every(Boolean)
}

export function financialStateHasReleaseUncertainty(row: CallRow): boolean {
  switch (row.formanceFinancialState) {
    case 'reservation_pending':
    case 'possibly_submitted':
    case 'outcome_unknown':
    case 'settled':
      return true
    default:
      return false
  }
}

function canonicalControlRefusal(
  control: Doc<'actionExecutionControls'>,
): Exclude<RefuseUnclaimedResult, { kind: 'refused' | 'not_found' }> {
  const canonical = control.control.control
  if (canonical.state === 'terminal' || canonical.state === 'cancelled') {
    return { kind: 'terminal' }
  }
  if (
    canonical.state === 'reconciliation_required'
    || (canonical.state === 'leased' && canonical.release === 'possibly_released')
  ) {
    return { kind: 'possibly_released' }
  }
  return { kind: 'claimed' }
}

function orphanedAttemptRefusal(
  row: CallRow,
  attempts: Doc<'actionExecutionAttempts'>[],
): Exclude<RefuseUnclaimedResult, { kind: 'refused' | 'not_found' }> | null {
  if (row.attemptRef === undefined && attempts.length === 0) return null
  const attempt = attempts[0]
  if (
    attempt?.release.state === 'possibly_released'
    || attempt?.outcome.state === 'uncertain'
    || attempt?.outcome.state === 'timed_out'
  ) return { kind: 'possibly_released' }
  return { kind: 'claimed' }
}

export function isBuyerFormanceReservation(row: CallRow): boolean {
  return row.formanceFinancialState === 'reserved'
}

export function refundReconciliation(
  now: number,
): Readonly<{
  attemptCount: 0
  nextAttemptAt: number
  disposition: 'automatic'
  reason: 'refund_pending'
}> {
  return {
    attemptCount: 0,
    nextAttemptAt: now,
    disposition: 'automatic',
    reason: 'refund_pending',
  }
}

/**
 * Prove and persist a refusal before canonical claim. A refusal is the only
 * branch allowed to move a pending Call to refused without a control row; all
 * other control or release-fence states are returned without mutation.
 */
export async function refuseUnclaimedHandler(
  ctx: MutationCtx,
  args: RefuseUnclaimedArgs,
): Promise<RefuseUnclaimedResult> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
    .unique()
  if (row !== null) assertCallEnvironment(row)
  if (!purchaseIdentityMatches(row, args)) return { kind: 'not_found' }

  const [control, attempts] = await Promise.all([
    ctx.db.query('actionExecutionControls')
      .withIndex('by_executionRef', (query) => query.eq('executionRef', args.callRef))
      .unique(),
    ctx.db.query('actionExecutionAttempts')
      .withIndex('by_executionRef_and_attemptNumber', (query) => query.eq('executionRef', args.callRef))
      .take(1),
  ])

  if (control !== null) return canonicalControlRefusal(control)

  const orphanedAttempt = orphanedAttemptRefusal(row, attempts)
  if (orphanedAttempt !== null) return orphanedAttempt

  if (persistedPreClaimRefusal(row, control, attempts)) {
    return refusalResultForRow(row)
  }

  if (row.state !== 'pending') {
    return row.state === 'reconciliation_required' || row.dispatchState === 'reconciliation_required'
      ? { kind: 'possibly_released' }
      : { kind: 'terminal' }
  }
  if (row.dispatchState === 'completed' || financialStateHasReleaseUncertainty(row)) {
    return { kind: 'possibly_released' }
  }

  const now = Date.now()
  const result: CallResultValue = {
    kind: 'refused',
    toolRef: row.toolRef,
    code: args.code,
    retryable: args.retryable,
    ...(args.nextAction === undefined ? {} : { nextAction: args.nextAction }),
  }
  const releaseRequired = isBuyerFormanceReservation(row)
  const hasRefundSchedule = row.reconciliation?.reason === 'refund_pending'
  const shouldScheduleRefund = releaseRequired && !hasRefundSchedule
  recordCallTerminal(row.state, 'refused')
  await ctx.db.patch(row._id, {
    state: 'refused',
    result,
    dispatchState: 'failed',
    ...(releaseRequired && !hasRefundSchedule
      ? { reconciliation: refundReconciliation(now) }
      : {}),
    updatedAt: now,
  })
  if (shouldScheduleRefund) {
    await ctx.scheduler.runAfter(0, internal.capabilityCallWorker.reconcilePreClaimRefund, {
      callRef: row.callRef,
    })
  }
  return { kind: 'refused', releaseRequired }
}

function hasBuyerFormanceRefs(row: CallRow): boolean {
  const refs = row.formanceReservationRefs
  return refs !== undefined
    && refs.length === 3
    && refs.every((ref) => ref.trim().length > 0)
}

/**
 * Read-only proof consumed by refund cleanup. It is true only for a refused
 * Call or cancelled unstarted Call with no canonical control or
 * attempt and an existing Formance buyer reservation/refund schedule; it
 * grants no execution authority.
 */
export async function readPreClaimRefundHandler(
  ctx: QueryCtx,
  args: ReadPreClaimRefundArgs,
): Promise<boolean> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
    .unique()
  const result = row?.result
  const validTerminalResult = row !== null
    && ((row.state === 'refused' && result?.kind === 'refused')
      || (row.state === 'cancelled' && result?.kind === 'refused' && result.code === 'invocation_cancelled'))
  if (
    row === null
    || !callEnvironmentMatches(row)
    || !validTerminalResult
    || row.dispatchState !== 'failed'
    || row.attemptRef !== undefined
    || row.reconciliation?.reason !== 'refund_pending'
    || !hasBuyerFormanceRefs(row)
    || (row.formanceFinancialState !== 'reserved' && row.formanceFinancialState !== 'released')
  ) return false
  const [control, attempts] = await Promise.all([
    ctx.db.query('actionExecutionControls')
      .withIndex('by_executionRef', (query) => query.eq('executionRef', args.callRef))
      .take(1),
    ctx.db.query('actionExecutionAttempts')
      .withIndex('by_executionRef_and_attemptNumber', (query) => query.eq('executionRef', args.callRef))
      .take(1),
  ])
  return control.length === 0 && attempts.length === 0
}
