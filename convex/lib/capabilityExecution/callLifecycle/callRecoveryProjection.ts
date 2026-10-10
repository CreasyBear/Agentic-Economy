import type { Infer } from 'convex/values'
import { materializePurchaseResolutionRecord } from './purchaseResolutionMaterialize'
import { upsertCallProjection } from './dispatchProjection'
import { internal } from '../../../_generated/api'
import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import { recordCallTerminal } from '@/lib/observability/journey'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { recordInvocationRefused, recordMarketEvidenceFact } from '../../../marketEvidence'
import { isBoundedJsonValue, type JsonValue } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { callResultValue, usageValue, parseContractOutput } from '@/modules/capability-execution/convex'
import { materializeRuntimePublishedTool, parsePublishedToolSnapshot } from '@/modules/capability-supply/public'
import { assertCallResultJson } from './callIdentity'

type CallRow = Doc<'capabilityCalls'>
type CallResultValue = Infer<typeof callResultValue>
type Usage = Infer<typeof usageValue>
type DispatchState = 'enqueued' | 'running' | 'completed' | 'failed' | 'reconciliation_required'

function requiresManualSettlementReview(row: CallRow): boolean {
  return row.state === 'reconciliation_required'
    && row.reconciliation?.disposition === 'manual_review'
    && row.reconciliation.reason === 'unknown_settlement'
}

export async function recordHandler(
  ctx: MutationCtx,
  args: {
    callRef: string
    principalId: string
    state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
    result?: CallResultValue
    usage?: Usage
    evidenceHash?: string
    attemptRef?: string
    dispatchState?: DispatchState
    now: number
  },
): Promise<{ kind: 'recorded' }> {
  if (args.result !== undefined) assertCallResultJson(args.result)
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef)).unique()
  if (row === null || row.principalId !== args.principalId) throw new Error('operation_invoke_identity_refused')
  if (row.contentExpiredAt !== undefined) return { kind: 'recorded' as const }
  if (requiresManualSettlementReview(row)) throw new Error('call_manual_settlement_review_required')
  if (
    row.state !== 'pending'
    && args.state !== row.state
  ) return { kind: 'recorded' as const }
  recordCallTerminal(row.state, args.state)
  await ctx.db.patch(row._id, recordPatch(args))
  if (args.state === 'pending' && args.result?.kind === 'needs_authority') {
    try {
      await ctx.runMutation(internal.notifications.enqueueAgentApprovalRequested, { callRef: args.callRef })
    } catch (cause) {
      degradeBackend(cause, undefined, { site: 'enqueueAgentApprovalRequested', reason: 'source_unavailable' })
    }
  }
  return { kind: 'recorded' as const }
}

type RecordArgs = Parameters<typeof recordHandler>[1]

function recordPatch(args: RecordArgs): Partial<CallRow> {
  return {
    state: args.state,
    ...(args.result === undefined ? {} : { result: args.result }),
    ...(args.usage === undefined ? {} : { usage: args.usage }),
    ...(args.evidenceHash === undefined ? {} : { evidenceHash: args.evidenceHash }),
    ...(args.attemptRef === undefined ? {} : { attemptRef: args.attemptRef }),
    ...(args.dispatchState === undefined ? {} : { dispatchState: args.dispatchState }),
    updatedAt: args.now,
  }
}

type ProjectRecoveryArgs = Parameters<typeof projectRecoveryHandler>[1]

function recoveryProjectionIdentityMatches(row: CallRow | null, args: ProjectRecoveryArgs): row is CallRow {
  // The stored credential is effect evidence, never the projection gate: a
  // replaced credential must still project onto the original Call.
  return row !== null && row.principalId === args.principalId
}

function isCompletedProjection(row: CallRow): boolean {
  return row.state === 'completed' && row.result?.kind === 'completed'
}

function resetsPendingRecovery(row: CallRow, args: ProjectRecoveryArgs): boolean {
  return [
    row.state === 'reconciliation_required',
    args.state === 'pending',
    args.clearResult,
    args.clearWorkId,
    args.clearAttemptRef,
    args.clearEvidenceHash,
    args.clearDispatchState,
  ].every(Boolean)
}

function recoveryProjectionTransitionAllowed(row: CallRow, args: ProjectRecoveryArgs): boolean {
  return row.state === 'pending'
    || args.state === row.state
    || resetsPendingRecovery(row, args)
}

function retainedOutputMatches(outputJson: string | undefined, output: JsonValue): boolean {
  if (outputJson === undefined) return false
  try {
    const retained: unknown = JSON.parse(outputJson)
    return isBoundedJsonValue(retained) && canonicalDigest(retained) === canonicalDigest(output)
  } catch (cause) {
    return degradeBackend(cause, false, { site: 'retainedOutputMatches', reason: 'invalid_response' })
  }
}

