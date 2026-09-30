import { v } from 'convex/values'
import { internalMutation } from './_generated/server'
import { materializePurchaseResolutionRecord } from './lib/capabilityExecution/callLifecycle/purchaseResolutionMaterialize'
import { upsertCallProjection } from './lib/capabilityExecution/callLifecycle/dispatchProjection'
import { createPublicToolRef, parsePublishedToolSnapshot } from '@/modules/capability-supply/public'
import type { Doc } from './_generated/dataModel'
import { capabilityCallTables } from '@/modules/capability-execution/schema'
import { moneyTables } from '@/modules/money/schema'

const identity = { callRef: v.string(), transactionHash: v.string(), failureKind: v.optional(v.literal('http_error')) }
const remedyClaimResult = v.union(
  v.null(),
  v.object({ kind: v.literal('completed') }),
  v.object({
    kind: v.literal('claimed'),
    call: v.object({ ...capabilityCallTables.capabilityCalls.validator.fields, _id: v.id('capabilityCalls'), _creationTime: v.number() }),
    attempt: v.object({ ...moneyTables.moneyX402PaymentAttempts.validator.fields, _id: v.id('moneyX402PaymentAttempts'), _creationTime: v.number() }),
  }),
)
const remedyFinishResult = v.object({ kind: v.union(v.literal('completed'), v.literal('refused')) })
const remedyOwner = (transactionHash: string, failureKind?: 'http_error') =>
  `paid-result-loss:${failureKind === 'http_error' ? 'http-error:' : ''}${transactionHash.toLowerCase()}`

function responseEligibleForRemedy(call: Doc<'capabilityCalls'>, attempt: Doc<'moneyX402PaymentAttempts'>,
  failureKind: 'http_error' | undefined): boolean {
  if (failureKind === undefined) return attempt.transportObservationDigest === undefined
    && attempt.quarantinedOutputJson === undefined && attempt.responseStatus === undefined
  const tool = parsePublishedToolSnapshot(call.toolJson ?? '')
  if (tool === undefined || createPublicToolRef({ operationId: tool.operationId,
    publicationRef: tool.identity.publicationRef, publicationRevision: tool.identity.publicationRevision,
    contractRef: tool.contract.ref }) !== call.toolRef) return false
  return call.formanceFinancialState === 'outcome_unknown'
    && Number.isSafeInteger(attempt.responseStatus)
    && attempt.responseStatus !== undefined
    && attempt.responseStatus >= 300 && attempt.responseStatus <= 599
    && attempt.transportObservationDigest !== undefined
    && attempt.transportRequestDigest !== undefined
    && attempt.paymentObservationDigest !== undefined
    && attempt.settlementStatus !== 'not_settled'
}

/**
 * Requires a stopped managed Call with a still-held buyer reservation and an
 * exact submitted attempt. Lost-result recovery requires no retained result;
 * HTTP-error recovery requires a retained non-2xx status and exact attribution.
 * Pins one transaction identity across crashes/retries. It does not itself
 * assert settlement, charge the buyer, or call the Provider.
 */
export const claim = internalMutation({
  args: identity,
  returns: remedyClaimResult,
  handler: async (ctx, args) => {
    if (!/^0x[0-9a-fA-F]{64}$/.test(args.transactionHash)) return null
    const call = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', q => q.eq('callRef', args.callRef)).unique()
    if (call === null) return null
    if (call.state === 'refused' && call.result?.kind === 'refused'
      && (args.failureKind === 'http_error' ? call.result.code === 'provider_refused' && call.result.receipt?.lossState === 'provider_http_error' : call.result.code === 'result_invalid')
      && call.result.receipt?.refundState === 'released'
      && call.result.receipt.externalSettlementRef === args.transactionHash.toLowerCase()) {
      return { kind: 'completed' as const }
    }
    if (call.state !== 'reconciliation_required'
      || call.formanceFinancialState !== 'outcome_unknown'
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
      && !(args.failureKind === 'http_error' && lease.leaseOwner.startsWith('paid-response:'))
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
  returns: remedyFinishResult,
  handler: async (ctx, args) => {
    if (!/^sha256:[a-f0-9]{64}$/.test(args.evidenceDigest)) return { kind: 'refused' as const }
    const call = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', q => q.eq('callRef', args.callRef)).unique()
    if (call?.state === 'refused' && call.result?.kind === 'refused'
      && (args.failureKind === 'http_error' ? call.result.code === 'provider_refused' && call.result.receipt?.lossState === 'provider_http_error' : call.result.code === 'result_invalid')
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
      || attempt.toolRef !== call.toolRef || attempt.inputDigest !== call.inputDigest
      || attempt.reservationRef === undefined || !call.formanceReservationRefs?.includes(attempt.reservationRef)
      || attempt.submissionStartedAt === undefined
      || attempt.paymentPayer === undefined || attempt.paymentNonce === undefined
      || !responseEligibleForRemedy(call, attempt, args.failureKind)) return { kind: 'refused' as const }
    const now = Date.now()
    const result = {
      kind: 'refused' as const, toolRef: call.toolRef,
      code: args.failureKind === 'http_error' ? 'provider_refused' as const : 'result_invalid' as const,
      retryable: false,
      nextAction: args.failureKind === 'http_error'
        ? 'The service returned an HTTP error after payment. Your credit has been restored. Choose another Tool or start a new request.'
        : 'AE could not recover the service response. Your credit has been restored. Start a new request from the Tool page.',
      receipt: {
        ...call.result.receipt, state: 'refunded' as const, refundState: 'released' as const,
        lossState: args.failureKind === 'http_error' ? 'provider_http_error' as const : 'unknown' as const, evidenceHash: args.evidenceDigest,
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
