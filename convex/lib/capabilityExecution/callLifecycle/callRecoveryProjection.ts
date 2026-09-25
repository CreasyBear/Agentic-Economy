import type { Infer } from 'convex/values'
import { materializePurchaseResolutionRecord } from './purchaseResolutionMaterialize'
import { upsertCallProjection } from './dispatchProjection'
import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { recordMarketEvidenceFact } from '../../../marketEvidence'
import { isBoundedJsonValue, type JsonValue } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { callResultValue, usageValue } from '@/modules/capability-execution/convex'
import { assertCallResultJson } from './callIdentity'

type CallRow = Doc<'capabilityCalls'>
type CallResultValue = Infer<typeof callResultValue>
type Usage = Infer<typeof usageValue>
type DispatchState = 'enqueued' | 'running' | 'completed' | 'failed' | 'reconciliation_required'

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
  if (
    row.state !== 'pending'
    && args.state !== row.state
  ) return { kind: 'recorded' as const }
  await ctx.db.patch(row._id, recordPatch(args))
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
  const attemptRef = args.attemptRef
  if (row.state === 'reconciliation_required' && args.state === 'completed'
    && args.result?.kind === 'completed' && row.formanceFinancialState === 'settled'
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
      || !retainedOutputMatches(attempt.quarantinedOutputJson, args.result.output)
      || attempt.quarantinedResponseDigest !== args.result.evidenceHash
      || args.result.receipt?.state !== 'settled') return { kind: 'recorded' as const }
    const settlementRef = row.formanceSettlementRefs[0]
    if (settlementRef === undefined || args.result.callRef !== row.callRef
      || args.result.toolRef !== row.toolRef) return { kind: 'recorded' as const }
    const result = { ...args.result, receipt: { ...args.result.receipt,
      accountingTransactionRefs: [...row.formanceSettlementRefs],
      transactionRef: settlementRef,
    } }
    const usage = recoveredPaidUsage(row, result.receipt)
    if (usage === undefined) return { kind: 'recorded' as const }
    const completed = { ...result, usage }
    await ctx.db.patch(row._id, { ...recoveryProjectionPatch(row, args), result: completed, usage,
      evidenceHash: result.evidenceHash, reconciliation: undefined })
    await materializePurchaseResolutionRecord(ctx, row, {
      state: 'completed', dispatchState: 'completed', result: completed, usage,
    }, args.now)
    await upsertCallProjection(ctx, row, {
      state: 'completed', dispatchState: 'completed', result: completed, usage,
    }, args.now)
    await recordRecoveredCompletion(ctx, row, args.now)
    return { kind: 'recorded' as const }
  }
  if (!recoveryProjectionTransitionAllowed(row, args)) return { kind: 'recorded' as const }
  await ctx.db.patch(row._id, recoveryProjectionPatch(row, args))
  return { kind: 'recorded' as const }
}

/** Same Call identity and original completion time make repair/replay non-inflating. */
async function recordRecoveredCompletion(ctx: MutationCtx, row: CallRow, completedAt: number): Promise<void> {
  await recordMarketEvidenceFact(ctx, 'ae_invocation_completed', row.callRef, completedAt, {
    toolRef: row.toolRef,
    durationMs: Math.max(0, completedAt - row.createdAt),
  })
}
