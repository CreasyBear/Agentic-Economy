import { v, type Infer } from 'convex/values'

import { canonicalDigest } from '@/modules/common/canonical-digest'
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
  authorizationDigest: v.string(),
  reservationRef: v.optional(v.string()),
  paymentIdentityDigest: v.optional(v.string()),
  paymentSignatureDigest: v.optional(v.string()),
  state: attemptStateValue,
  transportObservationDigest: v.optional(v.string()),
  transportRequestDigest: v.optional(v.string()),
  paymentObservationDigest: v.optional(v.string()),
  settlementStatus: v.optional(x402PaymentSettlementStatusValue),
  paymentResponseDigest: v.optional(v.string()),
  reconciliationEvidenceRef: v.optional(v.string()),
  reconciliationEvidenceDigest: v.optional(v.string()),
})

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
  authorizationDigest: v.string(),
  reservationRef: v.optional(v.string()),
  paymentIdentityDigest: v.optional(v.string()),
  paymentSignatureDigest: v.optional(v.string()),
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
    authorizationDigest: row.authorizationDigest,
    ...(row.reservationRef === undefined ? {} : { reservationRef: row.reservationRef }),
    ...(row.paymentIdentityDigest === undefined ? {} : { paymentIdentityDigest: row.paymentIdentityDigest }),
    ...(row.paymentSignatureDigest === undefined ? {} : { paymentSignatureDigest: row.paymentSignatureDigest }),
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
    authorizationDigest: row.authorizationDigest,
    ...(row.reservationRef === undefined ? {} : { reservationRef: row.reservationRef }),
    ...(row.paymentIdentityDigest === undefined ? {} : { paymentIdentityDigest: row.paymentIdentityDigest }),
    ...(row.paymentSignatureDigest === undefined ? {} : { paymentSignatureDigest: row.paymentSignatureDigest }),
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
  }),
  handler: async (ctx, args) => {
    const existing = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
    if (existing !== null) {
      if (!prepareAttributionMatches(existing, args)) {
        throw new Error('x402_payment_attempt_attribution_invalid')
      }
      if (existing.state !== 'prepared') {
        throw new Error('x402_payment_attempt_reconciliation_required')
      }
      return {
        custodyRef: existing.custodyRef,
        authorizationDigest: existing.authorizationDigest,
      }
    }
    const identified = await loadByPaymentIdentifier(ctx, args.paymentIdentifier)
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
    return { custodyRef, authorizationDigest }
  },
})

export const recordX402PaymentSignature = internalMutation({
  args: {
    custodyRef: v.string(),
    authorizationDigest: v.string(),
    paymentSignatureDigest: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await loadByCustody(ctx, args.custodyRef)
    if (row === null || row.authorizationDigest !== args.authorizationDigest) {
      throw new Error('x402_payment_attempt_attribution_invalid')
    }
    if (row.state !== 'prepared') throw new Error('x402_payment_attempt_reconciliation_required')
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
  args: { custodyRef: v.string(), authorizationDigest: v.string() },
  returns: v.union(x402PaymentAuthorizationMaterial, v.null()),
  handler: async (ctx, args) => {
    const row = await loadByCustody(ctx, args.custodyRef)
    if (row === null || row.authorizationDigest !== args.authorizationDigest) return null
    return authorizationMaterial(row)
  },
})

export const readX402PaymentAuthorizationByDigest = internalQuery({
  args: { custodyRef: v.string(), authorizationDigest: v.string() },
  returns: v.union(x402PaymentAuthorizationMaterial, v.null()),
  handler: async (ctx, args) => {
    const row = await loadByAuthorizationDigest(ctx, args.authorizationDigest)
    if (row === null || row.custodyRef !== args.custodyRef) return null
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
    if (row.state !== 'prepared') {
      throw new Error('x402_payment_attempt_reconciliation_required')
    }
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
    if (row.state !== 'possibly_submitted') {
      throw new Error('x402_payment_attempt_observation_state_invalid')
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
    await ctx.db.patch(row._id, {
      state: args.settlementStatus === 'unknown' ? 'reconciliation_required' : args.state,
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
