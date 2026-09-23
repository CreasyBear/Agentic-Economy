import { v } from 'convex/values'
import { internalMutation } from './_generated/server'
import { materializePurchaseResolutionRecord } from './lib/callLifecycle/purchaseResolutionMaterialize'
import { upsertCallProjection } from './lib/callLifecycle/dispatch'
import { createPublicToolRef, materializeRuntimePublishedTool, parsePublishedToolSnapshot } from '@/modules/capability-supply/public'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import type { Doc } from './_generated/dataModel'

const identity = { callRef: v.string(), transactionHash: v.string(), failureKind: v.optional(v.literal('invalid_output')) }
const remedyOwner = (transactionHash: string, failureKind?: 'invalid_output') =>
  `paid-result-loss:${failureKind === 'invalid_output' ? 'invalid-output:' : ''}${transactionHash.toLowerCase()}`

function responseEligibleForRemedy(call: Doc<'capabilityCalls'>, attempt: Doc<'moneyX402PaymentAttempts'>,
  failureKind: 'invalid_output' | undefined): boolean {
  if (failureKind === undefined) return attempt.transportObservationDigest === undefined
    && attempt.quarantinedOutputJson === undefined
  if (attempt.quarantinedOutputJson === undefined || attempt.quarantinedResponseDigest === undefined
    || attempt.settlementStatus === 'not_settled' || call.toolJson === undefined) return false
  try {
    const tool = parsePublishedToolSnapshot(call.toolJson)
    if (tool === undefined || createPublicToolRef({
      operationId: tool.operationId,
      publicationRef: tool.identity.publicationRef,
      publicationRevision: tool.identity.publicationRevision,
      contractRef: tool.contract.ref,
    }) !== call.toolRef) return false
    const descriptor = materializeRuntimePublishedTool(tool)
    const output: unknown = JSON.parse(attempt.quarantinedOutputJson)
    // Only a definite contract failure is remedied here; corrupt metadata is not proof of failed delivery.
    return isBoundedJsonValue(output) && !descriptor.validateOutput(output)
  } catch { return false }
}

/**
 * Requires a stopped managed Call with a still-held buyer reservation and an
 * exact submitted attempt. Lost-result recovery requires no retained result;
 * invalid-output recovery requires retained bytes that fail the original Tool.
 * Pins one transaction identity across crashes/retries. It does not itself
 * assert settlement, charge the buyer, or call the Provider.
 */
export const claim = internalMutation({
  args: identity,
  handler: async (ctx, args) => {
    if (!/^0x[0-9a-fA-F]{64}$/.test(args.transactionHash)) return null
    const call = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', q => q.eq('callRef', args.callRef)).unique()
    if (call === null) return null
    if (call.state === 'refused' && call.result?.kind === 'refused'
      && call.result.code === (args.failureKind === 'invalid_output' ? 'provider_output_invalid' : 'result_invalid')
      && call.result.receipt?.refundState === 'released'
      && call.result.receipt.externalSettlementRef === args.transactionHash.toLowerCase()) {
      return { kind: 'completed' as const }
    }
    if (call.state !== 'reconciliation_required'
      || call.formanceFinancialState !== 'outcome_unknown'
      || call.sellerOnboardingCanary !== undefined
      || call.result?.kind !== 'reconciliation_required'
      || call.result.receipt?.commercialModel !== 'account_aud') return null
    const { attemptRef, effectGeneration } = call.result.evidence
    const attempt = await ctx.db.query('moneyX402PaymentAttempts')
      .withIndex('by_attemptRef_and_effectGeneration', q => q
        .eq('attemptRef', attemptRef).eq('effectGeneration', effectGeneration)).unique()
    if (attempt === null || attempt.dispatchRef !== call.callRef
      || attempt.toolRef !== call.toolRef || attempt.inputDigest !== call.inputDigest
      || attempt.reservationRef === undefined
      || !call.formanceReservationRefs?.includes(attempt.reservationRef)
      || attempt.submissionStartedAt === undefined
      || attempt.paymentPayer === undefined || attempt.paymentNonce === undefined
      || !responseEligibleForRemedy(call, attempt, args.failureKind)) return null
    const now = Date.now()
    const lease = call.reconciliation
    const owner = remedyOwner(args.transactionHash, args.failureKind)
    if (lease?.leaseOwner !== undefined && lease.leaseOwner !== owner
      && !(args.failureKind === 'invalid_output' && lease.leaseOwner.startsWith('paid-response:'))
      && (lease.leaseExpiresAt ?? 0) > now) return null
    await ctx.db.patch(call._id, { reconciliation: {
      disposition: 'manual_review', reason: 'refund_pending',
      attemptCount: lease?.attemptCount ?? 0, nextAttemptAt: now,
      leaseOwner: owner, leaseExpiresAt: Number.MAX_SAFE_INTEGER,
    } })
    return { kind: 'claimed' as const, call, attempt }
  },
})

