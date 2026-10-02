"use node"

import { financialEnvironmentMatches } from './lib/money/formance/contracts'
import { v } from 'convex/values'
import { Agent } from 'undici'
import { internal } from './_generated/api'
import { internalAction, type ActionCtx } from './_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { verifyExactEvmX402Settlement } from '@/modules/capability-supply/server'
import { createGuardedLookup, defaultDnsResolver } from '@/modules/network-guard/public'
import { readX402EvmReceipt } from '@/modules/capability-execution/call-runtime'
import { callReceiptPaymentProfile } from '@/modules/capability-execution/call-contracts'
import type { FormanceMoneyResult as MoneyFormanceResult } from '@/modules/money/public'
const resolvePaidResultFailureResult = v.union(
  v.object({ kind: v.literal('completed') }),
  v.object({ kind: v.literal('refused'), code: v.string() }),
)

/**
 * Requires: an existing stopped Call whose response was lost, and the original
 * transaction. Ensures: buyer credit restored and paid Provider accounted for.
 * Invariant: no signing, Provider request, or new onchain transfer; payment
 * never proves delivery. Chain/ledger failure leaves a resumable same-Call task.
 * One internal operator action replaces manual evidence construction. It reuses
 * chain verification and atomic ledger templates; no new public API or schema.
 */
export const resolveLostResult = internalAction({
  args: { callRef: v.string(), transactionHash: v.string() },
  returns: resolvePaidResultFailureResult,
  handler: async (ctx, args) => await resolvePaidResultFailure(ctx, args),
})

/** Restore the buyer after a verified-paid upstream HTTP error. */
export const resolveHttpError = internalAction({
  args: { callRef: v.string(), transactionHash: v.string() },
  returns: resolvePaidResultFailureResult,
  handler: async (ctx, args) => await resolvePaidResultFailure(ctx, args, 'http_error'),
})

