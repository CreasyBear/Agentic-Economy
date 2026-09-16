import { v, type Infer } from 'convex/values'

import { degradeBackend } from '../../src/lib/observability/degrade-backend'
import { canonicalDigest, isCanonicalDigest } from '../../src/modules/common/canonical-digest'
import { containsForbiddenSignatureKey } from '../../src/modules/common/forbidden-signature-key'
import { isRecord } from '../../src/modules/common/is-record'
import { stableStringify } from '../../src/modules/common/stable-hash'
import type { StableHashValue } from '../../src/modules/common/stable-hash'
import {
  x402PaymentAuthorizationFailureCodeValue,
  x402PaymentAuthorizationFailureDetailValue,
} from '../../src/modules/money/schema'
import { parseBoundedJson } from '../../src/modules/common/bounded-json'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'
import { recordMarketEvidenceFact } from '../marketEvidence'

export const x402PaymentSettlementStatusValue = v.union(
  v.literal('settled'),
  v.literal('not_settled'),
  v.literal('unknown'),
)

export const x402PaymentEventArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  paymentIdentifier: v.string(),
  challengeDigest: v.string(),
  scheme: v.string(),
  network: v.string(),
  asset: v.string(),
  payTo: v.string(),
  amountUnits: v.string(),
  currency: v.string(),
  exponent: v.number(),
  providerEndpoint: v.string(),
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  settlementStatus: v.optional(x402PaymentSettlementStatusValue),
  settlementDigest: v.optional(v.string()),
}

export type AttemptRow = Doc<'moneyX402PaymentAttempts'>

export type EventArgs = {
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
  paymentIdentifier: string
  challengeDigest: string
  scheme: string
  network: string
  asset: string
  payTo: string
  amountUnits: string
  currency: string
  exponent: number
  providerEndpoint: string
  custodyRef: string
  authorizationDigest: string
}

export function expectedCustodyGenerationMatches(
  row: AttemptRow,
  expected: number | undefined,
): boolean {
  const managedFields = [
    row.custodyBudgetRef,
    row.custodyGeneration,
    row.custodyDailyMaximumUnits,
  ]
  const managedCount = managedFields.filter((value) => value !== undefined).length
  if (managedCount === 0) return expected === undefined
  return managedCount === managedFields.length
    && expected !== undefined
    && expected === row.custodyGeneration
}

export async function loadByAttempt(
  ctx: QueryCtx | MutationCtx,
  attemptRef: string,
  effectGeneration: number,
): Promise<AttemptRow | null> {
  return await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_attemptRef_and_effectGeneration', (query) => (
      query.eq('attemptRef', attemptRef).eq('effectGeneration', effectGeneration)
    ))
    .unique()
}

export async function loadByCustody(
  ctx: QueryCtx | MutationCtx,
  custodyRef: string,
): Promise<AttemptRow | null> {
  return await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_custodyRef', (query) => query.eq('custodyRef', custodyRef))
    .unique()
}

export function eventAttributionValid(row: AttemptRow, args: EventArgs): boolean {
  return (
    row.dispatchRef === args.dispatchRef
    && row.attemptRef === args.attemptRef
    && row.effectGeneration === args.effectGeneration
    && row.paymentIdentifier === args.paymentIdentifier
    && row.challengeDigest === args.challengeDigest
    && row.scheme === args.scheme
    && row.network === args.network
    && row.asset === args.asset
    && row.payTo === args.payTo
    && row.amountUnits === args.amountUnits
    && row.currency === args.currency
    && row.exponent === args.exponent
    && row.providerEndpoint === args.providerEndpoint
    && row.authorizationDigest === args.authorizationDigest
  )
}

const paymentSigningIdempotencyKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const paymentAuthorizationValidBeforePattern = /^(?:0|[1-9][0-9]*)$/
export const X402_PAYMENT_SIGNING_CLAIM_LEASE_MS = 30_000

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
  } catch (cause) {
    return degradeBackend(cause, undefined, {
      site: 'paymentAuthorizationExpiryFromValidBefore',
      reason: 'invalid_response',
    })
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
  } catch (cause) {
    return degradeBackend(cause, undefined, {
      site: 'paymentAuthorizationExpiryFromValidBefore',
      reason: 'invalid_response',
    })
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
  } catch (cause) {
    return degradeBackend(cause, undefined, {
      site: 'canonicalUnsignedMaterialJson',
      reason: 'invalid_response',
    })
  }
}

export const prepareX402PaymentAuthorizationArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  toolRef: v.optional(v.string()),
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
  toolRef?: string
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
    && row.toolRef === args.toolRef
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

export const x402PaymentAuthorizationFailureCode = x402PaymentAuthorizationFailureCodeValue

