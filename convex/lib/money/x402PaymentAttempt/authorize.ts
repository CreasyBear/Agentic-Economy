import { v, type Infer } from 'convex/values'
import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import type { MutationCtx } from '../../../_generated/server'
import { loadByCustody } from './attempt'
import { X402_PAYMENT_SIGNING_CLAIM_LEASE_MS } from './contracts'
import { canonicalUnsignedMaterialJson, isPaymentSigningIdempotencyKey, paymentAuthorizationExpiryFromMaterial, paymentAuthorizationExpiryValid, storedAuthorization } from './authorizationMaterial'
import { expectedCustodyGenerationMatches } from './identity'

export const claimX402PaymentAuthorizationReturns = v.union(
  v.object({ kind: v.literal('claimed') }),
  v.object({
    kind: v.literal('stored'),
    paymentUnsignedMaterialJson: v.string(),
    paymentUnsignedMaterialDigest: v.string(),
    paymentSigningIdempotencyKey: v.string(),
    paymentSignatureDigest: v.string(),
    paymentPayer: v.string(),
    paymentNonce: v.string(),
    paymentAuthorizationValidBefore: v.string(),
    paymentAuthorizationExpiresAt: v.number(),
    requestFingerprint: v.string(),
  }),
  v.object({ kind: v.literal('pending') }),
)

export const claimX402PaymentAuthorizationArgs = {
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  requestFingerprint: v.string(),
  custodyGeneration: v.optional(v.number()),
}

export const recordX402PaymentSigningIntentArgs = {
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  paymentUnsignedMaterialJson: v.string(),
  paymentUnsignedMaterialDigest: v.string(),
  paymentSigningIdempotencyKey: v.string(),
  paymentPayer: v.string(),
  paymentNonce: v.string(),
  paymentAuthorizationValidBefore: v.string(),
  paymentAuthorizationExpiresAt: v.number(),
  requestFingerprint: v.string(),
  custodyGeneration: v.optional(v.number()),
}

export const recordX402PaymentSigningIntentReturns = v.null()

export const recordX402PaymentSignatureDigestArgs = {
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  paymentSignatureDigest: v.string(),
  paymentPayer: v.optional(v.string()),
  paymentNonce: v.optional(v.string()),
  requestFingerprint: v.optional(v.string()),
  custodyGeneration: v.optional(v.number()),
}

export const recordX402PaymentSignatureDigestReturns = v.null()

export type ClaimArgs = {
  custodyRef: string
  authorizationDigest: string
  requestFingerprint: string
  custodyGeneration?: number
}
export type ClaimResult = Infer<typeof claimX402PaymentAuthorizationReturns>
export type RecordSigningIntentArgs = {
  custodyRef: string
  authorizationDigest: string
  paymentUnsignedMaterialJson: string
  paymentUnsignedMaterialDigest: string
  paymentSigningIdempotencyKey: string
  paymentPayer: string
  paymentNonce: string
  paymentAuthorizationValidBefore: string
  paymentAuthorizationExpiresAt: number
  requestFingerprint: string
  custodyGeneration?: number
}
export type RecordSignatureDigestArgs = {
  custodyRef: string
  authorizationDigest: string
  paymentSignatureDigest: string
  paymentPayer?: string
  paymentNonce?: string
  requestFingerprint?: string
  custodyGeneration?: number
}

