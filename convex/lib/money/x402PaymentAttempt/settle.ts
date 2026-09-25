import { v, type Infer } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import { recordMarketEvidenceFact } from '../../../marketEvidence'
import { loadByAttempt } from './attempt'
import { type ReconcileArgs } from './contracts'
import { reconciliationMismatch } from './identity'

export const reconcileX402PaymentAttemptArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  toolRef: v.string(),
  inputDigest: v.string(),
  evidenceRef: v.string(),
  evidenceDigest: v.string(),
  reservationRef: v.string(),
  paymentIdentifier: v.string(),
  challengeDigest: v.string(),
  settlementStatus: v.union(v.literal('settled'), v.literal('not_settled')),
  amountUnits: v.string(),
  currency: v.string(),
  exponent: v.number(),
  paymentResponseDigest: v.string(),
  transportObservationDigest: v.string(),
  transportRequestDigest: v.string(),
  paymentObservationDigest: v.string(),
  observedAt: v.number(),
}

export const reconcileX402PaymentAttemptReturns = v.union(
  v.object({
    kind: v.literal('settled'),
    settlementStatus: v.union(v.literal('settled'), v.literal('not_settled')),
  }),
  v.object({ kind: v.literal('reconciliation_required') }),
  v.object({ kind: v.literal('not_found') }),
)

export type ReconcileResult = Infer<typeof reconcileX402PaymentAttemptReturns>

export async function reconcileX402PaymentAttemptHandler(
  ctx: MutationCtx,
  args: ReconcileArgs,
): Promise<ReconcileResult> {
  const row = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
  if (row === null) {
    console.warn('x402_payment_attempt_reconciliation_refused', {
      attemptRef: args.attemptRef,
      effectGeneration: args.effectGeneration,
      mismatch: 'attempt_not_found',
    })
    return { kind: 'reconciliation_required' }
  }
  const mismatch = reconciliationMismatch(row, args)
  if (mismatch !== undefined) {
    console.warn('x402_payment_attempt_reconciliation_refused', {
      attemptRef: args.attemptRef,
      effectGeneration: args.effectGeneration,
      mismatch,
    })
    return { kind: 'reconciliation_required' }
  }
  if (row.reconciliationEvidenceDigest !== undefined) {
    return row.reconciliationEvidenceRef === args.evidenceRef
      && row.reconciliationEvidenceDigest === args.evidenceDigest
      && row.paymentResponseDigest === args.paymentResponseDigest
      ? { kind: 'settled', settlementStatus: args.settlementStatus }
      : { kind: 'reconciliation_required' }
  }
  await ctx.db.patch(row._id, {
    reconciliationEvidenceRef: args.evidenceRef,
    reconciliationEvidenceDigest: args.evidenceDigest,
    paymentObservationDigest: args.paymentObservationDigest,
    settlementStatus: args.settlementStatus,
    paymentResponseDigest: args.paymentResponseDigest,
    state: 'observed',
  })
  if (args.settlementStatus === 'settled') {
    await recordMarketEvidenceFact(ctx, 'ae_settlement', `${args.attemptRef}:${args.effectGeneration}`, args.observedAt)
  }
  return { kind: 'settled', settlementStatus: args.settlementStatus }
}