function recoveredPaidUsage(row: CallRow, receipt: NonNullable<Extract<CallResultValue, { kind: 'completed' }>['receipt']>): Usage | undefined {
  if (receipt.commercialModel !== 'account_aud' || receipt.state !== 'settled'
    || row.formanceFinancialState !== 'settled' || row.attemptRef === undefined) return undefined
  return { usageRef: `operation-usage:${row.callRef}:${row.attemptRef}`,
    observedAt: Date.parse(receipt.issuedAt), chargeState: 'paid',
    amount: receipt.totalBuyerCharge, priceDigest: receipt.priceDigest,
    ...(receipt.transactionRef === undefined ? {} : { transactionRef: receipt.transactionRef }) }
}

type CallPatch = {
  [Property in keyof CallRow]?: undefined extends CallRow[Property]
    ? CallRow[Property] | undefined
    : CallRow[Property]
}

function recoveryProjectionPatch(row: CallRow, args: ProjectRecoveryArgs): CallPatch {
  return {
    state: args.state,
    ...(args.clearResult ? { result: undefined } : args.result === undefined ? {} : { result: args.result }),
    ...(args.clearWorkId ? { workId: undefined } : {}),
    ...(args.clearAttemptRef ? { attemptRef: undefined } : args.attemptRef === undefined ? {} : { attemptRef: args.attemptRef }),
    ...(args.clearEvidenceHash ? { evidenceHash: undefined } : {}),
    ...(args.clearDispatchState ? { dispatchState: undefined } : args.dispatchState === undefined ? {} : { dispatchState: args.dispatchState }),
    ...(resetsPendingRecovery(row, args) ? { reconciliation: undefined } : {}),
    updatedAt: args.now,
  }
}

