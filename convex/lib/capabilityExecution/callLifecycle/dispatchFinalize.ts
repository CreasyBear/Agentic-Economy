import { recordCallTerminal } from '@/lib/observability/journey'
import { type ObjectType } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { actionExecutionTransactArgs } from '../../../lib/actionExecution/control/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { recordInvocationRefused, recordMarketEvidenceFact } from '../../../marketEvidence'
import { emitJourneyEvent } from '../../journey/events'
import { materializePurchaseResolutionRecord } from './purchaseResolutionMaterialize'
import { assertCallResultJson, canonicalCommandReadbackMatches, commandMatchesDispatch, persistedDispatchMatches, type OpenDispatchValue } from './callIdentity'
import type { CallDispatchMutationResult, CallDispatchProjectionShape } from './contracts'
import { upsertCallProjection } from './dispatchProjection'

type CallRow = Doc<'capabilityCalls'>
type DispatchCommand = ObjectType<typeof actionExecutionTransactArgs>

function projectedOuterMatches(row: CallRow, projection: CallDispatchProjectionShape): boolean {
  return [
    row.state === projection.state,
    row.dispatchState === projection.dispatchState,
    row.attemptRef === projection.attemptRef,
    canonicalDigest((row.result ?? null) as never) === canonicalDigest((projection.result ?? null) as never),
    canonicalDigest((row.usage ?? null) as never) === canonicalDigest((projection.usage ?? null) as never),
    (row.evidenceHash ?? null) === (projection.evidenceHash ?? null),
  ].every(Boolean)
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function validFinalizationEnvelope(
  row: CallRow | null,
  dispatch: OpenDispatchValue,
  command: DispatchCommand,
  projection: CallDispatchProjectionShape,
): row is CallRow {
  if (row === null || !isRecord(projection)) return false
  return [
    persistedDispatchMatches(row, dispatch),
    ['completed', 'refused', 'reconciliation_required'].includes(projection.state),
    ['completed', 'failed', 'reconciliation_required'].includes(projection.dispatchState),
    isOptionalString(projection.attemptRef),
    commandMatchesDispatch(command, dispatch),
  ].every(Boolean)
}

async function terminalFinalizationResult(
  ctx: MutationCtx,
  row: CallRow,
  command: DispatchCommand,
  projection: CallDispatchProjectionShape,
): Promise<CallDispatchMutationResult | null> {
  if (row.state === 'pending') return null
  if (!projectedOuterMatches(row, projection)) return { kind: 'refused', code: 'outer_state_refused' }
  if (!await canonicalCommandReadbackMatches(ctx, command)) return { kind: 'refused', code: 'outer_state_refused' }
  const attempt = command.currentAttemptWrite as { attemptRef: string; effectGeneration: number }
  return { kind: 'duplicate', attemptRef: attempt.attemptRef, effectGeneration: attempt.effectGeneration }
}

const WEEK_MS = 7 * 24 * 3600_000

type FundingSource = 'real' | 'trial' | 'sandbox'

/** Production Calls covered wholly by promotional (trial) credit are 'trial'; any purchased units make it 'real'. */
export function callFundingSource(row: Pick<CallRow, 'environment' | 'promotionalCreditAllocation'>): FundingSource {
  if (row.environment !== 'production') return 'sandbox'
  const allocation = row.promotionalCreditAllocation
  return allocation !== undefined && BigInt(allocation.purchasedUnits) === 0n ? 'trial' : 'real'
}

/** first_call fires on the first completed Call and carries its funding_source. activated fires on the first
 * completed Call with a receipt paid from real credit (trial and sandbox Calls never activate). retained_w1 is week-1 retention: a receipted Call 7 to 14 days after activation.
 * Each is idempotent per account. */
export async function journeyForFinalization(
  ctx: MutationCtx,
  row: Pick<CallRow, 'callRef' | 'ownerId' | 'environment' | 'promotionalCreditAllocation'>,
  projection: Pick<CallDispatchProjectionShape, 'state' | 'result'>,
  finalizedAt: number,
): Promise<void> {
  if (projection.state !== 'completed') return
  const fundingSource = callFundingSource(row)
  await emitJourneyEvent(ctx, row.ownerId, 'first_call', { props: { funding_source: fundingSource } })
  const result = projection.result
  const receipt = result !== undefined && 'receipt' in result ? result.receipt : undefined
  if (receipt === undefined) return
  const activated = await ctx.db.query('journeyEvents')
    .withIndex('by_eventKey', q => q.eq('eventKey', `${row.ownerId}:activated`))
    .unique()
  if (activated === null) {
    if (fundingSource === 'real') await emitJourneyEvent(ctx, row.ownerId, 'activated', {
      props: { funding_source: fundingSource },
    })
    return
  }
  const sinceActivated = finalizedAt - activated.createdAt
  if (sinceActivated >= WEEK_MS && sinceActivated < 2 * WEEK_MS) await emitJourneyEvent(ctx, row.ownerId, 'retained_w1')
}

async function recordFinalizationEvidence(
  ctx: MutationCtx,
  row: CallRow,
  projection: CallDispatchProjectionShape,
): Promise<void> {
  const { state, result } = projection
  if (state === 'refused' && result?.kind === 'refused') {
    await recordInvocationRefused(ctx, row.callRef, row.toolRef, result.code, Date.now())
  }
  if (state === 'completed') {
    const completedAt = Date.now()
    await recordMarketEvidenceFact(ctx, 'ae_invocation_completed', row.callRef, completedAt, {
      toolRef: row.toolRef,
      durationMs: Math.max(0, completedAt - row.createdAt),
    })
  }
  if (state === 'reconciliation_required') {
    await recordMarketEvidenceFact(ctx, 'ae_reconciliation_required', row.callRef, Date.now())
  }
}

export async function finalizeDispatchHandler(
  ctx: MutationCtx,
  { dispatch, command, projection }: {
    dispatch: OpenDispatchValue
    command: DispatchCommand
    projection: CallDispatchProjectionShape
  },
): Promise<CallDispatchMutationResult> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', dispatch.callRef))
    .unique()
  if (!validFinalizationEnvelope(row, dispatch, command, projection)) {
    return { kind: 'refused', code: 'outer_identity_refused' }
  }
  const normalizedProjection = projection
  if (normalizedProjection.result !== undefined) {
    assertCallResultJson(normalizedProjection.result)
  }
  const terminalResult = await terminalFinalizationResult(ctx, row, command, normalizedProjection)
  if (terminalResult !== null) return terminalResult
  const canonicalResult = await ctx.runMutation(
    internal.actionExecutionControl.transact,
    command,
  )
  if (canonicalResult.kind === 'refused') return canonicalResult
  if (!await canonicalCommandReadbackMatches(ctx, command)) {
    return { kind: 'refused', code: 'command_identity_conflict' }
  }
  const attempt = command.currentAttemptWrite as { attemptRef: string; effectGeneration: number }
  const finalizedAt = Date.now()
  await ctx.db.patch(row._id, {
    state: normalizedProjection.state,
    result: normalizedProjection.result,
    usage: normalizedProjection.usage,
    evidenceHash: normalizedProjection.evidenceHash,
    attemptRef: normalizedProjection.attemptRef,
    dispatchState: normalizedProjection.dispatchState,
    updatedAt: finalizedAt,
  })
  await upsertCallProjection(ctx, row, normalizedProjection, finalizedAt)
  await materializePurchaseResolutionRecord(ctx, row, normalizedProjection, finalizedAt)
  await journeyForFinalization(ctx, row, normalizedProjection, finalizedAt)
  await recordFinalizationEvidence(ctx, row, normalizedProjection)
  // Commit recovery scheduling with the stopped Call. Closing the browser cannot
  // abandon this job; it reads the original nonce and never sends a new payment.
  // A signed pre-submit refusal also needs proof of unused expiry: not_settled
  // alone cannot release the hold while the authorization could still be used.
  if (normalizedProjection.state === 'reconciliation_required') {
    const payment = await ctx.db.query('moneyX402PaymentAttempts')
      .withIndex('by_attemptRef_and_effectGeneration', q => q.eq('attemptRef', attempt.attemptRef)
        .eq('effectGeneration', attempt.effectGeneration)).unique()
    if (payment?.paymentAuthorizationExpiresAt !== undefined
      && (payment.settlementStatus === 'unknown' || payment.settlementStatus === 'not_settled')
      && payment.paymentResponseDigest === undefined) {
      await ctx.scheduler.runAt(Math.max(finalizedAt, payment.paymentAuthorizationExpiresAt + 30_000),
        internal.moneyX402ExpiryActions.recover, { callRef: row.callRef })
    }
  }
  recordCallTerminal(row.state, normalizedProjection.state)
  return {
    kind: canonicalResult.kind,
    attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration,
  }
}