export async function claimX402PaymentAuthorizationHandler(
  ctx: MutationCtx,
  args: ClaimArgs,
): Promise<ClaimResult> {
  const row = await loadByCustody(ctx, args.custodyRef)
  if (row === null || row.authorizationDigest !== args.authorizationDigest) {
    throw new Error('x402_payment_attempt_attribution_invalid')
  }
  if (!expectedCustodyGenerationMatches(row, args.custodyGeneration)) {
    throw new Error('x402_payment_custody_generation_conflict')
  }
  if (row.requestFingerprint !== args.requestFingerprint) {
    throw new Error('x402_payment_request_fingerprint_conflict')
  }
  if (row.state !== 'prepared') {
    throw new Error('x402_payment_attempt_reconciliation_required')
  }
  const stored = storedAuthorization(row)
  if (stored !== undefined) return { kind: 'stored', ...stored }
  // Any unsigned intent or authorization identity is durable first-win
  // evidence, not a lease. Once it exists, a later worker must converge on the
  // same idempotency key and EIP-3009 nonce instead of minting another one.
  const authorizationIdentityFields = [
    row.paymentUnsignedMaterialJson,
    row.paymentUnsignedMaterialDigest,
    row.paymentSigningIdempotencyKey,
    row.paymentSignatureDigest,
    row.paymentPayer,
    row.paymentNonce,
    row.paymentAuthorizationValidBefore,
    row.paymentAuthorizationExpiresAt,
  ]
  if (authorizationIdentityFields.some((value) => value !== undefined)) {
    return { kind: 'pending' }
  }

  const now = Date.now()
  if (row.paymentSigningClaimedAt !== undefined) {
    const claimedAt = row.paymentSigningClaimedAt
    // Invalid or future timestamps fail closed. A valid bare claim can be
    // reclaimed only after its bounded lease expires without identity evidence.
    if (
      !Number.isSafeInteger(claimedAt)
      || claimedAt < 0
      || claimedAt > now
      || now - claimedAt < X402_PAYMENT_SIGNING_CLAIM_LEASE_MS
    ) return { kind: 'pending' }
  }
  await ctx.db.patch(row._id, { paymentSigningClaimedAt: now })
  return { kind: 'claimed' }
}

export async function recordX402PaymentSigningIntentHandler(
  ctx: MutationCtx,
  args: RecordSigningIntentArgs,
): Promise<null> {
  if (!isPaymentSigningIdempotencyKey(args.paymentSigningIdempotencyKey)) {
    throw new Error('x402_payment_signing_idempotency_key_invalid')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(args.paymentUnsignedMaterialJson)
  } catch (cause) {
    degradeBackend(cause, undefined, {
      site: 'recordX402PaymentSigningIntentHandler',
      reason: 'invalid_response',
    })
    throw new Error('x402_payment_unsigned_material_invalid', { cause })
  }
  const parsedExpiry = paymentAuthorizationExpiryFromMaterial(parsed)
  if (
    canonicalUnsignedMaterialJson(parsed) !== args.paymentUnsignedMaterialJson
    || canonicalDigest(parsed) !== args.paymentUnsignedMaterialDigest
    || !paymentAuthorizationExpiryValid(
      args.paymentAuthorizationValidBefore,
      args.paymentAuthorizationExpiresAt,
    )
    || args.paymentPayer.trim().length === 0
    || args.paymentNonce.trim().length === 0
    || args.requestFingerprint.trim().length === 0
  ) throw new Error('x402_payment_unsigned_material_invalid')

  const row = await loadByCustody(ctx, args.custodyRef)
  if (row === null || row.authorizationDigest !== args.authorizationDigest) {
    throw new Error('x402_payment_attempt_attribution_invalid')
  }
  if (!expectedCustodyGenerationMatches(row, args.custodyGeneration)) {
    throw new Error('x402_payment_custody_generation_conflict')
  }
  if (row.requestFingerprint !== args.requestFingerprint) {
    throw new Error('x402_payment_request_fingerprint_conflict')
  }
  if (row.state !== 'prepared') throw new Error('x402_payment_attempt_reconciliation_required')

  const existingIntentFields = [
    row.paymentUnsignedMaterialJson,
    row.paymentUnsignedMaterialDigest,
    row.paymentSigningIdempotencyKey,
    row.paymentPayer,
    row.paymentNonce,
    row.paymentAuthorizationValidBefore,
    row.paymentAuthorizationExpiresAt,
  ]
  const hasExistingIntent = existingIntentFields.some((value) => value !== undefined)
  if (hasExistingIntent) {
    if (
      row.paymentUnsignedMaterialJson !== args.paymentUnsignedMaterialJson
      || row.paymentUnsignedMaterialDigest !== args.paymentUnsignedMaterialDigest
      || row.paymentSigningIdempotencyKey !== args.paymentSigningIdempotencyKey
      || row.paymentPayer !== args.paymentPayer
      || row.paymentNonce !== args.paymentNonce
      || row.paymentAuthorizationValidBefore !== args.paymentAuthorizationValidBefore
      || row.paymentAuthorizationExpiresAt !== args.paymentAuthorizationExpiresAt
    ) throw new Error('x402_payment_unsigned_identity_conflict')
    return null
  }
  if (
    parsedExpiry?.paymentAuthorizationValidBefore !== args.paymentAuthorizationValidBefore
    || parsedExpiry?.paymentAuthorizationExpiresAt !== args.paymentAuthorizationExpiresAt
  ) throw new Error('x402_payment_unsigned_material_invalid')
  await ctx.db.patch(row._id, {
    paymentUnsignedMaterialJson: args.paymentUnsignedMaterialJson,
    paymentUnsignedMaterialDigest: args.paymentUnsignedMaterialDigest,
    paymentSigningIdempotencyKey: args.paymentSigningIdempotencyKey,
    paymentPayer: args.paymentPayer,
    paymentNonce: args.paymentNonce,
    paymentAuthorizationValidBefore: args.paymentAuthorizationValidBefore,
    paymentAuthorizationExpiresAt: args.paymentAuthorizationExpiresAt,
    paymentSigningClaimedAt: row.paymentSigningClaimedAt ?? Date.now(),
  })
  return null
}

