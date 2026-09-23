import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation, type QueryCtx } from './_generated/server'
import { materializePurchaseResolutionRecord } from './lib/callLifecycle/purchaseResolutionMaterialize'
import { upsertCallProjection } from './lib/callLifecycle/dispatch'

const owner = (nonce: string) => `expired-unused:${nonce}`
const proof = {
  callRef: v.string(), attemptRef: v.string(), effectGeneration: v.number(),
  paymentIdentityDigest: v.string(), paymentNonce: v.string(),
  evidenceDigest: v.string(), evidenceRef: v.string(),
}
async function readCall(ctx: Pick<QueryCtx, 'db'>, callRef: string) {
  return await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', callRef)).unique()
}

/** Called only with independently verified safe-block proof; pins evidence across crash/replay. */
export const claim = internalMutation({
  args: proof,
  handler: async (ctx, args) => {
    const call = await readCall(ctx, args.callRef)
    if (call === null || call.state !== 'reconciliation_required'
      || call.formanceFinancialState !== 'outcome_unknown'
      || call.sellerOnboardingCanary !== undefined || call.result?.kind !== 'reconciliation_required'
      || call.result.receipt?.commercialModel !== 'account_aud'
      || call.result.evidence.attemptRef !== args.attemptRef
      || call.result.evidence.effectGeneration !== args.effectGeneration
      || !/^sha256:[a-f0-9]{64}$/.test(args.evidenceDigest)) return null
    const attempt = await ctx.db.query('moneyX402PaymentAttempts')
      .withIndex('by_attemptRef_and_effectGeneration', q => q.eq('attemptRef', args.attemptRef).eq('effectGeneration', args.effectGeneration)).unique()
    if (attempt === null || attempt.dispatchRef !== call.callRef
      || attempt.toolRef !== call.toolRef || attempt.inputDigest !== call.inputDigest
      || attempt.paymentIdentityDigest !== args.paymentIdentityDigest || attempt.paymentNonce !== args.paymentNonce
      || attempt.paymentAuthorizationExpiresAt === undefined || attempt.paymentAuthorizationExpiresAt > Date.now()
      || attempt.settlementStatus === 'settled' || attempt.paymentResponseDigest !== undefined
      || attempt.reservationRef === undefined || !call.formanceReservationRefs?.includes(attempt.reservationRef)) return null
    const lease = call.reconciliation
    const leaseOwner = owner(args.paymentNonce)
    if (lease?.leaseOwner !== undefined && lease.leaseOwner !== leaseOwner
      && (lease.leaseExpiresAt ?? 0) > Date.now()) return null
    if (lease?.leaseOwner === leaseOwner && attempt.reconciliationEvidenceDigest !== undefined) {
      return { evidenceDigest: attempt.reconciliationEvidenceDigest }
    }
    await ctx.db.patch(attempt._id, { reconciliationEvidenceDigest: args.evidenceDigest, reconciliationEvidenceRef: args.evidenceRef })
    await ctx.db.patch(call._id, { reconciliation: {
      disposition: 'automatic', reason: 'refund_pending', attemptCount: lease?.attemptCount ?? 0,
      // Dedicated scheduled recovery owns this permanent claim. Keep it out of
      // the general due queue, where it could otherwise hide later candidates.
      nextAttemptAt: Number.MAX_SAFE_INTEGER, leaseOwner, leaseExpiresAt: Number.MAX_SAFE_INTEGER,
    } })
    return { evidenceDigest: args.evidenceDigest }
  },
})