export type X402PaymentAuthorizationFailureCode = Infer<
  typeof x402PaymentAuthorizationFailureCode
>
export const x402PaymentAuthorizationFailureDetail = x402PaymentAuthorizationFailureDetailValue
export type X402PaymentAuthorizationFailureDetail = Infer<
  typeof x402PaymentAuthorizationFailureDetail
>

export const recordX402PaymentAuthorizationFailureArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  code: x402PaymentAuthorizationFailureCode,
  detail: v.optional(x402PaymentAuthorizationFailureDetail),
}

export const recordX402PaymentAuthorizationFailureReturns = v.null()

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
type RecordAuthorizationFailureArgs = {
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
  code: X402PaymentAuthorizationFailureCode
  detail?: X402PaymentAuthorizationFailureDetail
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

export async function recordX402PaymentAuthorizationFailureHandler(
  ctx: MutationCtx,
  args: RecordAuthorizationFailureArgs,
): Promise<null> {
  const row = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
  if (row === null || row.dispatchRef !== args.dispatchRef) {
    throw new Error('x402_payment_attempt_attribution_invalid')
  }
  if (
    row.state !== 'prepared'
    || row.submissionStartedAt !== undefined
    || row.paymentSignatureDigest !== undefined
  ) throw new Error('x402_payment_authorization_failure_state_invalid')
  if (args.code !== 'provider_authority_invalid' && args.detail !== undefined) {
    throw new Error('x402_payment_authorization_failure_detail_invalid')
  }
  if (
    row.authorizationFailureCode === args.code
    && row.authorizationFailureDetail === args.detail
  ) {
    return null
  }
  await ctx.db.patch(row._id, {
    authorizationFailureCode: args.code,
    ...(args.detail === undefined
      ? { authorizationFailureDetail: undefined }
      : { authorizationFailureDetail: args.detail }),
    authorizationFailureObservedAt: Date.now(),
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

export const observeX402PaymentAttemptArgs = {
  ...x402PaymentEventArgs,
  state: v.union(v.literal('observed'), v.literal('reconciliation_required')),
  evidenceRefs: v.array(v.string()),
}

export const observeX402PaymentAttemptReturns = v.null()

export const recordX402PaymentObservationArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  paymentIdentifier: v.string(),
  toolRef: v.string(),
  inputDigest: v.string(),
  transportObservationDigest: v.string(),
  transportRequestDigest: v.string(),
  paymentObservationDigest: v.string(),
  settlementStatus: x402PaymentSettlementStatusValue,
  paymentResponseDigest: v.optional(v.string()),
  quarantinedResponseDigest: v.optional(v.string()),
  quarantinedOutputJson: v.optional(v.string()),
  observedAt: v.number(),
}

export const recordX402PaymentObservationReturns = v.null()

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

type ObserveArgs = EventArgs & {
  settlementStatus?: 'settled' | 'not_settled' | 'unknown'
  settlementDigest?: string
  state: 'observed' | 'reconciliation_required'
  evidenceRefs: string[]
}
type RecordObservationArgs = {
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
  paymentIdentifier: string
  toolRef: string
  inputDigest: string
  transportObservationDigest: string
  transportRequestDigest: string
  paymentObservationDigest: string
  settlementStatus: 'settled' | 'not_settled' | 'unknown'
  paymentResponseDigest?: string
  quarantinedResponseDigest?: string
  quarantinedOutputJson?: string
  observedAt: number
}
type ReconcileArgs = {
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
  toolRef: string
  inputDigest: string
  evidenceRef: string
  evidenceDigest: string
  reservationRef: string
  paymentIdentifier: string
  challengeDigest: string
  settlementStatus: 'settled' | 'not_settled'
  amountUnits: string
  currency: string
  exponent: number
  paymentResponseDigest: string
  transportObservationDigest: string
  transportRequestDigest: string
  paymentObservationDigest: string
  observedAt: number
}
type ReconcileResult = Infer<typeof reconcileX402PaymentAttemptReturns>

const MAX_QUARANTINED_OUTPUT_BYTES = 512 * 1024

type QuarantinedOutput = Readonly<{
  responseDigest: string
  outputJson: string
}>

function quarantinedOutputFromArgs(args: RecordObservationArgs): QuarantinedOutput | undefined {
  const responseDigest = args.quarantinedResponseDigest
  const outputJson = args.quarantinedOutputJson
  if ((responseDigest === undefined) !== (outputJson === undefined)) {
    throw new Error('x402_payment_quarantined_output_invalid')
  }
  if (responseDigest === undefined || outputJson === undefined) return undefined
  if (
    args.settlementStatus !== 'unknown'
    || !isCanonicalDigest(responseDigest)
    || new TextEncoder().encode(outputJson).byteLength
      > MAX_QUARANTINED_OUTPUT_BYTES
  ) throw new Error('x402_payment_quarantined_output_invalid')
  const parsed = parseBoundedJson(outputJson)
  if (
    parsed === undefined
    || JSON.stringify(parsed) !== outputJson
  ) throw new Error('x402_payment_quarantined_output_invalid')
  return {
    responseDigest,
    outputJson,
  }
}

function quarantinedOutputFromRow(
  row: Readonly<{
    quarantinedResponseDigest?: string
    quarantinedOutputJson?: string
  }>,
): QuarantinedOutput | undefined {
  const responseDigest = row.quarantinedResponseDigest
  const outputJson = row.quarantinedOutputJson
  if ((responseDigest === undefined) !== (outputJson === undefined)) {
    throw new Error('x402_payment_quarantined_output_conflict')
  }
  if (responseDigest === undefined || outputJson === undefined) return undefined
  return {
    responseDigest,
    outputJson,
  }
}

function sameQuarantinedOutput(
  left: QuarantinedOutput | undefined,
  right: QuarantinedOutput | undefined,
): boolean {
  return left?.responseDigest === right?.responseDigest
    && left?.outputJson === right?.outputJson
}

export async function observeX402PaymentAttemptHandler(
  ctx: MutationCtx,
  args: ObserveArgs,
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
  const targetState = args.settlementStatus === 'unknown' ? 'reconciliation_required' : args.state
  if (row.state === 'observed' || row.state === 'reconciliation_required') {
    const sameEvidence = (
      row.state === targetState
      && (row.settlementStatus ?? undefined) === args.settlementStatus
      && (row.paymentResponseDigest ?? undefined) === args.settlementDigest
      && row.evidenceRefs.length === args.evidenceRefs.length
      && row.evidenceRefs.every((ref, index) => ref === args.evidenceRefs[index])
    )
    if (sameEvidence) return null
    throw new Error('x402_payment_attempt_observation_state_invalid')
  }
  if (row.state !== 'possibly_submitted') {
    throw new Error('x402_payment_attempt_observation_state_invalid')
  }
  await ctx.db.patch(row._id, {
    state: targetState,
    ...(args.settlementStatus === undefined ? {} : { settlementStatus: args.settlementStatus }),
    ...(args.settlementDigest === undefined ? {} : { paymentResponseDigest: args.settlementDigest }),
    observedAt: Date.now(),
    evidenceRefs: args.evidenceRefs,
  })
  if (args.settlementStatus === 'settled') {
    await recordMarketEvidenceFact(ctx, 'ae_settlement', `${row.attemptRef}:${row.effectGeneration}`, Date.now())
  }
  if (args.settlementStatus === 'unknown') {
    await recordMarketEvidenceFact(ctx, 'ae_reconciliation_required', `${row.attemptRef}:${row.effectGeneration}`, Date.now())
  }
  return null
}

export async function recordX402PaymentObservationHandler(
  ctx: MutationCtx,
  args: RecordObservationArgs,
): Promise<null> {
  const quarantinedOutput = quarantinedOutputFromArgs(args)
  const row = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
  if (
    row === null
    || row.dispatchRef !== args.dispatchRef
    || row.paymentIdentifier !== args.paymentIdentifier
    || (row.toolRef !== undefined && row.toolRef !== args.toolRef)
    || (row.inputDigest !== undefined && row.inputDigest !== args.inputDigest)
    || (
      row.state !== 'prepared'
      && row.state !== 'possibly_submitted'
      && row.state !== 'observed'
      && row.state !== 'reconciliation_required'
    )
  ) throw new Error('x402_payment_observation_attribution_invalid')
  if (
    row.settlementStatus !== undefined
    && row.settlementStatus !== args.settlementStatus
  ) throw new Error('x402_payment_settlement_identity_conflict')
  if (
    row.paymentResponseDigest !== undefined
    && row.paymentResponseDigest !== args.paymentResponseDigest
  ) throw new Error('x402_payment_response_identity_conflict')
  const persistedQuarantinedOutput = quarantinedOutputFromRow(row)
  const targetState = args.settlementStatus === 'unknown' ? 'reconciliation_required' : 'observed'
  if (row.state === 'observed' || row.state === 'reconciliation_required') {
    if (row.state !== targetState) {
      throw new Error('x402_payment_attempt_observation_state_invalid')
    }
    if (row.settlementStatus !== args.settlementStatus) {
      throw new Error('x402_payment_settlement_identity_conflict')
    }
    if (row.paymentResponseDigest !== args.paymentResponseDigest) {
      throw new Error('x402_payment_response_identity_conflict')
    }
    const observationDigests = [
      row.paymentObservationDigest,
      row.transportObservationDigest,
      row.transportRequestDigest,
    ]
    const missingObservationDigests = observationDigests.every((value) => value === undefined)
    if (missingObservationDigests) {
      if (
        persistedQuarantinedOutput !== undefined
        && !sameQuarantinedOutput(persistedQuarantinedOutput, quarantinedOutput)
      ) throw new Error('x402_payment_quarantined_output_conflict')
      await ctx.db.patch(row._id, {
        toolRef: args.toolRef,
        inputDigest: args.inputDigest,
        paymentObservationDigest: args.paymentObservationDigest,
        transportObservationDigest: args.transportObservationDigest,
        transportRequestDigest: args.transportRequestDigest,
        ...(persistedQuarantinedOutput === undefined && quarantinedOutput !== undefined
          ? {
              quarantinedResponseDigest: quarantinedOutput.responseDigest,
              quarantinedOutputJson: quarantinedOutput.outputJson,
            }
          : {}),
        observedAt: args.observedAt,
      })
      return null
    }
    if (
      row.toolRef !== args.toolRef
      || row.inputDigest !== args.inputDigest
      || row.paymentObservationDigest !== args.paymentObservationDigest
      || row.transportObservationDigest !== args.transportObservationDigest
      || row.transportRequestDigest !== args.transportRequestDigest
    ) throw new Error('x402_payment_observation_attribution_invalid')
    if (!sameQuarantinedOutput(persistedQuarantinedOutput, quarantinedOutput)) {
      throw new Error('x402_payment_quarantined_output_conflict')
    }
    return null
  }
  if (persistedQuarantinedOutput !== undefined) {
    throw new Error('x402_payment_quarantined_output_conflict')
  }
  await ctx.db.patch(row._id, {
    state: targetState,
    toolRef: args.toolRef,
    paymentObservationDigest: args.paymentObservationDigest,
    inputDigest: args.inputDigest,
    transportObservationDigest: args.transportObservationDigest,
    transportRequestDigest: args.transportRequestDigest,
    settlementStatus: args.settlementStatus,
    ...(args.paymentResponseDigest === undefined ? {} : { paymentResponseDigest: args.paymentResponseDigest }),
    ...(quarantinedOutput === undefined
      ? {}
      : {
          quarantinedResponseDigest: quarantinedOutput.responseDigest,
          quarantinedOutputJson: quarantinedOutput.outputJson,
        }),
    observedAt: args.observedAt,
  })
  if (args.settlementStatus === 'settled') {
    await recordMarketEvidenceFact(ctx, 'ae_settlement', `${args.attemptRef}:${args.effectGeneration}`, args.observedAt)
  }
  if (args.settlementStatus === 'unknown') {
    await recordMarketEvidenceFact(ctx, 'ae_reconciliation_required', `${args.attemptRef}:${args.effectGeneration}`, args.observedAt)
  }
  return null
}

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
  const mismatch = row.dispatchRef !== args.dispatchRef
    ? 'dispatch_ref'
    : row.toolRef !== args.toolRef
      ? 'tool_ref'
      : row.inputDigest !== args.inputDigest
          ? 'input_digest'
          : row.reservationRef !== args.reservationRef
            ? 'reservation_ref'
            : row.paymentIdentifier !== args.paymentIdentifier
              ? 'payment_identifier'
              : row.challengeDigest !== args.challengeDigest
                ? 'challenge_digest'
                : row.amountUnits !== args.amountUnits
                  ? 'amount_units'
                  : row.currency !== args.currency
                    ? 'currency'
                    : row.exponent !== args.exponent
                      ? 'exponent'
                      : row.transportObservationDigest !== args.transportObservationDigest
                        ? 'transport_observation_digest'
                        : row.transportRequestDigest !== args.transportRequestDigest
                          ? 'transport_request_digest'
                          : row.paymentObservationDigest !== args.paymentObservationDigest
                            ? 'payment_observation_digest'
                            : row.settlementStatus !== undefined
                              && row.settlementStatus !== 'unknown'
                              && row.settlementStatus !== args.settlementStatus
                              ? 'settlement_status'
                              : row.state !== 'observed' && row.state !== 'reconciliation_required'
                                ? 'attempt_state'
                                : undefined
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

const attemptStateValue = v.union(
  v.literal('prepared'),
  v.literal('possibly_submitted'),
  v.literal('observed'),
  v.literal('reconciliation_required'),
)

const x402PaymentAuthorizationMaterial = v.object({
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  toolRef: v.optional(v.string()),
  inputDigest: v.optional(v.string()),
  paymentIdentifier: v.string(),
  challengeDigest: v.string(),
  challengeJson: v.string(),
  selectedRequirementJson: v.string(),
  providerEndpoint: v.string(),
  scheme: v.string(),
  network: v.string(),
  asset: v.string(),
  payTo: v.string(),
  credentialRef: v.string(),
  amountUnits: v.string(),
  currency: v.string(),
  exponent: v.number(),
  custodyRef: v.string(),
  custodyBudgetRef: v.optional(v.string()),
  custodyGeneration: v.optional(v.number()),
  custodyDailyMaximumUnits: v.optional(v.string()),
  authorizationDigest: v.string(),
  reservationRef: v.optional(v.string()),
  paymentIdentityDigest: v.optional(v.string()),
  paymentSignatureDigest: v.optional(v.string()),
  requestFingerprint: v.optional(v.string()),
  paymentUnsignedMaterialJson: v.optional(v.string()),
  paymentUnsignedMaterialDigest: v.optional(v.string()),
  paymentSigningIdempotencyKey: v.optional(v.string()),
  paymentPayer: v.optional(v.string()),
  paymentNonce: v.optional(v.string()),
  paymentAuthorizationValidBefore: v.optional(v.string()),
  paymentAuthorizationExpiresAt: v.optional(v.number()),
  paymentSigningClaimedAt: v.optional(v.number()),
  authorizationFailureCode: v.optional(x402PaymentAuthorizationFailureCodeValue),
  authorizationFailureDetail: v.optional(x402PaymentAuthorizationFailureDetailValue),
  authorizationFailureObservedAt: v.optional(v.number()),
  state: attemptStateValue,
  transportObservationDigest: v.optional(v.string()),
  transportRequestDigest: v.optional(v.string()),
  paymentObservationDigest: v.optional(v.string()),
  settlementStatus: v.optional(x402PaymentSettlementStatusValue),
  paymentResponseDigest: v.optional(v.string()),
  reconciliationEvidenceRef: v.optional(v.string()),
  reconciliationEvidenceDigest: v.optional(v.string()),
})

export const readX402PaymentAuthorizationArgs = {
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  requestFingerprint: v.optional(v.string()),
  custodyGeneration: v.optional(v.number()),
}

export const readX402PaymentAuthorizationReturns = v.union(
  x402PaymentAuthorizationMaterial,
  v.null(),
)

export const readX402PaymentAuthorizationByDigestArgs = {
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  requestFingerprint: v.optional(v.string()),
  custodyGeneration: v.optional(v.number()),
}

export const readX402PaymentAuthorizationByDigestReturns = v.union(
  x402PaymentAuthorizationMaterial,
  v.null(),
)

const x402PaymentAttemptReadValue = v.object({
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  toolRef: v.optional(v.string()),
  inputDigest: v.optional(v.string()),
  paymentIdentifier: v.string(),
  operationKeyDigest: v.string(),
  challengeDigest: v.string(),
  challengeJson: v.string(),
  selectedRequirementJson: v.string(),
  providerEndpoint: v.string(),
  scheme: v.string(),
  network: v.string(),
  asset: v.string(),
  payTo: v.string(),
  amountUnits: v.string(),
  currency: v.string(),
  exponent: v.number(),
  credentialRef: v.string(),
  custodyRef: v.string(),
  custodyBudgetRef: v.optional(v.string()),
  custodyGeneration: v.optional(v.number()),
  custodyDailyMaximumUnits: v.optional(v.string()),
  authorizationDigest: v.string(),
  reservationRef: v.optional(v.string()),
  paymentIdentityDigest: v.optional(v.string()),
  paymentSignatureDigest: v.optional(v.string()),
  requestFingerprint: v.optional(v.string()),
  paymentUnsignedMaterialJson: v.optional(v.string()),
  paymentUnsignedMaterialDigest: v.optional(v.string()),
  paymentSigningIdempotencyKey: v.optional(v.string()),
  paymentPayer: v.optional(v.string()),
  paymentNonce: v.optional(v.string()),
  paymentAuthorizationValidBefore: v.optional(v.string()),
  paymentAuthorizationExpiresAt: v.optional(v.number()),
  paymentSigningClaimedAt: v.optional(v.number()),
  authorizationFailureCode: v.optional(x402PaymentAuthorizationFailureCodeValue),
  authorizationFailureDetail: v.optional(x402PaymentAuthorizationFailureDetailValue),
  authorizationFailureObservedAt: v.optional(v.number()),
  state: attemptStateValue,
  preparedAt: v.number(),
  submissionStartedAt: v.optional(v.number()),
  observedAt: v.optional(v.number()),
  transportObservationDigest: v.optional(v.string()),
  transportRequestDigest: v.optional(v.string()),
  paymentObservationDigest: v.optional(v.string()),
  settlementStatus: v.optional(x402PaymentSettlementStatusValue),
  paymentResponseDigest: v.optional(v.string()),
  quarantinedResponseDigest: v.optional(v.string()),
  quarantinedOutputJson: v.optional(v.string()),
  reconciliationEvidenceRef: v.optional(v.string()),
  reconciliationEvidenceDigest: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
})

export const readX402PaymentAttemptArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
}

export const readX402PaymentAttemptReturns = v.union(
  x402PaymentAttemptReadValue,
  v.null(),
)

const expiredPreparedX402PaymentAttemptValue = v.object({
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  reservationRef: v.optional(v.string()),
  paymentAuthorizationExpiresAt: v.number(),
})

export const listExpiredPreparedX402PaymentAttemptsArgs = {
  now: v.number(),
  limit: v.number(),
}

export const listExpiredPreparedX402PaymentAttemptsReturns = v.array(
  expiredPreparedX402PaymentAttemptValue,
)

type ReadAuthorizationArgs = {
  custodyRef: string
  authorizationDigest: string
  requestFingerprint?: string
  custodyGeneration?: number
}
type ReadAuthorizationByDigestArgs = {
  custodyRef: string
  authorizationDigest: string
  requestFingerprint?: string
  custodyGeneration?: number
}
type ReadAttemptArgs = {
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
}
type ListExpiredPreparedArgs = {
  now: number
  limit: number
}

async function loadByAuthorizationDigest(
  ctx: QueryCtx,
  authorizationDigest: string,
): Promise<AttemptRow | null> {
  return await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_authorizationDigest', (query) => (
      query.eq('authorizationDigest', authorizationDigest)
    ))
    .unique()
}