export async function projectRecoveryHandler(
  ctx: MutationCtx,
  args: {
    callRef: string
    principalId: string
    state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
    result?: CallResultValue
    attemptRef?: string
    dispatchState?: DispatchState
    clearResult: boolean
    clearWorkId: boolean
    clearAttemptRef: boolean
    clearEvidenceHash: boolean
    clearDispatchState: boolean
    now: number
  },
): Promise<{ kind: 'recorded' }> {
  if (args.result !== undefined) assertCallResultJson(args.result)
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef)).unique()
  if (!recoveryProjectionIdentityMatches(row, args)) {
    throw new Error('operation_invoke_identity_refused')
  }
  if (row.contentExpiredAt !== undefined) return { kind: 'recorded' as const }
  if (isCompletedProjection(row)) {
    // Repair an interrupted result projection without changing its output or
    // applying any financial effect. Completed HTTP results require usage.
    if (row.result?.kind === 'completed') {
      let result = row.result
      const recordedReceipt = result.receipt
      const settlementRef = row.formanceSettlementRefs?.[0]
      if (recordedReceipt?.commercialModel === 'account_aud' && recordedReceipt.state === 'settled'
        && row.formanceFinancialState === 'settled' && settlementRef !== undefined) {
        const receipt = { ...recordedReceipt, transactionRef: settlementRef,
          accountingTransactionRefs: [...(row.formanceSettlementRefs ?? [])] }
        const usage = recoveredPaidUsage(row, receipt)
        if (usage) {
          result = { ...result, receipt, usage }
          await ctx.db.patch(row._id, { usage, result })
        }
      } else if (result.usage === undefined && recordedReceipt) {
        const usage = recoveredPaidUsage(row, recordedReceipt)
        if (usage) { result = { ...result, usage }; await ctx.db.patch(row._id, { usage, result }) }
      }
      await upsertCallProjection(ctx, row, {
        state: 'completed', dispatchState: 'completed', result,
      }, row.updatedAt)
      await recordRecoveredCompletion(ctx, row, row.updatedAt)
    }
    return { kind: 'recorded' as const }
  }
  if (row.state === 'refused' && row.result?.kind === 'refused'
    && row.result.code === 'provider_output_invalid' && row.result.receipt?.state === 'settled'
    && row.formanceFinancialState === 'settled') {
    // A terminal paid delivery fact is immutable on retry, including its
    // accounting references; caller-supplied receipts cannot overwrite it.
    await upsertCallProjection(ctx, row, {
      state: 'refused', dispatchState: 'failed', result: row.result,
      ...(row.usage === undefined ? {} : { usage: row.usage }),
    }, row.updatedAt)
    return { kind: 'recorded' as const }
  }
  const attemptRef = args.attemptRef
  const paidResult = args.state === 'completed' && args.result?.kind === 'completed'
    ? args.result
    : args.state === 'refused' && args.result?.kind === 'refused'
      && args.result.code === 'provider_output_invalid' ? args.result : undefined
  if (row.state === 'reconciliation_required' && paidResult !== undefined
    && row.formanceFinancialState === 'settled'
    && row.formanceSettlementRefs?.length && attemptRef !== undefined
    && attemptRef === row.attemptRef) {
    const attempt = await ctx.db.query('moneyX402PaymentAttempts')
      .withIndex('by_attemptRef_and_effectGeneration', q => q
        .eq('attemptRef', attemptRef)
        .eq('effectGeneration', row.result?.kind === 'reconciliation_required'
          ? row.result.evidence.effectGeneration : -1)).unique()
    if (attempt?.dispatchRef !== row.callRef || attempt.toolRef !== row.toolRef
      || attempt.inputDigest !== row.inputDigest || attempt.settlementStatus !== 'settled'
      || attempt.reconciliationEvidenceDigest === undefined
      || attempt.responseStatus === undefined || !Number.isInteger(attempt.responseStatus)
      || attempt.responseStatus < 200 || attempt.responseStatus >= 300
      || paidResult.receipt?.state !== 'settled') return { kind: 'recorded' as const }
    const evidenceHash = attempt.quarantinedResponseDigest ?? attempt.transportObservationDigest
    if (evidenceHash === undefined) return { kind: 'recorded' as const }
    if (paidResult.kind === 'completed') {
      if (!('output' in paidResult)
        || !retainedOutputMatches(attempt.quarantinedOutputJson, paidResult.output)
        || attempt.quarantinedResponseDigest !== paidResult.evidenceHash
        || paidResult.callRef !== row.callRef) return { kind: 'recorded' as const }
    } else {
      const tool = parsePublishedToolSnapshot(row.toolJson ?? '')
      if (tool === undefined || paidResult.receipt.evidenceHash !== evidenceHash) return { kind: 'recorded' as const }
      const output = parseContractOutput({ transport: 'x402', disposition: 'succeeded', releaseStarted: true,
        requestDigest: attempt.transportRequestDigest ?? '',
        ...(attempt.quarantinedOutputJson === undefined ? {} : { outputJson: attempt.quarantinedOutputJson }),
      }, materializeRuntimePublishedTool(tool))
      if (output.valid) return { kind: 'recorded' as const }
    }
    const settlementRef = row.formanceSettlementRefs[0]
    if (settlementRef === undefined || paidResult.toolRef !== row.toolRef) return { kind: 'recorded' as const }
    const result = { ...paidResult, receipt: { ...paidResult.receipt,
      accountingTransactionRefs: [...row.formanceSettlementRefs],
      transactionRef: settlementRef,
    } }
    const usage = recoveredPaidUsage(row, result.receipt)
    if (usage === undefined) return { kind: 'recorded' as const }
    const terminalResult = result.kind === 'completed' ? { ...result, usage } : result
    const state = result.kind === 'completed' ? 'completed' as const : 'refused' as const
    const dispatchState = result.kind === 'completed' ? 'completed' as const : 'failed' as const
    await ctx.db.patch(row._id, { ...recoveryProjectionPatch(row, args), result: terminalResult, usage,
      evidenceHash, reconciliation: undefined })
    await materializePurchaseResolutionRecord(ctx, row, {
      state, dispatchState, result: terminalResult, usage,
    }, args.now)
    await upsertCallProjection(ctx, row, {
      state, dispatchState, result: terminalResult, usage,
    }, args.now)
    if (state === 'completed') await recordRecoveredCompletion(ctx, row, args.now)
    if (state === 'refused' && terminalResult?.kind === 'refused') {
      await recordInvocationRefused(ctx, row.callRef, row.toolRef, terminalResult.code, args.now)
    }
    return { kind: 'recorded' as const }
  }
  // Requires the current Call identity, not just a pre-quarantine context.
  // Ensures generic resets and same-state writes retain held original evidence.
  // Invariant: the verified paid-result repair above remains admissible.
  // On violation: abort the mutation; no retry, refund or evidence overwrite.
  if (requiresManualSettlementReview(row)) throw new Error('call_manual_settlement_review_required')
  if (!recoveryProjectionTransitionAllowed(row, args)) return { kind: 'recorded' as const }
  recordCallTerminal(row.state, args.state)
  await ctx.db.patch(row._id, recoveryProjectionPatch(row, args))
  if (args.state === 'refused' && args.result?.kind === 'refused') {
    await recordInvocationRefused(ctx, row.callRef, row.toolRef, args.result.code, args.now)
  }
  return { kind: 'recorded' as const }
}

/** Same Call identity and original completion time make repair/replay non-inflating. */
async function recordRecoveredCompletion(ctx: MutationCtx, row: CallRow, completedAt: number): Promise<void> {
  await recordMarketEvidenceFact(ctx, 'ae_invocation_completed', row.callRef, completedAt, {
    toolRef: row.toolRef,
    durationMs: Math.max(0, completedAt - row.createdAt),
  })
}
