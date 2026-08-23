import { v, type Infer } from 'convex/values'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { containsForbiddenSignatureKey } from '@/modules/common/forbidden-signature-key'
import { isRecord } from '@/modules/common/is-record'
import { stableStringify } from '@/modules/common/stable-hash'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { MutationCtx } from './_generated/server'
import {
  eventAttributionValid,
  expectedCustodyGenerationMatches,
  loadByAttempt,
  loadByCustody,
  type AttemptRow,
  type EventArgs,
  x402PaymentEventArgs,
} from './moneyX402PaymentAttemptsShared'

const paymentSigningIdempotencyKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const paymentAuthorizationValidBeforePattern = /^(?:0|[1-9][0-9]*)$/

function isPaymentSigningIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && paymentSigningIdempotencyKeyPattern.test(value)
}

function paymentAuthorizationExpiryFromValidBefore(
  validBefore: unknown,
): Readonly<{
  paymentAuthorizationValidBefore: string
  paymentAuthorizationExpiresAt: number
}> | undefined {
  if (typeof validBefore !== 'string' || !paymentAuthorizationValidBeforePattern.test(validBefore)) {
    return undefined
  }
  let seconds: bigint
  try {
    seconds = BigInt(validBefore)
  } catch {
    return undefined
  }
  if (seconds <= 0n) return undefined
  const milliseconds = seconds * 1000n
  const expiresAt = Number(milliseconds)
  if (
    !Number.isFinite(expiresAt)
    || !Number.isSafeInteger(expiresAt)
    || expiresAt <= 0
  ) return undefined
  try {
    return BigInt(expiresAt) === milliseconds
      ? { paymentAuthorizationValidBefore: validBefore, paymentAuthorizationExpiresAt: expiresAt }
      : undefined
  } catch {
    return undefined
  }
}

function paymentAuthorizationExpiryValid(
  validBefore: unknown,
  expiresAt: unknown,
): boolean {
  const expected = paymentAuthorizationExpiryFromValidBefore(validBefore)
  return expected !== undefined && expected.paymentAuthorizationExpiresAt === expiresAt
}

function paymentAuthorizationExpiryFromMaterial(
  value: unknown,
): Readonly<{
  paymentAuthorizationValidBefore: string
  paymentAuthorizationExpiresAt: number
}> | undefined {
  if (!isRecord(value) || !isRecord(value.authorization) || !isRecord(value.typedData)) {
    return undefined
  }
  const message = value.typedData.message
  if (!isRecord(message)) return undefined
  const expiry = paymentAuthorizationExpiryFromValidBefore(message.validBefore)
  return expiry !== undefined && value.authorization.validBefore === expiry.paymentAuthorizationValidBefore
    ? expiry
    : undefined
}

function canonicalUnsignedMaterialJson(value: unknown): string | undefined {
  if (containsForbiddenSignatureKey(value)) return undefined
  try {
    const json = stableStringify(value as StableHashValue)
    return canonicalDigest(value) === canonicalDigest(JSON.parse(json)) ? json : undefined
  } catch {
    return undefined
  }
}

export const prepareX402PaymentAuthorizationArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  operationRef: v.optional(v.string()),
  inputDigest: v.optional(v.string()),
  paymentIdentifier: v.string(),
  operationKeyDigest: v.string(),
  challengeDigest: v.string(),
  challengeJson: v.string(),
  selectedRequirementJson: v.string(),
  providerEndpoint: v.string(),
  credentialRef: v.string(),
  scheme: v.string(),
  network: v.string(),
  asset: v.string(),
  payTo: v.string(),
  amountUnits: v.string(),
  currency: v.string(),
  exponent: v.number(),
  reservationRef: v.optional(v.string()),
  requestFingerprint: v.optional(v.string()),
  custodyBudgetRef: v.optional(v.string()),
  custodyGeneration: v.optional(v.number()),
  custodyDailyMaximumUnits: v.optional(v.string()),
}