function authorizationMaterial(row: AttemptRow): Infer<typeof x402PaymentAuthorizationMaterial> {
  return {
    dispatchRef: row.dispatchRef,
    attemptRef: row.attemptRef,
    effectGeneration: row.effectGeneration,
    ...(row.toolRef === undefined ? {} : { toolRef: row.toolRef }),
    ...(row.inputDigest === undefined ? {} : { inputDigest: row.inputDigest }),
    paymentIdentifier: row.paymentIdentifier,
    challengeDigest: row.challengeDigest,
    challengeJson: row.challengeJson,
    selectedRequirementJson: row.selectedRequirementJson,
    providerEndpoint: row.providerEndpoint,
    scheme: row.scheme,
    network: row.network,
    asset: row.asset,
    payTo: row.payTo,
    credentialRef: row.credentialRef,
    amountUnits: row.amountUnits,
    currency: row.currency,
    exponent: row.exponent,
    custodyRef: row.custodyRef,
    ...(row.custodyBudgetRef === undefined ? {} : { custodyBudgetRef: row.custodyBudgetRef }),
    ...(row.custodyGeneration === undefined ? {} : { custodyGeneration: row.custodyGeneration }),
    ...(row.custodyDailyMaximumUnits === undefined ? {} : { custodyDailyMaximumUnits: row.custodyDailyMaximumUnits }),
    authorizationDigest: row.authorizationDigest,
    ...(row.reservationRef === undefined ? {} : { reservationRef: row.reservationRef }),
    ...(row.paymentIdentityDigest === undefined ? {} : { paymentIdentityDigest: row.paymentIdentityDigest }),
    ...(row.paymentSignatureDigest === undefined ? {} : { paymentSignatureDigest: row.paymentSignatureDigest }),
    ...(row.requestFingerprint === undefined ? {} : { requestFingerprint: row.requestFingerprint }),
    ...(row.paymentUnsignedMaterialJson === undefined ? {} : { paymentUnsignedMaterialJson: row.paymentUnsignedMaterialJson }),
    ...(row.paymentUnsignedMaterialDigest === undefined ? {} : { paymentUnsignedMaterialDigest: row.paymentUnsignedMaterialDigest }),
    ...(row.paymentSigningIdempotencyKey === undefined ? {} : { paymentSigningIdempotencyKey: row.paymentSigningIdempotencyKey }),
    ...(row.paymentPayer === undefined ? {} : { paymentPayer: row.paymentPayer }),
    ...(row.paymentNonce === undefined ? {} : { paymentNonce: row.paymentNonce }),
    ...(row.paymentAuthorizationValidBefore === undefined ? {} : { paymentAuthorizationValidBefore: row.paymentAuthorizationValidBefore }),
    ...(row.paymentAuthorizationExpiresAt === undefined ? {} : { paymentAuthorizationExpiresAt: row.paymentAuthorizationExpiresAt }),
    ...(row.paymentSigningClaimedAt === undefined ? {} : { paymentSigningClaimedAt: row.paymentSigningClaimedAt }),
    ...(row.authorizationFailureCode === undefined ? {} : { authorizationFailureCode: row.authorizationFailureCode }),
    ...(row.authorizationFailureDetail === undefined ? {} : { authorizationFailureDetail: row.authorizationFailureDetail }),
    ...(row.authorizationFailureObservedAt === undefined ? {} : { authorizationFailureObservedAt: row.authorizationFailureObservedAt }),
    state: row.state,
    ...(row.transportObservationDigest === undefined ? {} : { transportObservationDigest: row.transportObservationDigest }),
    ...(row.transportRequestDigest === undefined ? {} : { transportRequestDigest: row.transportRequestDigest }),
    ...(row.paymentObservationDigest === undefined ? {} : { paymentObservationDigest: row.paymentObservationDigest }),
    ...(row.settlementStatus === undefined ? {} : { settlementStatus: row.settlementStatus }),
    ...(row.paymentResponseDigest === undefined ? {} : { paymentResponseDigest: row.paymentResponseDigest }),
    ...(row.reconciliationEvidenceRef === undefined ? {} : { reconciliationEvidenceRef: row.reconciliationEvidenceRef }),
    ...(row.reconciliationEvidenceDigest === undefined ? {} : { reconciliationEvidenceDigest: row.reconciliationEvidenceDigest }),
  }
}