export async function recordX402PaymentSignatureDigestHandler(
  ctx: MutationCtx,
  args: RecordSignatureDigestArgs,
): Promise<null> {
  const row = await loadByCustody(ctx, args.custodyRef)
  if (row === null || row.authorizationDigest !== args.authorizationDigest) {
    throw new Error('x402_payment_attempt_attribution_invalid')
  }
  if (!expectedCustodyGenerationMatches(row, args.custodyGeneration)) {
    throw new Error('x402_payment_custody_generation_conflict')
  }
  if (row.state !== 'prepared') throw new Error('x402_payment_attempt_reconciliation_required')

  const hasAuthorizationIdentity = (
    args.paymentPayer !== undefined
    || args.paymentNonce !== undefined
    || args.requestFingerprint !== undefined
  )
  if (hasAuthorizationIdentity) {
    if (
      args.paymentPayer === undefined
      || args.paymentNonce === undefined
      || args.requestFingerprint === undefined
    ) throw new Error('x402_payment_authorization_material_invalid')
    if (row.requestFingerprint !== args.requestFingerprint) {
      throw new Error('x402_payment_request_fingerprint_conflict')
    }
    const stored = storedAuthorization(row)
    if (stored !== undefined) {
      if (
        stored.paymentSignatureDigest !== args.paymentSignatureDigest
        || stored.paymentPayer !== args.paymentPayer
        || stored.paymentNonce !== args.paymentNonce
      ) throw new Error('x402_payment_signature_identity_conflict')
      return null
    }
    if (
      row.paymentUnsignedMaterialJson === undefined
      || row.paymentUnsignedMaterialDigest === undefined
      || row.paymentSigningIdempotencyKey === undefined
      || !isPaymentSigningIdempotencyKey(row.paymentSigningIdempotencyKey)
      || row.paymentPayer !== args.paymentPayer
      || row.paymentNonce !== args.paymentNonce
      || row.paymentAuthorizationValidBefore === undefined
      || row.paymentAuthorizationExpiresAt === undefined
      || !paymentAuthorizationExpiryValid(
        row.paymentAuthorizationValidBefore,
        row.paymentAuthorizationExpiresAt,
      )
    ) throw new Error('x402_payment_authorization_material_invalid')
    await ctx.db.patch(row._id, {
      paymentSignatureDigest: args.paymentSignatureDigest,
    })
    return null
  }
  if (
    row.paymentSignatureDigest !== undefined
    && row.paymentSignatureDigest !== args.paymentSignatureDigest
  ) throw new Error('x402_payment_signature_identity_conflict')
  if (row.paymentSignatureDigest === undefined) {
    await ctx.db.patch(row._id, { paymentSignatureDigest: args.paymentSignatureDigest })
  }
  return null
}
