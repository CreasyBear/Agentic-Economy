import { type Infer, type ObjectType, v } from 'convex/values'
import { internal } from '../../_generated/api'
import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { actionExecutionTransactArgs } from '../../actionExecutionControl'
import { marketDispatchWorkpool } from '../../marketDispatchWorkpool'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { parsePublishedToolSnapshot } from '@/modules/capability-supply/public'
import {
  callAuthorityValue,
  callResultValue,
  usageValue,
} from '@/modules/capability-execution/convex'
import { recordMarketEvidenceFact } from '../../marketEvidence'
import { materializePurchaseResolutionRecord } from './purchaseResolutionMaterialize'
import {
  assertCallResultJson,
  canonicalCommandReadbackMatches,
  cancellationIdentityMatches,
  commandMatchesDispatch,
  persistedDispatchMatches,
  purchaseIdentityMatches,
  type CancellationArgs,
  type DispatchResult,
  type OpenDispatchValue,
} from './callIdentity'
export type { DispatchResult, OpenDispatchValue } from './callIdentity'
export {
  SELLER_CANARY_ROUTE_SIGNING_UNAVAILABLE_NEXT_ACTION,
  enqueueKnownUnpaidSellerCanaryRearm,
  enqueueRecoveredSellerCanaryReplay,
  enqueueSafeBeforeReleaseSellerCanaryResume,
  knownUnpaidSellerCanaryRefusal,
  safeBeforeReleaseSellerCanaryRefusal,
} from './dispatchSellerCanary'
export type { SafeBeforeReleaseSellerCanaryProof } from './dispatchSellerCanary'

export const OPERATION_INVOKE_RETRY_AFTER_MS = 1_000

type CallRow = Doc<'capabilityCalls'>
type PersistedOperationAuthority = Infer<typeof callAuthorityValue>
type DispatchCommand = ObjectType<typeof actionExecutionTransactArgs>
type CallResultValue = Infer<typeof callResultValue>
type Usage = Infer<typeof usageValue>

export type CallDispatchProjectionShape = Readonly<{
  state: 'completed' | 'refused' | 'reconciliation_required'
  result?: CallResultValue
  usage?: Usage
  evidenceHash?: string
  attemptRef?: string
  dispatchState: 'completed' | 'failed' | 'reconciliation_required'
}>

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

export type RefuseUnclaimedArgs = ObjectType<typeof refuseUnclaimedArgs>
export type RefuseUnclaimedResult = Infer<typeof refuseUnclaimedResult>
export type ReadPreClaimRefundArgs = ObjectType<typeof readPreClaimRefundArgs>

export type CallDispatchMutationResult =
  | { kind: 'applied' | 'duplicate'; attemptRef: string; effectGeneration: number }
  | { kind: 'claimed' }
  | { kind: 'cancelled'; workId?: string }
  | { kind: 'reconciliation_required'; attemptRef: string; effectGeneration: number }
  | { kind: 'refused'; code: string }


export async function enqueueCallDispatch(
  ctx: MutationCtx,
  row: CallRow,
  authority: PersistedOperationAuthority,
  now: number,
): Promise<DispatchResult> {
  if (row.state !== 'pending') return { kind: 'refused' as const }
  if (row.workId !== undefined) {
    if (
      row.authority === undefined
      || canonicalDigest(row.authority as never) !== canonicalDigest(authority as never)
    ) return { kind: 'refused' as const }
    return { kind: 'replayed' as const, workId: row.workId }
  }
  if (
    row.authority !== undefined
    && canonicalDigest(row.authority as never) !== canonicalDigest(authority as never)
  ) return { kind: 'refused' as const }
  const workId = await marketDispatchWorkpool.enqueueAction(
    ctx,
    internal.capabilityCallWorker.run,
    { callRef: row.callRef },
    {
      retry: true,
      onComplete: internal.capabilityCalls.completeWork,
      context: { callRef: row.callRef },
    },
  )
  await ctx.db.patch(row._id, {
    workId,
    authority,
    dispatchState: 'enqueued',
    result: {
      kind: 'pending',
      callRef: row.callRef,
      toolRef: row.toolRef,
      retryAfterMs: OPERATION_INVOKE_RETRY_AFTER_MS,
    },
    updatedAt: now,
  })
  return { kind: 'enqueued' as const, workId }
}