function attemptRead(row: AttemptRow): Infer<typeof x402PaymentAttemptReadValue> {
  const hasQuarantinedResponseDigest = row.quarantinedResponseDigest !== undefined
  const hasQuarantinedOutputJson = row.quarantinedOutputJson !== undefined
  if (hasQuarantinedResponseDigest !== hasQuarantinedOutputJson) {
    throw new Error('x402_payment_quarantined_output_conflict')
  }
  return {
    dispatchRef: row.dispatchRef,
    attemptRef: row.attemptRef,
    effectGeneration: row.effectGeneration,
    ...(row.toolRef === undefined ? {} : { toolRef: row.toolRef }),
    ...(row.inputDigest === undefined ? {} : { inputDigest: row.inputDigest }),
    paymentIdentifier: row.paymentIdentifier,
    operationKeyDigest: row.operationKeyDigest,
    challengeDigest: row.challengeDigest,
    challengeJson: row.challengeJson,
    selectedRequirementJson: row.selectedRequirementJson,
    providerEndpoint: row.providerEndpoint,
    scheme: row.scheme,
    network: row.network,
    asset: row.asset,
    payTo: row.payTo,
    amountUnits: row.amountUnits,
    currency: row.currency,
    exponent: row.exponent,
    credentialRef: row.credentialRef,
    custodyRef: row.custodyRef,
    ...(row.custodyBudgetRef === undefined ? {} : { custodyBudgetRef: row.custodyBudgetRef }),
    ...(row.custodyGeneration === undefined ? {} : { custodyGeneration: row.custodyGeneration }),
    ...(row.custodyDailyMaximumUnits === undefined ? {} : { custodyDailyMaximumUnits: row.custodyDailyMaximumUnits }),
    authorizationDigest: row.authorizationDigest,
    ...(row.reservationRef === undefined ? {} : { reservationRef: row.reservationRef }),
    ...(row.paymentIdentityDigest === undefined ? {} : { paymentIdentityDigest: row.paymentIdentityDigest }),
    ...(row.paymentSignatureDigest === undefined ? {} : { paymentSignatureDigest: row.paymentSignatureDigest }),
    ...(row.requestFingerprint === undefined ? {} : { requestFingerprint: row.requestFingerprint }),
    ...(row.paymentUnsignedMaterialJson === undefined ? {} : { paymentUnsignedMaterialJson: row.paymentUnsignedMaterialJson }),
    ...(row.paymentUnsignedMaterialDigest === undefined ? {} : { paymentUnsignedMaterialDigest: row.paymentUnsignedMaterialDigest }),
    ...(row.paymentSigningIdempotencyKey === undefined ? {} : { paymentSigningIdempotencyKey: row.paymentSigningIdempotencyKey }),
    ...(row.paymentPayer === undefined ? {} : { paymentPayer: row.paymentPayer }),
    ...(row.paymentNonce === undefined ? {} : { paymentNonce: row.paymentNonce }),
    ...(row.paymentAuthorizationValidBefore === undefined ? {} : { paymentAuthorizationValidBefore: row.paymentAuthorizationValidBefore }),
    ...(row.paymentAuthorizationExpiresAt === undefined ? {} : { paymentAuthorizationExpiresAt: row.paymentAuthorizationExpiresAt }),
    ...(row.paymentSigningClaimedAt === undefined ? {} : { paymentSigningClaimedAt: row.paymentSigningClaimedAt }),
    ...(row.authorizationFailureCode === undefined ? {} : { authorizationFailureCode: row.authorizationFailureCode }),
    ...(row.authorizationFailureDetail === undefined ? {} : { authorizationFailureDetail: row.authorizationFailureDetail }),
    ...(row.authorizationFailureObservedAt === undefined ? {} : { authorizationFailureObservedAt: row.authorizationFailureObservedAt }),
    state: row.state,
    preparedAt: row.preparedAt,
    ...(row.submissionStartedAt === undefined ? {} : { submissionStartedAt: row.submissionStartedAt }),
    ...(row.observedAt === undefined ? {} : { observedAt: row.observedAt }),
    ...(row.transportObservationDigest === undefined ? {} : { transportObservationDigest: row.transportObservationDigest }),
    ...(row.transportRequestDigest === undefined ? {} : { transportRequestDigest: row.transportRequestDigest }),
    ...(row.paymentObservationDigest === undefined ? {} : { paymentObservationDigest: row.paymentObservationDigest }),
    ...(row.settlementStatus === undefined ? {} : { settlementStatus: row.settlementStatus }),
    ...(row.paymentResponseDigest === undefined ? {} : { paymentResponseDigest: row.paymentResponseDigest }),
    ...(row.quarantinedResponseDigest === undefined || row.quarantinedOutputJson === undefined
      ? {}
      : {
          quarantinedResponseDigest: row.quarantinedResponseDigest,
          quarantinedOutputJson: row.quarantinedOutputJson,
        }),
    ...(row.reconciliationEvidenceRef === undefined ? {} : { reconciliationEvidenceRef: row.reconciliationEvidenceRef }),
    ...(row.reconciliationEvidenceDigest === undefined ? {} : { reconciliationEvidenceDigest: row.reconciliationEvidenceDigest }),
    evidenceRefs: row.evidenceRefs,
  }
}

