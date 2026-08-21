import { v, type Infer } from 'convex/values'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { stableStringify } from '@/modules/common/stable-hash'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { Doc } from './_generated/dataModel'
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'

const x402PaymentSettlementStatusValue = v.union(
  v.literal('settled'),
  v.literal('not_settled'),
  v.literal('unknown'),
)

const attemptStateValue = v.union(
  v.literal('prepared'),
  v.literal('possibly_submitted'),
  v.literal('observed'),
  v.literal('reconciliation_required'),
)

const paymentSigningIdempotencyKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function isPaymentSigningIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && paymentSigningIdempotencyKeyPattern.test(value)
}

function containsForbiddenSignatureKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenSignatureKey)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, child]) => (
    key === 'signature'
    || key === 'paymentSignature'
    || key === 'PAYMENT-SIGNATURE'
    || key === 'Payment-Signature'
    || containsForbiddenSignatureKey(child)
  ))
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

export const x402PaymentPrepareArgs = {
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

const x402PaymentAuthorizationStored = v.object({
  paymentUnsignedMaterialJson: v.string(),
  paymentUnsignedMaterialDigest: v.string(),
  paymentSigningIdempotencyKey: v.string(),
  paymentSignatureDigest: v.string(),
  paymentPayer: v.string(),
  paymentNonce: v.string(),
  requestFingerprint: v.string(),
})

const x402PaymentAuthorizationClaimResult = v.union(
  v.object({ kind: v.literal('claimed') }),
  v.object({
    kind: v.literal('stored'),
    paymentUnsignedMaterialJson: v.string(),
    paymentUnsignedMaterialDigest: v.string(),
    paymentSigningIdempotencyKey: v.string(),
    paymentSignatureDigest: v.string(),
    paymentPayer: v.string(),
    paymentNonce: v.string(),
    requestFingerprint: v.string(),
  }),
  v.object({ kind: v.literal('pending') }),
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

export const x402PaymentObservationArgs = {
  ...x402PaymentEventArgs,
  state: v.union(v.literal('observed'), v.literal('reconciliation_required')),
  evidenceRefs: v.array(v.string()),
}

export const x402PaymentObservationReconciliationArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  operationRef: v.string(),
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

export const x402PaymentObservationReconciliationResult = v.union(
  v.object({
    kind: v.literal('settled'),
    settlementStatus: v.union(v.literal('settled'), v.literal('not_settled')),
  }),
  v.object({ kind: v.literal('reconciliation_required') }),
  v.object({ kind: v.literal('not_found') }),
)

type AttemptRow = Doc<'moneyX402PaymentAttempts'>
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

function expectedCustodyGenerationMatches(
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

async function loadByAttempt(
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

async function loadByCustody(
  ctx: QueryCtx | MutationCtx,
  custodyRef: string,
): Promise<AttemptRow | null> {
  return await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_custodyRef', (query) => query.eq('custodyRef', custodyRef))
    .unique()
}

async function loadByAuthorizationDigest(
  ctx: QueryCtx | MutationCtx,
  authorizationDigest: string,
): Promise<AttemptRow | null> {
  return await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_authorizationDigest', (query) => (
      query.eq('authorizationDigest', authorizationDigest)
    ))
    .unique()
}

async function loadByPaymentIdentifier(
  ctx: QueryCtx | MutationCtx,
  paymentIdentifier: string,
): Promise<readonly AttemptRow[]> {
  return await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_paymentIdentifier', (query) => (
      query.eq('paymentIdentifier', paymentIdentifier)
    ))
    .take(8)
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
    || row.requestFingerprint === undefined
    || !isPaymentSigningIdempotencyKey(row.paymentSigningIdempotencyKey)
  ) return undefined
  return {
    paymentUnsignedMaterialJson: row.paymentUnsignedMaterialJson,
    paymentUnsignedMaterialDigest: row.paymentUnsignedMaterialDigest,
    paymentSigningIdempotencyKey: row.paymentSigningIdempotencyKey,
    paymentSignatureDigest: row.paymentSignatureDigest,
    paymentPayer: row.paymentPayer,
    paymentNonce: row.paymentNonce,
    requestFingerprint: row.requestFingerprint,
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

type EventArgs = {
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

function eventAttributionValid(row: AttemptRow, args: EventArgs): boolean {
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

export const prepareX402PaymentAuthorization = internalMutation({
  args: x402PaymentPrepareArgs,
  returns: v.object({
    custodyRef: v.string(),
    authorizationDigest: v.string(),
    custodyBudgetRef: v.optional(v.string()),
    custodyGeneration: v.optional(v.number()),
    custodyDailyMaximumUnits: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
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
  },
})

export const claimX402PaymentAuthorization = internalMutation({
  args: {
    custodyRef: v.string(),
    authorizationDigest: v.string(),
    requestFingerprint: v.string(),
    custodyGeneration: v.optional(v.number()),
  },
  returns: x402PaymentAuthorizationClaimResult,
  handler: async (ctx, args): Promise<Infer<typeof x402PaymentAuthorizationClaimResult>> => {
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
  },
})

export const recordX402PaymentSigningIntent = internalMutation({
  args: {
    custodyRef: v.string(),
    authorizationDigest: v.string(),
    paymentUnsignedMaterialJson: v.string(),
    paymentUnsignedMaterialDigest: v.string(),
    paymentSigningIdempotencyKey: v.string(),
    paymentPayer: v.string(),
    paymentNonce: v.string(),
    requestFingerprint: v.string(),
    custodyGeneration: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!isPaymentSigningIdempotencyKey(args.paymentSigningIdempotencyKey)) {
      throw new Error('x402_payment_signing_idempotency_key_invalid')
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(args.paymentUnsignedMaterialJson)
    } catch {
      throw new Error('x402_payment_unsigned_material_invalid')
    }
    if (
      canonicalUnsignedMaterialJson(parsed) !== args.paymentUnsignedMaterialJson
      || canonicalDigest(parsed) !== args.paymentUnsignedMaterialDigest
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
    ]
    const hasExistingIntent = existingIntentFields.some((value) => value !== undefined)
    if (hasExistingIntent) {
      if (
        row.paymentUnsignedMaterialJson !== args.paymentUnsignedMaterialJson
        || row.paymentUnsignedMaterialDigest !== args.paymentUnsignedMaterialDigest
        || row.paymentSigningIdempotencyKey !== args.paymentSigningIdempotencyKey
        || row.paymentPayer !== args.paymentPayer
        || row.paymentNonce !== args.paymentNonce
      ) throw new Error('x402_payment_unsigned_identity_conflict')
      return null
    }
    await ctx.db.patch(row._id, {
      paymentUnsignedMaterialJson: args.paymentUnsignedMaterialJson,
      paymentUnsignedMaterialDigest: args.paymentUnsignedMaterialDigest,
      paymentSigningIdempotencyKey: args.paymentSigningIdempotencyKey,
      paymentPayer: args.paymentPayer,
      paymentNonce: args.paymentNonce,
      paymentSigningClaimedAt: row.paymentSigningClaimedAt ?? Date.now(),
    })
    return null
  },
})

export const recordX402PaymentSignatureDigest = internalMutation({
  args: {
    custodyRef: v.string(),
    authorizationDigest: v.string(),
    paymentSignatureDigest: v.string(),
    paymentPayer: v.optional(v.string()),
    paymentNonce: v.optional(v.string()),
    requestFingerprint: v.optional(v.string()),
    custodyGeneration: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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
  },
})

export const readX402PaymentAuthorization = internalQuery({
  args: {
    custodyRef: v.string(),
    authorizationDigest: v.string(),
    requestFingerprint: v.optional(v.string()),
    custodyGeneration: v.optional(v.number()),
  },
  returns: v.union(x402PaymentAuthorizationMaterial, v.null()),
  handler: async (ctx, args) => {
    const row = await loadByCustody(ctx, args.custodyRef)
    if (row === null || row.authorizationDigest !== args.authorizationDigest) return null
    if (!expectedCustodyGenerationMatches(row, args.custodyGeneration)) return null
    if (
      args.requestFingerprint !== undefined
      && row.requestFingerprint !== args.requestFingerprint
    ) throw new Error('x402_payment_request_fingerprint_conflict')
    return authorizationMaterial(row)
  },
})

export const readX402PaymentAuthorizationByDigest = internalQuery({
  args: {
    custodyRef: v.string(),
    authorizationDigest: v.string(),
    requestFingerprint: v.optional(v.string()),
    custodyGeneration: v.optional(v.number()),
  },
  returns: v.union(x402PaymentAuthorizationMaterial, v.null()),
  handler: async (ctx, args) => {
    const row = await loadByAuthorizationDigest(ctx, args.authorizationDigest)
    if (row === null || row.custodyRef !== args.custodyRef) return null
    if (!expectedCustodyGenerationMatches(row, args.custodyGeneration)) return null
    if (
      args.requestFingerprint !== undefined
      && row.requestFingerprint !== args.requestFingerprint
    ) throw new Error('x402_payment_request_fingerprint_conflict')
    return authorizationMaterial(row)
  },
})

export const markX402PaymentPossiblySubmitted = internalMutation({
  args: x402PaymentEventArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await loadByCustody(ctx, args.custodyRef)
    if (row === null || !eventAttributionValid(row, args)) {
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
  },
})

export const observeX402PaymentAttempt = internalMutation({
  args: x402PaymentObservationArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await loadByCustody(ctx, args.custodyRef)
    if (row === null || !eventAttributionValid(row, args)) {
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
    return null
  },
})

export const readX402PaymentAttempt = internalQuery({
  args: {
    dispatchRef: v.string(),
    attemptRef: v.string(),
    effectGeneration: v.number(),
  },
  returns: v.union(x402PaymentAttemptReadValue, v.null()),
  handler: async (ctx, args) => {
    const row = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
    if (row === null || row.dispatchRef !== args.dispatchRef) return null
    return attemptRead(row)
  },
})

export const recordX402PaymentObservation = internalMutation({
  args: {
    dispatchRef: v.string(),
    attemptRef: v.string(),
    effectGeneration: v.number(),
    paymentIdentifier: v.string(),
    operationRef: v.string(),
    inputDigest: v.string(),
    transportObservationDigest: v.string(),
    transportRequestDigest: v.string(),
    paymentObservationDigest: v.string(),
    settlementStatus: x402PaymentSettlementStatusValue,
    paymentResponseDigest: v.optional(v.string()),
    observedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
    if (
      row === null
      || row.dispatchRef !== args.dispatchRef
      || row.paymentIdentifier !== args.paymentIdentifier
      || (row.operationRef !== undefined && row.operationRef !== args.operationRef)
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
    await ctx.db.patch(row._id, {
      state: args.settlementStatus === 'unknown' ? 'reconciliation_required' : 'observed',
      operationRef: args.operationRef,
      paymentObservationDigest: args.paymentObservationDigest,
      inputDigest: args.inputDigest,
      transportObservationDigest: args.transportObservationDigest,
      transportRequestDigest: args.transportRequestDigest,
      settlementStatus: args.settlementStatus,
      ...(args.paymentResponseDigest === undefined ? {} : { paymentResponseDigest: args.paymentResponseDigest }),
      observedAt: args.observedAt,
    })
    return null
  },
})

export const reconcileX402PaymentAttempt = internalMutation({
  args: x402PaymentObservationReconciliationArgs,
  returns: x402PaymentObservationReconciliationResult,
  handler: async (ctx, args): Promise<Infer<typeof x402PaymentObservationReconciliationResult>> => {
    const row = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
    if (
      row === null
      || row.dispatchRef !== args.dispatchRef
      || row.operationRef !== args.operationRef
      || row.inputDigest !== args.inputDigest
      || row.reservationRef !== args.reservationRef
      || row.paymentIdentifier !== args.paymentIdentifier
      || row.challengeDigest !== args.challengeDigest
      || row.amountUnits !== args.amountUnits
      || row.currency !== args.currency
      || row.exponent !== args.exponent
      || row.transportObservationDigest !== args.transportObservationDigest
      || row.transportRequestDigest !== args.transportRequestDigest
      || row.paymentObservationDigest !== args.paymentObservationDigest
      || (
        row.settlementStatus !== undefined
        && row.settlementStatus !== 'unknown'
        && row.settlementStatus !== args.settlementStatus
      )
      || (row.state !== 'observed' && row.state !== 'reconciliation_required')
    ) return { kind: 'reconciliation_required' }
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
    return { kind: 'settled', settlementStatus: args.settlementStatus }
  },
})
