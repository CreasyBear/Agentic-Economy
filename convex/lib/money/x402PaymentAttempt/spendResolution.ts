import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { v, type Infer } from 'convex/values'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { loadByCustody } from './attempt'

export const recordDefinitiveSigningRejectionArgs = v.object({
  custodyRef: v.string(), authorizationDigest: v.string(),
  paymentUnsignedMaterialDigest: v.string(), paymentSigningIdempotencyKey: v.string(),
  statusCode: v.union(v.literal(400), v.literal(403)),
  errorType: v.union(v.literal('invalid_request'), v.literal('policy_violation')),
  evidenceDigest: v.string(),
})
export const readDefinitiveSigningRejectionArgs = recordDefinitiveSigningRejectionArgs.pick(
  'custodyRef', 'authorizationDigest', 'paymentUnsignedMaterialDigest', 'paymentSigningIdempotencyKey',
)
export const readDefinitiveSigningRejectionReturns = v.union(v.null(), v.object({
  kind: v.literal('definitive_rejection'),
  statusCode: v.union(v.literal(400), v.literal(403)),
  errorType: v.union(v.literal('invalid_request'), v.literal('policy_violation')),
  evidenceDigest: v.string(),
}))

/** Resume the saved consequence after interruption, without another signature. */
export async function readDefinitiveSigningRejectionHandler(
  ctx: QueryCtx, args: Infer<typeof readDefinitiveSigningRejectionArgs>,
): Promise<Infer<typeof readDefinitiveSigningRejectionReturns>> {
  const row = await loadByCustody(ctx, args.custodyRef)
  if (row === null || row.authorizationDigest !== args.authorizationDigest
    || row.paymentUnsignedMaterialDigest !== args.paymentUnsignedMaterialDigest
    || row.paymentSigningIdempotencyKey !== args.paymentSigningIdempotencyKey
    || row.paymentSignatureDigest !== undefined || row.submissionStartedAt !== undefined
    || row.requestFingerprint === undefined || row.paymentIdentityDigest === undefined) return null
  const reservation = await ctx.db.query('moneyX402SpendReservations')
    .withIndex('by_attemptRef_and_effectGeneration', q => q.eq('attemptRef', row.attemptRef)
      .eq('effectGeneration', row.effectGeneration)).unique()
  if (reservation === null || reservation.state !== 'unused' || reservation.unusedProof !== 'definitively_not_signed'
    || reservation.reservationRef !== row.spendReservationRef || reservation.custodyRef !== row.custodyRef
    || reservation.authorizationDigest !== row.authorizationDigest || reservation.paymentIdentityDigest !== row.paymentIdentityDigest
    || reservation.paymentUnsignedMaterialDigest !== row.paymentUnsignedMaterialDigest
    || reservation.paymentSigningIdempotencyKey !== row.paymentSigningIdempotencyKey) return null
  for (const rejection of [{ statusCode: 400, errorType: 'invalid_request' },
    { statusCode: 403, errorType: 'policy_violation' }] as const) {
    const evidenceDigest = canonicalDigest({
      format: 'ae.x402-managed-signing-replay:v1', outcome: 'definitive_rejection', ...rejection,
      paymentUnsignedMaterialDigest: row.paymentUnsignedMaterialDigest, requestFingerprint: row.requestFingerprint,
    })
    if (evidenceDigest === reservation.resolutionEvidenceDigest) {
      return { kind: 'definitive_rejection', ...rejection, evidenceDigest }
    }
  }
  return null
}

/** Only the trusted CDP replay boundary supplies this exact no-sign response. */
export async function recordDefinitiveSigningRejectionHandler(
  ctx: MutationCtx, args: Infer<typeof recordDefinitiveSigningRejectionArgs>,
): Promise<boolean> {
  const row = await loadByCustody(ctx, args.custodyRef)
  if (row === null || row.authorizationDigest !== args.authorizationDigest
    || row.paymentUnsignedMaterialDigest !== args.paymentUnsignedMaterialDigest
    || row.paymentSigningIdempotencyKey !== args.paymentSigningIdempotencyKey
    || row.requestFingerprint === undefined || row.paymentSigningClaimedAt === undefined
    || row.paymentSignatureDigest !== undefined || row.submissionStartedAt !== undefined
    || row.settlementStatus === 'settled' || row.paymentAuthorizationExpiresAt === undefined
    || row.paymentAuthorizationExpiresAt > Date.now()
    || !((args.statusCode === 400 && args.errorType === 'invalid_request')
      || (args.statusCode === 403 && args.errorType === 'policy_violation'))
    || args.evidenceDigest !== canonicalDigest({
      format: 'ae.x402-managed-signing-replay:v1', outcome: 'definitive_rejection',
      statusCode: args.statusCode, errorType: args.errorType,
      paymentUnsignedMaterialDigest: row.paymentUnsignedMaterialDigest,
      requestFingerprint: row.requestFingerprint,
    })) return false
  await resolveX402SpendReservation(ctx, row, {
    kind: 'unused', proof: 'definitively_not_signed', evidenceDigest: args.evidenceDigest,
  })
  return true
}

type SpendResolution = Readonly<{ kind: 'settled'; evidenceDigest: string }>
  | Readonly<{ kind: 'unused'; evidenceDigest: string;
      proof: 'expired_unused' | 'authorization_cancelled' | 'definitively_not_signed' }>

/**
 * Requires conclusive evidence already validated by the caller's settlement or
 * recovery boundary, for this exact attempt. Uncertainty is never a release.
 * The first terminal transition owns its timestamp; replay cannot reset it.
 */
export async function resolveX402SpendReservation(
  ctx: Pick<MutationCtx, 'db'>,
  attempt: Doc<'moneyX402PaymentAttempts'>,
  resolution: SpendResolution,
): Promise<void> {
  const reservation = await ctx.db.query('moneyX402SpendReservations')
    .withIndex('by_attemptRef_and_effectGeneration', q => q.eq('attemptRef', attempt.attemptRef)
      .eq('effectGeneration', attempt.effectGeneration)).unique()
  // Historical attempts and refused admissions have no reserved exposure here.
  if (reservation === null) return
  if (reservation.reservationRef !== attempt.spendReservationRef
    || reservation.custodyRef !== attempt.custodyRef
    || reservation.dispatchRef !== attempt.dispatchRef
    || reservation.authorizationDigest !== attempt.authorizationDigest
    || reservation.paymentIdentityDigest !== attempt.paymentIdentityDigest
    || reservation.paymentUnsignedMaterialDigest !== attempt.paymentUnsignedMaterialDigest
    || reservation.paymentSigningIdempotencyKey !== attempt.paymentSigningIdempotencyKey
    || reservation.amountUnits !== attempt.amountUnits
    || reservation.normalizedPayTo !== attempt.payTo.toLowerCase()
    || !/^sha256:[a-f0-9]{64}$/.test(resolution.evidenceDigest)) {
    throw new Error('x402_spend_resolution_identity_conflict')
  }
  if (reservation.state !== 'liability') {
    if (reservation.state !== resolution.kind) throw new Error('x402_spend_resolution_state_conflict')
    return
  }
  if (resolution.kind === 'settled') {
    await ctx.db.patch(reservation._id, { state: 'settled', settledAt: Date.now(),
      resolutionEvidenceDigest: resolution.evidenceDigest })
  } else {
    await ctx.db.patch(reservation._id, { state: 'unused', resolvedAt: Date.now(),
      resolutionEvidenceDigest: resolution.evidenceDigest, unusedProof: resolution.proof })
  }
}