export async function readX402PaymentAuthorizationHandler(
  ctx: QueryCtx,
  args: ReadAuthorizationArgs,
): Promise<Infer<typeof readX402PaymentAuthorizationReturns>> {
  const row = await loadByCustody(ctx, args.custodyRef)
  if (row === null || row.authorizationDigest !== args.authorizationDigest) return null
  if (!expectedCustodyGenerationMatches(row, args.custodyGeneration)) return null
  if (
    args.requestFingerprint !== undefined
    && row.requestFingerprint !== args.requestFingerprint
  ) throw new Error('x402_payment_request_fingerprint_conflict')
  return authorizationMaterial(row)
}

export async function readX402PaymentAuthorizationByDigestHandler(
  ctx: QueryCtx,
  args: ReadAuthorizationByDigestArgs,
): Promise<Infer<typeof readX402PaymentAuthorizationByDigestReturns>> {
  const row = await loadByAuthorizationDigest(ctx, args.authorizationDigest)
  if (row === null || row.custodyRef !== args.custodyRef) return null
  if (!expectedCustodyGenerationMatches(row, args.custodyGeneration)) return null
  if (
    args.requestFingerprint !== undefined
    && row.requestFingerprint !== args.requestFingerprint
  ) throw new Error('x402_payment_request_fingerprint_conflict')
  return authorizationMaterial(row)
}

