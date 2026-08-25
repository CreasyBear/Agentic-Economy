import { v, type Infer } from 'convex/values'

import type { QueryCtx } from './_generated/server'
import {
  expectedCustodyGenerationMatches,
  loadByAttempt,
  loadByCustody,
  type AttemptRow,
  x402PaymentSettlementStatusValue,
} from './moneyX402PaymentAttemptsShared'

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
  operationRef: v.optional(v.string()),
  inputDigest: v.optional(v.string()),
  paymentIdentifier: v.string(),
  challengeDigest: v.string(),
  challengeJson: v.string(),
  selectedRequirementJson: v.string(),
  providerEndpoint: v.string(),
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
  operationRef: v.optional(v.string()),
  inputDigest: v.optional(v.string()),
  paymentIdentifier: v.string(),
  operationKeyDigest: v.string(),
  challengeDigest: v.string(),
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
  state: attemptStateValue,
  preparedAt: v.number(),
  submissionStartedAt: v.optional(v.number()),
  observedAt: v.optional(v.number()),
  transportObservationDigest: v.optional(v.string()),
  transportRequestDigest: v.optional(v.string()),
  paymentObservationDigest: v.optional(v.string()),
  settlementStatus: v.optional(x402PaymentSettlementStatusValue),
  paymentResponseDigest: v.optional(v.string()),
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
    ...(row.operationRef === undefined ? {} : { operationRef: row.operationRef }),
    ...(row.inputDigest === undefined ? {} : { inputDigest: row.inputDigest }),
    paymentIdentifier: row.paymentIdentifier,
    challengeDigest: row.challengeDigest,
    challengeJson: row.challengeJson,
    selectedRequirementJson: row.selectedRequirementJson,
    providerEndpoint: row.providerEndpoint,
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
  return {
    dispatchRef: row.dispatchRef,
    attemptRef: row.attemptRef,
    effectGeneration: row.effectGeneration,
    ...(row.operationRef === undefined ? {} : { operationRef: row.operationRef }),
    ...(row.inputDigest === undefined ? {} : { inputDigest: row.inputDigest }),
    paymentIdentifier: row.paymentIdentifier,
    operationKeyDigest: row.operationKeyDigest,
    challengeDigest: row.challengeDigest,
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
    state: row.state,
    preparedAt: row.preparedAt,
    ...(row.submissionStartedAt === undefined ? {} : { submissionStartedAt: row.submissionStartedAt }),
    ...(row.observedAt === undefined ? {} : { observedAt: row.observedAt }),
    ...(row.transportObservationDigest === undefined ? {} : { transportObservationDigest: row.transportObservationDigest }),
    ...(row.transportRequestDigest === undefined ? {} : { transportRequestDigest: row.transportRequestDigest }),
    ...(row.paymentObservationDigest === undefined ? {} : { paymentObservationDigest: row.paymentObservationDigest }),
    ...(row.settlementStatus === undefined ? {} : { settlementStatus: row.settlementStatus }),
    ...(row.paymentResponseDigest === undefined ? {} : { paymentResponseDigest: row.paymentResponseDigest }),
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