export async function dispatchHandler(
  ctx: MutationCtx,
  args: {
    callRef: string
    principalId: string
    credentialId: string
    toolRef: string
    authority?: PersistedOperationAuthority
    now: number
  },
): Promise<DispatchResult> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef)).unique()
  if (
    row === null
    || row.principalId !== args.principalId
    || row.credentialId !== args.credentialId
    || row.toolRef !== args.toolRef
    || row.toolJson === undefined
    || row.inputJson === undefined
  ) return { kind: 'refused' as const }
  if (args.authority === undefined) return { kind: 'refused' as const }
  return await enqueueCallDispatch(ctx, row, args.authority, args.now)
}

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

async function recordFinalizationEvidence(
  ctx: MutationCtx,
  row: CallRow,
  state: CallDispatchProjectionShape['state'],
): Promise<void> {
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

function callProjectionOperation(row: CallRow) {
  if (row.toolJson === undefined) return undefined
  return parsePublishedToolSnapshot(row.toolJson)
}

function accountReceiptFromProjection(projection: CallDispatchProjectionShape) {
  const result = projection.result
  const receipt = result !== undefined && 'receipt' in result ? result.receipt : undefined
  return {
    receipt,
    accountReceipt: receipt?.commercialModel === 'account_aud' ? receipt : undefined,
  }
}

function projectedAudAmountUnits(
  projection: CallDispatchProjectionShape,
  accountReceipt: ReturnType<typeof accountReceiptFromProjection>['accountReceipt'],
): string | undefined {
  if (accountReceipt?.buyerCharge.currency === 'AUD' && accountReceipt.buyerCharge.exponent === 6) {
    return accountReceipt.buyerCharge.units
  }
  const amount = projection.usage?.amount
  return amount?.currency === 'AUD' && amount.exponent === 6 ? amount.units : undefined
}

function projectedPaymentState(
  accountReceipt: ReturnType<typeof accountReceiptFromProjection>['accountReceipt'],
): 'settled' | 'released' | 'unknown' | 'not_applicable' {
  if (accountReceipt?.state === 'settled') return 'settled'
  if (accountReceipt?.state === 'refunded') return 'released'
  if (accountReceipt?.state === 'reconciliation_required') return 'unknown'
  return 'not_applicable'
}

function projectedDeliveryState(
  state: CallDispatchProjectionShape['state'],
): 'delivered' | 'not_delivered' | 'unknown' {
  if (state === 'completed') return 'delivered'
  return state === 'reconciliation_required' ? 'unknown' : 'not_delivered'
}

async function providerObligationProjectionFields(
  ctx: MutationCtx,
  callRef: string,
) {
  const obligation = await ctx.db.query('moneyProviderObligations')
    .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
    .unique()
  return obligation === null
    ? {}
    : {
        providerObligationState: obligation.state,
        providerAmountUnits: obligation.providerAmountUnits,
      }
}

export async function upsertCallProjection(
  ctx: MutationCtx,
  row: CallRow,
  projection: CallDispatchProjectionShape,
  now: number,
): Promise<void> {
  if (row.sellerOnboardingCanary !== undefined) return
  const operation = callProjectionOperation(row)
  if (operation === undefined) throw new Error('call_projection_operation_invalid')
  const { receipt, accountReceipt } = accountReceiptFromProjection(projection)
  const audAmountUnits = projectedAudAmountUnits(projection, accountReceipt)
  const callState = projection.state === 'reconciliation_required'
    ? 'outcome_unknown' as const
    : projection.state
  const providerFields = await providerObligationProjectionFields(ctx, row.callRef)
  const fields = {
    accountRef: row.ownerId,
    principalRef: row.principalId,
    credentialRef: row.credentialId,
    applicationRef: row.applicationRef,
    toolRef: row.toolRef,
    providerRef: operation.identity.businessId,
    toolLabel: operation.contract.name,
    state: callState,
    deliveryState: projectedDeliveryState(projection.state),
    paymentState: projectedPaymentState(accountReceipt),
    ...providerFields,
    ...(audAmountUnits === undefined ? {} : { audAmountUnits }),
    ...(receipt?.receiptRef === undefined ? {} : { receiptRef: receipt.receiptRef }),
    ...(projection.state === 'reconciliation_required' ? { recoveryRef: row.callRef } : {}),
    latencyMs: Math.max(0, now - row.createdAt),
    updatedAt: now,
  }
  const existing = await ctx.db.query('capabilityCallProjections')
    .withIndex('by_callRef', (query) => query.eq('callRef', row.callRef))
    .unique()
  const next = {
    callRef: row.callRef,
    ...fields,
    createdAt: row.createdAt,
  }
  if (existing === null) {
    await ctx.db.insert('capabilityCallProjections', next)
  } else {
    await ctx.db.patch(existing._id, { ...fields,
      recoveryRef: projection.state === 'reconciliation_required' ? row.callRef : undefined,
    })
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
  await recordFinalizationEvidence(ctx, row, normalizedProjection.state)
  // Commit recovery scheduling with the stopped Call. Closing the browser cannot
  // abandon this job; it reads the original nonce and never sends a new payment.
  if (normalizedProjection.state === 'reconciliation_required' && row.sellerOnboardingCanary === undefined) {
    const payment = await ctx.db.query('moneyX402PaymentAttempts')
      .withIndex('by_attemptRef_and_effectGeneration', q => q.eq('attemptRef', attempt.attemptRef)
        .eq('effectGeneration', attempt.effectGeneration)).unique()
    if (payment?.paymentAuthorizationExpiresAt !== undefined && payment.settlementStatus === 'unknown'
      && payment.paymentResponseDigest === undefined) {
      await ctx.scheduler.runAt(Math.max(finalizedAt, payment.paymentAuthorizationExpiresAt + 30_000),
        internal.moneyX402ExpiryActions.recover, { callRef: row.callRef })
    }
  }
  return {
    kind: canonicalResult.kind,
    attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration,
  }
}

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

function financialStateHasReleaseUncertainty(row: CallRow): boolean {
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

function isBuyerFormanceReservation(row: CallRow): boolean {
  return row.formanceFinancialState === 'reserved'
}

function refundReconciliation(
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

function cancelledResult(workId?: string): CallDispatchMutationResult {
  return workId === undefined ? { kind: 'cancelled' } : { kind: 'cancelled', workId }
}

async function patchCancelledInvocation(
  ctx: MutationCtx,
  row: CallRow,
  refundBeforeClaim = false,
): Promise<void> {
  const now = Date.now()
  const hasRefundSchedule = row.reconciliation?.reason === 'refund_pending'
  const shouldScheduleRefund = refundBeforeClaim && isBuyerFormanceReservation(row) && !hasRefundSchedule
  await ctx.db.patch(row._id, {
    state: 'cancelled',
    result: {
      kind: 'refused',
      toolRef: row.toolRef,
      code: 'invocation_cancelled',
      retryable: false,
    },
    workId: undefined,
    attemptRef: undefined,
    dispatchState: 'failed',
    ...(shouldScheduleRefund ? { reconciliation: refundReconciliation(now) } : {}),
    updatedAt: now,
  })
  if (shouldScheduleRefund) {
    await ctx.scheduler.runAfter(0, internal.capabilityCallWorker.reconcilePreClaimRefund, {
      callRef: row.callRef,
    })
  }
}

function cancellationNeedsReconciliation(
  canonical: Doc<'actionExecutionControls'>['control']['control'],
  attemptRef: string | undefined,
): boolean {
  if (attemptRef === undefined) return true
  if (canonical.state === 'reconciliation_required') return true
  return canonical.state === 'leased' && canonical.release === 'possibly_released'
}

async function patchCancellationReconciliation(
  ctx: MutationCtx,
  row: CallRow,
  attemptRef: string,
  effectGeneration: number,
): Promise<void> {
  if (row.state !== 'pending') return
  await ctx.db.patch(row._id, {
    state: 'reconciliation_required',
    dispatchState: 'reconciliation_required',
    result: {
      kind: 'reconciliation_required',
      callRef: row.callRef,
      toolRef: row.toolRef,
      evidence: {
        attemptRef,
        effectGeneration,
        requiredAt: new Date(Date.now() + 1_000).toISOString(),
        retry: 'reconcile_before_retry',
        evidenceSource: `operation:${row.toolRef}`,
      },
    },
    attemptRef,
    updatedAt: Date.now(),
  })
}

async function markCancellationClaimed(
  ctx: MutationCtx,
  row: CallRow,
  attemptRef: string | undefined,
): Promise<void> {
  if (row.state !== 'pending' || attemptRef === undefined) return
  await ctx.db.patch(row._id, {
    dispatchState: 'running',
    attemptRef,
    updatedAt: Date.now(),
  })
}

export async function cancelBeforeClaimHandler(
  ctx: MutationCtx,
  args: CancellationArgs,
): Promise<CallDispatchMutationResult> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
    .unique()
  if (!cancellationIdentityMatches(row, args)) return { kind: 'refused', code: 'invocation_not_found' }
  if (row.state === 'cancelled') return cancelledResult(row.workId)
  const control = await ctx.db.query('actionExecutionControls')
    .withIndex('by_executionRef', (query) => query.eq('executionRef', args.callRef))
    .unique()
  if (control === null && row.state === 'pending') {
    const attempts = await ctx.db.query('actionExecutionAttempts')
      .withIndex('by_executionRef_and_attemptNumber', (query) => query.eq('executionRef', args.callRef))
      .take(1)
    if (row.attemptRef !== undefined || attempts.length > 0 || financialStateHasReleaseUncertainty(row)) {
      return { kind: 'refused', code: 'invocation_state_refused' }
    }
    const workId = row.workId
    await patchCancelledInvocation(ctx, row, true)
    return cancelledResult(workId)
  }
  if (control === null) return { kind: 'refused', code: 'invocation_state_refused' }
  const canonical = control.control.control
  const attemptRef = control.currentAttemptRef
  const effectGeneration = control.currentEffectGeneration ?? 1
  if (canonical.state === 'cancelled') {
    await patchCancelledInvocation(ctx, row)
    return { kind: 'cancelled' }
  }
  if (cancellationNeedsReconciliation(canonical, attemptRef)) {
    const reconciliationAttemptRef = attemptRef ?? `operation-attempt:${row.callRef}:1`
    await patchCancellationReconciliation(ctx, row, reconciliationAttemptRef, effectGeneration)
    return {
      kind: 'reconciliation_required',
      attemptRef: reconciliationAttemptRef,
      effectGeneration,
    }
  }
  await markCancellationClaimed(ctx, row, attemptRef)
  return { kind: 'claimed' }
}

export async function openDispatchHandler(
  ctx: QueryCtx,
  args: { callRef: string },
): Promise<OpenDispatchValue | null> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef)).unique()
  if (
    row === null
    || row.toolJson === undefined
    || row.inputJson === undefined
  ) return null
  const rowQuoteRef = row.quoteRef
  const quote = rowQuoteRef === undefined ? null : await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', (query) => query.eq('quoteRef', rowQuoteRef)).unique()
  if (quote !== null && (quote.accountRef !== row.ownerId || quote.principalId !== row.principalId || quote.toolRef !== row.toolRef)) return null
  return {
    ...(quote?.x402PaymentRequiredJson === undefined ? {} : { committedPaymentRequiredJson: quote.x402PaymentRequiredJson }),
    ...(quote?.sourceUsdcUnits === undefined ? {} : { sourceUsdcUnits: quote.sourceUsdcUnits }),
    ...(row.quoteRef === undefined ? {} : { quoteRef: row.quoteRef }),
    callRef: row.callRef,
    principalId: row.principalId,
    ownerId: row.ownerId,
    credentialId: row.credentialId,
    applicationRef: row.applicationRef,
    environment: row.environment,
    state: row.state,
    toolRef: row.toolRef,
    ...(row.sellerOnboardingCanary === undefined
      ? {}
      : { sellerOnboardingCanary: structuredClone(row.sellerOnboardingCanary) }),
    idempotencyKey: row.idempotencyKey,
    inputDigest: row.inputDigest,
    requestDigest: row.requestDigest,
    grantRef: row.grantRef,
    grantGeneration: row.grantGeneration,
    policyDigest: row.policyDigest,
    grantExpiresAt: row.grantExpiresAt,
    toolJson: row.toolJson,
    inputJson: row.inputJson,
    ...(row.authority === undefined ? {} : { authority: structuredClone(row.authority) }),
    ...(row.workId === undefined ? {} : { workId: row.workId }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
    ...(row.dispatchState === undefined ? {} : { dispatchState: row.dispatchState }),
  }
}