export async function readX402PaymentAttemptHandler(
  ctx: QueryCtx,
  args: ReadAttemptArgs,
): Promise<Infer<typeof readX402PaymentAttemptReturns>> {
  const row = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
  if (row === null || row.dispatchRef !== args.dispatchRef) return null
  return attemptRead(row)
}

export async function listExpiredPreparedX402PaymentAttemptsHandler(
  ctx: QueryCtx,
  args: ListExpiredPreparedArgs,
): Promise<Infer<typeof listExpiredPreparedX402PaymentAttemptsReturns>> {
  if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 25) {
    throw new Error('x402_payment_expired_prepared_limit_invalid')
  }
  const rows = await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_state_and_paymentAuthorizationExpiresAt', (query) => (
      query.eq('state', 'prepared').lte('paymentAuthorizationExpiresAt', args.now)
    ))
    .take(args.limit)
  return rows.flatMap((row) => {
    if (row.paymentAuthorizationExpiresAt === undefined) return []
    return [{
      dispatchRef: row.dispatchRef,
      attemptRef: row.attemptRef,
      effectGeneration: row.effectGeneration,
      custodyRef: row.custodyRef,
      authorizationDigest: row.authorizationDigest,
      ...(row.reservationRef === undefined ? {} : { reservationRef: row.reservationRef }),
      paymentAuthorizationExpiresAt: row.paymentAuthorizationExpiresAt,
    }]
  })
}