async function resolvePaidResultFailure(ctx: ActionCtx, args: { callRef: string; transactionHash: string },
  failureKind?: 'http_error'): Promise<{ kind: 'completed' } | { kind: 'refused'; code: string }> {
    const transactionHash = args.transactionHash.toLowerCase()
    const call = await ctx.runQuery(internal.capabilityCalls.readOwnerRecovery, { callRef: args.callRef })
    if (call !== null && !financialEnvironmentMatches(call.environment)) return { kind: 'refused', code: 'environment_mismatch' }
    if (call?.result?.kind === 'refused'
      && (failureKind === 'http_error' ? call.result.code === 'provider_refused' && call.result.receipt?.lossState === 'provider_http_error' : call.result.code === 'result_invalid')
      && call.result.receipt?.refundState === 'released'
      && call.result.receipt.externalSettlementRef === transactionHash) return { kind: 'completed' }
    if (call?.result?.kind !== 'reconciliation_required'
      || !/^0x[0-9a-f]{64}$/.test(transactionHash)) return { kind: 'refused', code: 'call_not_eligible' }
    const { attemptRef, effectGeneration } = call.result.evidence
    const attempt = await ctx.runQuery(internal.moneyX402PaymentAttempts.readX402PaymentAttempt, {
      dispatchRef: call.callRef, attemptRef, effectGeneration,
    })
    if (attempt === null || attempt.paymentPayer === undefined || attempt.paymentNonce === undefined
      || attempt.toolRef !== call.toolRef || attempt.inputDigest !== call.inputDigest
      // The Tool price may be labelled USD; settlement identity is the admitted token.
      || callReceiptPaymentProfile(call.environment, attempt.network, attempt.asset) === undefined
      || attempt.exponent !== 6
      || (failureKind === undefined
        ? attempt.transportObservationDigest !== undefined || attempt.quarantinedOutputJson !== undefined
          || attempt.responseStatus !== undefined
        : !Number.isSafeInteger(attempt.responseStatus) || attempt.responseStatus === undefined
          || attempt.responseStatus < 300 || attempt.responseStatus > 599
          || attempt.transportObservationDigest === undefined
          || attempt.transportRequestDigest === undefined
          || attempt.paymentObservationDigest === undefined
          || attempt.settlementStatus === 'not_settled')) {
      return { kind: 'refused', code: 'payment_identity_unavailable' }
    }
    const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
    let verified = false
    try {
      const receipt = await readX402EvmReceipt(attempt.network, attempt.asset, transactionHash,
        dispatcher, call.environment, attempt.paymentPayer, attempt.paymentNonce)
      verified = verifyExactEvmX402Settlement({
        aeEnvironment: call.environment,
        response: { success: true, transaction: transactionHash, network: attempt.network,
          amount: attempt.amountUnits, payer: attempt.paymentPayer },
        requirement: { scheme: attempt.scheme, network: attempt.network, amount: attempt.amountUnits,
          asset: attempt.asset, payTo: attempt.payTo },
        payer: attempt.paymentPayer, paymentNonce: attempt.paymentNonce, receipt,
      })
    } finally { await dispatcher.close() }
    if (!verified) return { kind: 'refused', code: 'payment_not_verified' }
    const responseEvidence = failureKind === undefined ? {} : {
      failureKind, responseStatus: attempt.responseStatus,
      transportObservationDigest: attempt.transportObservationDigest,
      transportRequestDigest: attempt.transportRequestDigest,
      paymentObservationDigest: attempt.paymentObservationDigest,
      ...(attempt.quarantinedResponseDigest === undefined ? {} : { responseDigest: attempt.quarantinedResponseDigest }),
    }
    const evidenceDigest = canonicalDigest({
      kind: 'ae_paid_call_result_loss:v1', callRef: call.callRef, attemptRef, effectGeneration,
      transactionHash, network: attempt.network, asset: attempt.asset, payer: attempt.paymentPayer,
      payTo: attempt.payTo, nonce: attempt.paymentNonce, amountUnits: attempt.amountUnits,
      paymentIdentifier: attempt.paymentIdentifier, inputDigest: call.inputDigest,
      ...responseEvidence,
    })
    const remedyIdentity = { callRef: call.callRef, transactionHash,
      ...(failureKind === undefined ? {} : { failureKind }) }
    const claim = await ctx.runMutation(internal.moneyManagedCallRemedy.claim, remedyIdentity)
    if (claim === null) return { kind: 'refused', code: 'call_not_eligible' }
    if (claim.kind === 'completed') return { kind: 'completed' }
    if (claim.attempt.attemptRef !== attemptRef
      || claim.attempt.effectGeneration !== effectGeneration
      || claim.attempt.paymentIdentityDigest !== attempt.paymentIdentityDigest
      || (failureKind === 'http_error' && (
        claim.attempt.responseStatus !== attempt.responseStatus
        || claim.attempt.transportObservationDigest !== attempt.transportObservationDigest
        || claim.attempt.transportRequestDigest !== attempt.transportRequestDigest
        || claim.attempt.paymentObservationDigest !== attempt.paymentObservationDigest
        || claim.attempt.quarantinedResponseDigest !== attempt.quarantinedResponseDigest
      ))) {
      return { kind: 'refused', code: 'payment_identity_changed' }
    }
    const material = await ctx.runQuery(internal.moneyManagedCall.readBooking, { callRef: call.callRef })
    if (material.kind !== 'available' || material.booking.providerAmountUnits !== attempt.amountUnits
      || (failureKind === 'http_error' && material.financialState !== 'outcome_unknown')
      || claim.call.result?.kind !== 'reconciliation_required'
      || claim.call.result.receipt?.commercialModel !== 'account_aud'
      || material.booking.buyerAmountUnits !== claim.call.result.receipt.totalBuyerCharge.units) {
      return { kind: 'refused', code: 'booking_unavailable' }
    }
    const money: MoneyFormanceResult = await ctx.runAction(internal.moneyFormance.remedyPaidCall, {
      expectedEnvironment: material.expectedEnvironment,
      booking: material.booking, externalEvidenceDigest: evidenceDigest,
    })
    if (money.kind !== 'completed') return { kind: 'refused', code: 'credit_restoration_pending' }
    const finished = await ctx.runMutation(internal.moneyManagedCallRemedy.finish, {
      ...remedyIdentity, evidenceDigest, transactionRefs: [...money.transactionRefs],
    })
    return finished.kind === 'completed' ? finished : { kind: 'refused', code: 'receipt_update_pending' }
}