export const finish = internalMutation({
  args: { callRef: v.string(), evidenceDigest: v.string(), transactionRefs: v.array(v.string()) },
  handler: async (ctx, args) => {
    const call = await readCall(ctx, args.callRef)
    if (call?.formanceFinancialState === 'released' && call.result?.kind === 'refused'
      && call.result.receipt?.evidenceHash === args.evidenceDigest) {
      if (JSON.stringify(call.formanceReleaseRefs) !== JSON.stringify(args.transactionRefs)) return { kind: 'refused' as const }
      // Replaying a completed release retains financial facts and refreshes Activity.
      const result = { ...call.result, code: 'source_unavailable' as const }
      await ctx.db.patch(call._id, { result })
      await upsertCallProjection(ctx, call, { state: 'refused', dispatchState: 'failed', result }, call.updatedAt)
      return { kind: 'completed' as const }
    }
    if (call === null || call.state !== 'reconciliation_required'
      || call.formanceFinancialState !== 'outcome_unknown'
      || !call.reconciliation?.leaseOwner?.startsWith('expired-unused:')
      || call.result?.kind !== 'reconciliation_required' || call.result.receipt?.commercialModel !== 'account_aud'
      || args.transactionRefs.length !== 2) return { kind: 'refused' as const }
    const { attemptRef, effectGeneration } = call.result.evidence
    const attempt = await ctx.db.query('moneyX402PaymentAttempts')
      .withIndex('by_attemptRef_and_effectGeneration', q => q.eq('attemptRef', attemptRef).eq('effectGeneration', effectGeneration)).unique()
    const obligation = await ctx.db.query('moneyProviderObligations').withIndex('by_callRef', q => q.eq('callRef', call.callRef)).unique()
    if (attempt === null || obligation === null || attempt.dispatchRef !== call.callRef
      || attempt.reconciliationEvidenceDigest !== args.evidenceDigest
      || attempt.paymentNonce === undefined || call.reconciliation.leaseOwner !== owner(attempt.paymentNonce)
      || attempt.settlementStatus === 'settled') return { kind: 'refused' as const }
    const transactionRef = args.transactionRefs[0]
    if (transactionRef === undefined) return { kind: 'refused' as const }
    const now = Date.now()
    const result = {
      kind: 'refused' as const, toolRef: call.toolRef, code: 'source_unavailable' as const, retryable: false,
      nextAction: 'The service did not complete and payment expired unused. Your credit has been restored. You can make a new request from the Tool page.',
      receipt: { ...call.result.receipt, state: 'refunded' as const, refundState: 'released' as const,
        lossState: 'none' as const, evidenceHash: args.evidenceDigest, issuedAt: new Date(now).toISOString(),
        accountingTransactionRefs: [...args.transactionRefs], transactionRef,
      },
    }
    await ctx.db.patch(attempt._id, { state: 'observed', settlementStatus: 'not_settled', paymentUnsignedMaterialJson: undefined })
    await ctx.db.patch(obligation._id, { state: 'reversed', updatedAt: now,
      evidenceRefs: [...new Set([...obligation.evidenceRefs, ...args.transactionRefs, args.evidenceDigest])].slice(-32) })
    await ctx.db.patch(call._id, { state: 'refused', dispatchState: 'failed', result,
      formanceFinancialState: 'released', formanceReleaseRefs: [...args.transactionRefs],
      reconciliation: undefined, evidenceHash: args.evidenceDigest, updatedAt: now })
    const projection = { state: 'refused' as const, dispatchState: 'failed' as const, result }
    await materializePurchaseResolutionRecord(ctx, call, projection, now)
    await upsertCallProjection(ctx, call, projection, now)
    return { kind: 'completed' as const }
  },
})

/** Scheduled independently of the browser; retries read the same payment only. */
export const schedule = internalMutation({
  args: { callRef: v.string(), runAt: v.number(), attempt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const call = await readCall(ctx, args.callRef)
    if (call?.state !== 'reconciliation_required') return false
    const attempt = args.attempt ?? 0
    if (attempt >= 5) {
      await ctx.db.patch(call._id, { reconciliation: {
        ...call.reconciliation, attemptCount: attempt, nextAttemptAt: Date.now(),
        disposition: 'manual_review', reason: 'recovery_failed',
      } })
      return false
    }
    await ctx.scheduler.runAt(Math.max(Date.now(), args.runAt), internal.moneyX402ExpiryActions.recover, { callRef: args.callRef, attempt })
    return true
  },
})