export const prepareX402PaymentAuthorizationReturns = v.object({
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  custodyBudgetRef: v.optional(v.string()),
  custodyGeneration: v.optional(v.number()),
  custodyDailyMaximumUnits: v.optional(v.string()),
})

type PrepareArgs = {
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
  operationRef?: string
  inputDigest?: string
  paymentIdentifier: string
  operationKeyDigest: string
  challengeDigest: string
  challengeJson: string
  selectedRequirementJson: string
  providerEndpoint: string
  credentialRef: string
  scheme: string
  network: string
  asset: string
  payTo: string
  amountUnits: string
  currency: string
  exponent: number
  reservationRef?: string
  requestFingerprint?: string
  custodyBudgetRef?: string
  custodyGeneration?: number
  custodyDailyMaximumUnits?: string
}

function managedCustodyPolicyValid(
  args: Pick<
    PrepareArgs,
    'custodyBudgetRef' | 'custodyGeneration' | 'custodyDailyMaximumUnits'
  >,
): boolean {
  const fields = [
    args.custodyBudgetRef,
    args.custodyGeneration,
    args.custodyDailyMaximumUnits,
  ]
  const supplied = fields.filter((value) => value !== undefined).length
  if (supplied === 0) return true
  if (supplied !== fields.length) return false
  return (
    typeof args.custodyBudgetRef === 'string'
    && args.custodyBudgetRef.trim().length > 0
    && typeof args.custodyGeneration === 'number'
    && Number.isSafeInteger(args.custodyGeneration)
    && args.custodyGeneration > 0
    && typeof args.custodyDailyMaximumUnits === 'string'
    && /^[1-9][0-9]*$/.test(args.custodyDailyMaximumUnits)
  )
}

function assertManagedCustodyPolicy(
  args: Pick<
    PrepareArgs,
    'custodyBudgetRef' | 'custodyGeneration' | 'custodyDailyMaximumUnits'
  >,
): void {
  if (!managedCustodyPolicyValid(args)) {
    throw new Error('x402_payment_custody_policy_invalid')
  }
}

function prepareAttributionMatches(row: AttemptRow, args: PrepareArgs): boolean {
  return (
    row.dispatchRef === args.dispatchRef
    && row.attemptRef === args.attemptRef
    && row.effectGeneration === args.effectGeneration
    && row.operationRef === args.operationRef
    && row.inputDigest === args.inputDigest
    && row.paymentIdentifier === args.paymentIdentifier
    && row.operationKeyDigest === args.operationKeyDigest
    && row.challengeDigest === args.challengeDigest
    && row.challengeJson === args.challengeJson
    && row.selectedRequirementJson === args.selectedRequirementJson
    && row.providerEndpoint === args.providerEndpoint
    && row.credentialRef === args.credentialRef
    && row.scheme === args.scheme
    && row.network === args.network
    && row.asset === args.asset
    && row.payTo === args.payTo
    && row.amountUnits === args.amountUnits
    && row.currency === args.currency
    && row.exponent === args.exponent
    && (row.reservationRef ?? undefined) === args.reservationRef
    && (row.requestFingerprint ?? undefined) === args.requestFingerprint
    && (row.custodyBudgetRef ?? undefined) === args.custodyBudgetRef
    && (row.custodyGeneration ?? undefined) === args.custodyGeneration
    && (row.custodyDailyMaximumUnits ?? undefined) === args.custodyDailyMaximumUnits
  )
}

async function loadByPaymentIdentifier(
  ctx: MutationCtx,
  paymentIdentifier: string,
): Promise<readonly AttemptRow[]> {
  return await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_paymentIdentifier', (query) => (
      query.eq('paymentIdentifier', paymentIdentifier)
    ))
    .take(8)
}

const x402PaymentAuthorizationStored = v.object({
  paymentUnsignedMaterialJson: v.string(),
  paymentUnsignedMaterialDigest: v.string(),
  paymentSigningIdempotencyKey: v.string(),
  paymentSignatureDigest: v.string(),
  paymentPayer: v.string(),
  paymentNonce: v.string(),
  paymentAuthorizationValidBefore: v.string(),
  paymentAuthorizationExpiresAt: v.number(),
  requestFingerprint: v.string(),
})

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