export const finish = internalMutation({
  args: { ...identity, evidenceDigest: v.string(), transactionRefs: v.array(v.string()) },
  handler: async (ctx, args) => {
    if (!/^sha256:[a-f0-9]{64}$/.test(args.evidenceDigest)) return { kind: 'refused' as const }
    const call = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', q => q.eq('callRef', args.callRef)).unique()
    if (call?.state === 'refused' && call.result?.kind === 'refused'
      && call.result.receipt?.evidenceHash === args.evidenceDigest
      && call.result.receipt.externalSettlementRef === args.transactionHash.toLowerCase()
      && JSON.stringify(call.result.receipt.accountingTransactionRefs) === JSON.stringify(args.transactionRefs)) {
      await upsertCallProjection(ctx, call, {
        state: 'refused', dispatchState: 'failed', result: call.result,
      }, call.updatedAt)
      return { kind: 'completed' as const }
    }
    if (call === null || call.state !== 'reconciliation_required'
      || call.formanceFinancialState !== 'outcome_unknown'
      || call.reconciliation?.leaseOwner !== remedyOwner(args.transactionHash, args.failureKind)
      || call.result?.kind !== 'reconciliation_required'
      || call.result.receipt?.commercialModel !== 'account_aud'
      || args.transactionRefs.length !== 2) return { kind: 'refused' as const }
    const [buyerRef, providerRef] = args.transactionRefs
    if (buyerRef === undefined || providerRef === undefined) return { kind: 'refused' as const }
    const { attemptRef, effectGeneration } = call.result.evidence
    const attempt = await ctx.db.query('moneyX402PaymentAttempts')
      .withIndex('by_attemptRef_and_effectGeneration', q => q
        .eq('attemptRef', attemptRef).eq('effectGeneration', effectGeneration)).unique()
    const obligation = await ctx.db.query('moneyProviderObligations')
      .withIndex('by_callRef', q => q.eq('callRef', call.callRef)).unique()
    if (attempt === null || obligation === null
      || attempt.dispatchRef !== call.callRef
      || !responseEligibleForRemedy(call, attempt, args.failureKind)) return { kind: 'refused' as const }
    const now = Date.now()
    const result = {
      kind: 'refused' as const, toolRef: call.toolRef,
      code: args.failureKind === 'invalid_output' ? 'provider_output_invalid' as const : 'result_invalid' as const,
      retryable: false,
      nextAction: args.failureKind === 'invalid_output'
        ? 'The service returned a result that did not match its contract. Your credit has been restored. Choose another Tool or start a new request.'
        : 'AE could not recover the service response. Your credit has been restored. Start a new request from the Tool page.',
      receipt: {
        ...call.result.receipt, state: 'refunded' as const, refundState: 'released' as const,
        lossState: 'unknown' as const, evidenceHash: args.evidenceDigest,
        issuedAt: new Date(now).toISOString(), externalSettlementRef: args.transactionHash.toLowerCase(),
        accountingTransactionRefs: [...args.transactionRefs], transactionRef: buyerRef,
        providerSettlement: { ...call.result.receipt.providerSettlement,
          transactionHash: args.transactionHash.toLowerCase(), paymentIdentifier: attempt.paymentIdentifier },
      },
    }
    await ctx.db.patch(attempt._id, {
      state: 'observed', settlementStatus: 'settled',
      reconciliationEvidenceRef: `chain:${attempt.network}:${args.transactionHash.toLowerCase()}`,
      reconciliationEvidenceDigest: args.evidenceDigest,
    })
    await ctx.db.patch(obligation._id, {
      state: 'settled', settlementTransactionRef: providerRef, settledAt: now, updatedAt: now,
      evidenceRefs: [...new Set([...obligation.evidenceRefs, ...args.transactionRefs, args.evidenceDigest])].slice(-32),
    })
    await ctx.db.patch(call._id, {
      state: 'refused', dispatchState: 'failed', result, evidenceHash: args.evidenceDigest,
      formanceFinancialState: 'released', formanceReleaseRefs: [buyerRef],
      formanceSettlementRefs: [providerRef], reconciliation: undefined, updatedAt: now,
    })
    await materializePurchaseResolutionRecord(ctx, call, {
      state: 'refused', dispatchState: 'failed', result,
    }, now)
    await upsertCallProjection(ctx, call, {
      state: 'refused', dispatchState: 'failed', result,
    }, now)
    return { kind: 'completed' as const }
  },
})
