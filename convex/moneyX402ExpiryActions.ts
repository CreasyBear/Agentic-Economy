"use node"
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { v } from 'convex/values'
import { Agent } from 'undici'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { configuredX402RpcUrls } from '@/modules/capability-execution/call-worker/x402Settlement'
import { readGuardedX402UnusedAuthorization } from '@/modules/capability-supply/internal/x402-evm-receipt-reader'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createGuardedLookup, defaultDnsResolver } from '@/modules/network-guard/public'
import type { MoneyFormanceResult } from './moneyFormance'

/** Exact expired-unused nonce recovery. No signing, Provider call, or replacement purchase. */
export const recover = internalAction({
  args: { callRef: v.string(), attempt: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ kind: 'completed' | 'pending' | 'not_eligible' }> => {
    // Arm the successor before RPC or ledger work. An action crash cannot skip
    // the recovery of a financial effect that this attempt is about to perform.
    const armed = await ctx.runMutation(internal.moneyX402Expiry.schedule, { callRef: args.callRef,
      attempt: (args.attempt ?? 0) + 1, runAt: Date.now() + 60_000 * 2 ** Math.min(args.attempt ?? 0, 4) })
    if (!armed) {
      const terminal = await ctx.runQuery(internal.capabilityCalls.readOwnerRecovery, { callRef: args.callRef })
      return { kind: terminal?.result?.kind === 'refused' && terminal.result.receipt?.refundState === 'released'
        ? 'completed' : 'pending' }
    }
    const retry = async () => ({ kind: 'pending' as const })
    try {
      const call = await ctx.runQuery(internal.capabilityCalls.readOwnerRecovery, { callRef: args.callRef })
      if (call?.result?.kind === 'refused' && call.result.receipt?.refundState === 'released') return { kind: 'completed' }
      if (call?.result?.kind !== 'reconciliation_required') return { kind: 'not_eligible' }
      const { attemptRef, effectGeneration } = call.result.evidence
      const payment = await ctx.runQuery(internal.moneyX402PaymentAttempts.readX402PaymentAttempt, {
        dispatchRef: call.callRef, attemptRef, effectGeneration,
      })
      if (payment === null || payment.paymentIdentityDigest === undefined || payment.paymentPayer === undefined || payment.paymentNonce === undefined
        || payment.paymentAuthorizationExpiresAt === undefined || payment.toolRef !== call.toolRef
        || payment.inputDigest !== call.inputDigest || payment.settlementStatus === 'settled'
        || payment.paymentResponseDigest !== undefined) return { kind: 'not_eligible' }
      const targets = configuredX402RpcUrls(payment.network, call.environment)
      if (targets.length === 0) return retry()
      const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
      let observations
      try {
        observations = await Promise.all(targets.map(target => readGuardedX402UnusedAuthorization({
          target, dispatcher, aeEnvironment: call.environment, network: payment.network, asset: payment.asset,
          payer: payment.paymentPayer!, nonce: payment.paymentNonce!, expiresAt: payment.paymentAuthorizationExpiresAt!,
        })))
      } finally { await dispatcher.close() }
      if (observations.some(item => item === undefined)) return retry()
      const proofs = observations.filter(item => item !== undefined)
      if (proofs.some(left => proofs.some(right => left.blockNumber === right.blockNumber
        && (left.blockHash !== right.blockHash || left.blockTimestamp !== right.blockTimestamp)))) return retry()
      const evidenceDigest = canonicalDigest({ kind: 'expired_unused_authorization:v1',
        callRef: call.callRef, attemptRef, effectGeneration, paymentIdentityDigest: payment.paymentIdentityDigest,
        nonce: payment.paymentNonce, expiresAt: payment.paymentAuthorizationExpiresAt,
        blocks: proofs.map(item => ({ hash: item.blockHash, number: item.blockNumber.toString(), timestamp: item.blockTimestamp.toString() })),
      })
      const material = await ctx.runQuery(internal.moneyManagedCall.readBooking, { callRef: call.callRef })
      if (material.kind !== 'available' || material.booking.providerAmountUnits !== payment.amountUnits
        || call.result.receipt?.commercialModel !== 'account_aud'
        || material.booking.buyerAmountUnits !== call.result.receipt.totalBuyerCharge.units) return retry()
      const claimed = await ctx.runMutation(internal.moneyX402Expiry.claim, {
        callRef: call.callRef, attemptRef, effectGeneration, paymentIdentityDigest: payment.paymentIdentityDigest,
        paymentNonce: payment.paymentNonce, evidenceDigest,
        evidenceRef: `chain:${payment.network}:${proofs.map(item => item.blockHash).join(':')}`,
      })
      if (claimed === null) return retry()
      const money: MoneyFormanceResult = await ctx.runAction(internal.moneyFormance.releaseExpiredUnusedCall, {
        booking: material.booking, externalEvidenceDigest: claimed.evidenceDigest,
      })
      if (money.kind !== 'completed') return retry()
      const result = await ctx.runMutation(internal.moneyX402Expiry.finish, {
        callRef: call.callRef, evidenceDigest: claimed.evidenceDigest, transactionRefs: [...money.transactionRefs],
      })
      return result.kind === 'completed' ? result : await retry()
    } catch (cause) {
      degradeBackend(cause, undefined, { site: 'recoverExpiredUnusedX402', reason: 'source_unavailable' })
      return await retry()
    }
  },
})