function storedAuthorization(
  row: AttemptRow,
): Infer<typeof x402PaymentAuthorizationStored> | undefined {
  if (
    row.paymentUnsignedMaterialJson === undefined
    || row.paymentUnsignedMaterialDigest === undefined
    || row.paymentSigningIdempotencyKey === undefined
    || row.paymentSignatureDigest === undefined
    || row.paymentPayer === undefined
    || row.paymentNonce === undefined
    || row.paymentAuthorizationValidBefore === undefined
    || row.paymentAuthorizationExpiresAt === undefined
    || row.requestFingerprint === undefined
    || !isPaymentSigningIdempotencyKey(row.paymentSigningIdempotencyKey)
    || !paymentAuthorizationExpiryValid(
      row.paymentAuthorizationValidBefore,
      row.paymentAuthorizationExpiresAt,
    )
  ) return undefined
  return {
    paymentUnsignedMaterialJson: row.paymentUnsignedMaterialJson,
    paymentUnsignedMaterialDigest: row.paymentUnsignedMaterialDigest,
    paymentSigningIdempotencyKey: row.paymentSigningIdempotencyKey,
    paymentSignatureDigest: row.paymentSignatureDigest,
    paymentPayer: row.paymentPayer,
    paymentNonce: row.paymentNonce,
    paymentAuthorizationValidBefore: row.paymentAuthorizationValidBefore,
    paymentAuthorizationExpiresAt: row.paymentAuthorizationExpiresAt,
    requestFingerprint: row.requestFingerprint,
  }
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

export const markX402PaymentPossiblySubmittedArgs = { ...x402PaymentEventArgs }
export const markX402PaymentPossiblySubmittedReturns = v.null()

type ClaimArgs = {
  custodyRef: string
  authorizationDigest: string
  requestFingerprint: string
  custodyGeneration?: number
}
type ClaimResult = Infer<typeof claimX402PaymentAuthorizationReturns>
type RecordSigningIntentArgs = {
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
type RecordSignatureDigestArgs = {
  custodyRef: string
  authorizationDigest: string
  paymentSignatureDigest: string
  paymentPayer?: string
  paymentNonce?: string
  requestFingerprint?: string
  custodyGeneration?: number
}
type MarkPossiblySubmittedArgs = EventArgs & {
  settlementStatus?: 'settled' | 'not_settled' | 'unknown'
  settlementDigest?: string
}

export async function prepareX402PaymentAuthorizationHandler(
  ctx: MutationCtx,
  args: PrepareArgs,
): Promise<Infer<typeof prepareX402PaymentAuthorizationReturns>> {
  assertManagedCustodyPolicy(args)
  const existing = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
  if (existing !== null) {
    if (
      args.requestFingerprint !== undefined
      && existing.requestFingerprint !== args.requestFingerprint
    ) throw new Error('x402_payment_request_fingerprint_conflict')
    if (!prepareAttributionMatches(existing, args)) {
      throw new Error('x402_payment_attempt_attribution_invalid')
    }
    if (existing.state !== 'prepared') {
      throw new Error('x402_payment_attempt_reconciliation_required')
    }
    return {
      custodyRef: existing.custodyRef,
      authorizationDigest: existing.authorizationDigest,
      ...(existing.custodyBudgetRef === undefined ? {} : { custodyBudgetRef: existing.custodyBudgetRef }),
      ...(existing.custodyGeneration === undefined ? {} : { custodyGeneration: existing.custodyGeneration }),
      ...(existing.custodyDailyMaximumUnits === undefined ? {} : { custodyDailyMaximumUnits: existing.custodyDailyMaximumUnits }),
    }
  }
  const identified = await loadByPaymentIdentifier(ctx, args.paymentIdentifier)
  if (identified.some((row) => (
    args.requestFingerprint !== undefined
    && row.requestFingerprint !== args.requestFingerprint
  ))) {
    throw new Error('x402_payment_request_fingerprint_conflict')
  }
  if (identified.some((row) => (
    row.attemptRef !== args.attemptRef
    || row.effectGeneration !== args.effectGeneration
    || !prepareAttributionMatches(row, args)
  ))) {
    throw new Error('x402_payment_attempt_attribution_invalid')
  }
  const custodyRef = canonicalDigest({
    kind: 'ae.x402.custody:v1',
    dispatchRef: args.dispatchRef,
    attemptRef: args.attemptRef,
    effectGeneration: args.effectGeneration,
    paymentIdentifier: args.paymentIdentifier,
    challengeDigest: args.challengeDigest,
  } as StableHashValue)
  const paymentIdentityDigest = canonicalDigest({
    kind: 'ae.x402.payment-identity:v1',
    paymentIdentifier: args.paymentIdentifier,
    challengeDigest: args.challengeDigest,
    selectedRequirementJson: args.selectedRequirementJson,
    credentialRef: args.credentialRef,
    reservationRef: args.reservationRef ?? null,
    requestFingerprint: args.requestFingerprint ?? null,
    custodyBudgetRef: args.custodyBudgetRef ?? null,
    custodyGeneration: args.custodyGeneration ?? null,
    custodyDailyMaximumUnits: args.custodyDailyMaximumUnits ?? null,
  } as StableHashValue)
  const authorizationDigest = canonicalDigest({
    kind: 'ae.x402.authorization:v1',
    paymentIdentityDigest,
    credentialRef: args.credentialRef,
  } as StableHashValue)
  await ctx.db.insert('moneyX402PaymentAttempts', {
    ...args,
    custodyRef,
    authorizationDigest,
    paymentIdentityDigest,
    state: 'prepared',
    preparedAt: Date.now(),
    evidenceRefs: [],
  })
  return {
    custodyRef,
    authorizationDigest,
    ...(args.custodyBudgetRef === undefined ? {} : { custodyBudgetRef: args.custodyBudgetRef }),
    ...(args.custodyGeneration === undefined ? {} : { custodyGeneration: args.custodyGeneration }),
    ...(args.custodyDailyMaximumUnits === undefined ? {} : { custodyDailyMaximumUnits: args.custodyDailyMaximumUnits }),
  }
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
  // A digest or a partial authorization is evidence that another signer has
  // already crossed the one-authorization boundary. Do not mint a second
  // EIP-3009 nonce while the first result is unavailable.
  if (
    row.paymentSignatureDigest !== undefined
    || row.paymentPayer !== undefined
    || row.paymentNonce !== undefined
    || row.paymentSigningClaimedAt !== undefined
  ) return { kind: 'pending' }
  await ctx.db.patch(row._id, { paymentSigningClaimedAt: Date.now() })
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
  } catch {
    throw new Error('x402_payment_unsigned_material_invalid')
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

export async function markX402PaymentPossiblySubmittedHandler(
  ctx: MutationCtx,
  args: MarkPossiblySubmittedArgs,
): Promise<null> {
  const row = await loadByCustody(ctx, args.custodyRef)
  if (row === null || !eventAttributionValid(row, args as EventArgs)) {
    throw new Error('x402_payment_attempt_attribution_invalid')
  }
  if (
    args.settlementStatus !== undefined
    && row.settlementStatus !== undefined
    && row.settlementStatus !== args.settlementStatus
  ) throw new Error('x402_payment_settlement_identity_conflict')
  if (
    args.settlementDigest !== undefined
    && row.paymentResponseDigest !== undefined
    && row.paymentResponseDigest !== args.settlementDigest
  ) throw new Error('x402_payment_response_identity_conflict')
  if (row.state !== 'prepared') return null
  await ctx.db.patch(row._id, {
    state: 'possibly_submitted',
    submissionStartedAt: Date.now(),
  })
  return null
}
