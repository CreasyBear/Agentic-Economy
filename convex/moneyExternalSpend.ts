import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { exactAmount, identifier } from './moneyLedgerValues'
import {
  applyPreparedCredentialBudgetReservation,
  budgetUsage,
  prepareCredentialBudgetReservation,
  readBudgetRows,
  reserveCustodyDailyBudgetInTransaction,
  transitionCustodyDailyBudgetInTransaction,
  writeBudgetUsage,
} from './moneyBudgetPersist'
import { externalSpendCustodyPolicyRefusal } from '../src/modules/money/internal/external-spend'
import {
  amountFromParts,
  decideExternalSpendFinalization,
  decideExternalSpendReconciliation,
  decideExternalSpendReversal,
  externalSpendFinalizationCommandRefusal,
  externalSpendFinalizationDigest,
  externalSpendIdentityDigest,
  externalSpendPaymentFactsValid,
  externalSpendReconciliationCommandRefusal,
  externalSpendReversalCommandRefusal,
  mintExternalSpendIdentity,
  readExactAmount,
  releaseCredentialBudget,
  reverseCredentialBudget,
  sameExternalSpendIdentity,
  settleCredentialBudget,
  type ExternalSpendFinalizationCommand,
  type ExternalSpendIdentity,
  type ExternalSpendMutationResult,
  type ExternalSpendPaymentFacts,
  type ExternalSpendRefusalCode,
  type ExternalSpendReservation,
  type ExternalSpendSettlementStatus,
  type ExternalSpendSubmissionStatus,
} from '../src/modules/money/public'

export type ReserveExternalInvocationSpendArgs = ExternalSpendPaymentFacts &
  Readonly<{
    observedAt: number
  }>

export type FinalizeExternalInvocationSpendArgs = ExternalSpendIdentity &
  Readonly<{
    settlementStatus: ExternalSpendSettlementStatus
    submissionStatus: ExternalSpendSubmissionStatus
    paymentResponseDigest?: string
    providerReceiptDigest?: string
    evidenceRefs: string[]
    observedAt: number
  }>

export type ReconcileExternalInvocationSpendArgs = ExternalSpendIdentity &
  Readonly<{
    settlementStatus: 'settled' | 'not_settled'
    paymentResponseDigest: string
    evidenceRef: string
    evidenceDigest: string
    observedAt: number
  }>

export type ReverseExternalInvocationSpendArgs = ExternalSpendIdentity &
  Readonly<{
    evidenceRef: string
    evidenceDigest: string
    observedAt: number
  }>

export type ReverseExternalInvocationSpendForInvalidOutputArgs =
  ExternalSpendIdentity &
  Readonly<{
    settlementStatus: ExternalSpendSettlementStatus
    submissionStatus: ExternalSpendSubmissionStatus
    paymentResponseDigest?: string
    providerReceiptDigest?: string
    evidenceRefs: string[]
    invalidOutputEvidenceRef: string
    invalidOutputEvidenceDigest: string
    observedAt: number
  }>

export const externalSpendEnvironment = v.union(
  v.literal('sandbox'),
  v.literal('production'),
)
export const externalSpendSettlementStatus = v.union(
  v.literal('settled'),
  v.literal('not_settled'),
  v.literal('unknown'),
)
export const externalSpendSubmissionStatus = v.union(
  v.literal('not_submitted'),
  v.literal('possibly_submitted'),
  v.literal('observed'),
  v.literal('unknown'),
)
export const externalSpendReservationState = v.union(
  v.literal('reserved'),
  v.literal('settled'),
  v.literal('released'),
  v.literal('outcome_unknown'),
  v.literal('reversed'),
)
export const externalSpendRefusalCode = v.union(
  v.literal('external_spend_identity_conflict'),
  v.literal('external_spend_grant_invalid'),
  v.literal('external_spend_budget_refused'),
  v.literal('external_spend_payment_response_invalid'),
  v.literal('external_spend_invalid_amount'),
  v.literal('external_spend_not_found'),
  v.literal('external_spend_state_conflict'),
  v.literal('external_spend_reconciliation_required'),
  v.literal('external_spend_already_reversed'),
  v.literal('external_spend_custody_policy_invalid'),
  v.literal('external_spend_custody_daily_limit_exceeded'),
)
export const externalSpendPaymentFactsArgs = {
  principalId: identifier,
  credentialId: identifier,
  grantRef: identifier,
  grantGeneration: v.number(),
  environment: externalSpendEnvironment,
  invocationRef: identifier,
  attemptRef: identifier,
  effectGeneration: v.number(),
  operationRef: identifier,
  providerRef: identifier,
  paymentIdentifier: identifier,
  challengeDigest: identifier,
  amount: exactAmount,
  custodyRef: v.optional(identifier),
  custodyGeneration: v.optional(v.number()),
  custodyDailyMaximum: v.optional(exactAmount),
} as const
export const externalSpendIdentityArgs = {
  reservationRef: identifier,
  ...externalSpendPaymentFactsArgs,
  idempotencyDigest: identifier,
} as const
export const externalSpendReservationValue = v.object({
  reservationRef: identifier,
  principalId: identifier,
  credentialId: identifier,
  grantRef: identifier,
  grantGeneration: v.number(),
  environment: externalSpendEnvironment,
  budgetPolicyRef: identifier,
  budgetDayStart: identifier,
  budgetMonthStart: identifier,
  custodyRef: v.optional(identifier),
  custodyGeneration: v.optional(v.number()),
  custodyDailyMaximum: v.optional(exactAmount),
  custodyBudgetPolicyRef: v.optional(identifier),
  custodyBudgetDayStart: v.optional(identifier),
  invocationRef: identifier,
  attemptRef: identifier,
  effectGeneration: v.number(),
  operationRef: identifier,
  providerRef: identifier,
  submissionStatus: v.optional(externalSpendSubmissionStatus),
  paymentIdentifier: identifier,
  challengeDigest: identifier,
  idempotencyDigest: identifier,
  identityDigest: identifier,
  amount: exactAmount,
  state: externalSpendReservationState,
  finalizationDigest: v.optional(identifier),
  paymentResponseDigest: v.optional(identifier),
  providerReceiptDigest: v.optional(identifier),
  evidenceRefs: v.array(v.string()),
  reconciliationDigest: v.optional(identifier),
  reconciliationEvidenceRef: v.optional(identifier),
  reconciliationEvidenceDigest: v.optional(identifier),
  reversalEvidenceRef: v.optional(identifier),
  reversalEvidenceDigest: v.optional(identifier),
  createdAt: v.number(),
  updatedAt: v.number(),
  finalizedAt: v.optional(v.number()),
  reconciledAt: v.optional(v.number()),
  reversedAt: v.optional(v.number()),
})
export const externalSpendMutationResultValue = v.union(
  v.object({
    kind: v.literal('accepted'),
    status: externalSpendReservationState,
    replayed: v.boolean(),
    reservation: externalSpendReservationValue,
  }),
  v.object({
    kind: v.literal('refused'),
    code: externalSpendRefusalCode,
    retryable: v.boolean(),
  }),
)
export const reserveExternalInvocationSpendArgs = {
  ...externalSpendPaymentFactsArgs,
  observedAt: v.number(),
}
export const finalizeExternalInvocationSpendArgs = {
  ...externalSpendIdentityArgs,
  settlementStatus: externalSpendSettlementStatus,
  submissionStatus: externalSpendSubmissionStatus,
  paymentResponseDigest: v.optional(identifier),
  providerReceiptDigest: v.optional(identifier),
  evidenceRefs: v.array(v.string()),
  observedAt: v.number(),
}
export const reconcileExternalInvocationSpendArgs = {
  ...externalSpendIdentityArgs,
  settlementStatus: v.union(v.literal('settled'), v.literal('not_settled')),
  paymentResponseDigest: identifier,
  evidenceRef: identifier,
  evidenceDigest: identifier,
  observedAt: v.number(),
}
export const reverseExternalInvocationSpendArgs = {
  ...externalSpendIdentityArgs,
  evidenceRef: identifier,
  evidenceDigest: identifier,
  observedAt: v.number(),
}
export const reverseExternalInvocationSpendForInvalidOutputArgs = {
  ...externalSpendIdentityArgs,
  settlementStatus: externalSpendSettlementStatus,
  submissionStatus: externalSpendSubmissionStatus,
  paymentResponseDigest: v.optional(identifier),
  providerReceiptDigest: v.optional(identifier),
  evidenceRefs: v.array(v.string()),
  invalidOutputEvidenceRef: identifier,
  invalidOutputEvidenceDigest: identifier,
  observedAt: v.number(),
}

type ExternalSpendCustodyRowMaterial =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'present'
      custodyRef: string
      custodyGeneration: number
      custodyDailyMaximum: NonNullable<ExternalSpendIdentity['custodyDailyMaximum']>
      custodyBudgetPolicyRef: string
      custodyBudgetDayStart: string
    }>
  | Readonly<{ kind: 'invalid' }>

function externalSpendCustodyFromRow(
  row: Doc<'moneyExternalSpendReservations'>,
): ExternalSpendCustodyRowMaterial {
  const fields = [
    row.custodyRef,
    row.custodyGeneration,
    row.custodyDailyMaximumUnits,
    row.custodyBudgetPolicyRef,
    row.custodyBudgetDayStart,
  ]
  const supplied = fields.filter((value) => value !== undefined).length
  if (supplied === 0) return { kind: 'none' }
  if (supplied !== fields.length || row.environment !== 'production') {
    return { kind: 'invalid' }
  }
  const custodyDailyMaximum = amountFromParts(
    row.currency,
    row.custodyDailyMaximumUnits,
    row.exponent,
  )
  if (
    typeof row.custodyRef !== 'string'
    || row.custodyRef.trim().length === 0
    || typeof row.custodyGeneration !== 'number'
    || !Number.isSafeInteger(row.custodyGeneration)
    || row.custodyGeneration <= 0
    || custodyDailyMaximum === undefined
    || typeof row.custodyBudgetPolicyRef !== 'string'
    || row.custodyBudgetPolicyRef.trim().length === 0
    || typeof row.custodyBudgetDayStart !== 'string'
    || row.custodyBudgetDayStart.trim().length === 0
  ) {
    return { kind: 'invalid' }
  }
  return {
    kind: 'present',
    custodyRef: row.custodyRef,
    custodyGeneration: row.custodyGeneration,
    custodyDailyMaximum,
    custodyBudgetPolicyRef: row.custodyBudgetPolicyRef,
    custodyBudgetDayStart: row.custodyBudgetDayStart,
  }
}

function externalSpendIdentityFromRow(
  row: Doc<'moneyExternalSpendReservations'>,
): ExternalSpendIdentity | undefined {
  const amount = amountFromParts(row.currency, row.amountUnits, row.exponent)
  if (amount === undefined) return undefined
  const custody = externalSpendCustodyFromRow(row)
  if (custody.kind === 'invalid') return undefined
  const identity: ExternalSpendIdentity = {
    reservationRef: row.reservationRef,
    principalId: row.principalId,
    credentialId: row.credentialId,
    grantRef: row.grantRef,
    grantGeneration: row.grantGeneration,
    environment: row.environment,
    invocationRef: row.invocationRef,
    attemptRef: row.attemptRef,
    effectGeneration: row.effectGeneration,
    operationRef: row.operationRef,
    providerRef: row.providerRef,
    paymentIdentifier: row.paymentIdentifier,
    challengeDigest: row.challengeDigest,
    amount,
    ...(custody.kind === 'present'
      ? {
          custodyRef: custody.custodyRef,
          custodyGeneration: custody.custodyGeneration,
          custodyDailyMaximum: custody.custodyDailyMaximum,
        }
      : {}),
    idempotencyDigest: row.idempotencyDigest,
  }
  return externalSpendPaymentFactsValid(identity) ? identity : undefined
}

function externalSpendReservationView(
  row: Doc<'moneyExternalSpendReservations'>,
): ExternalSpendReservation | undefined {
  const identity = externalSpendIdentityFromRow(row)
  if (
    identity === undefined
    || row.identityDigest !== externalSpendIdentityDigest(identity)
  ) return undefined
  const custody = externalSpendCustodyFromRow(row)
  if (custody.kind === 'invalid') return undefined
  return {
    ...identity,
    identityDigest: row.identityDigest,
    budgetPolicyRef: row.budgetPolicyRef,
    budgetDayStart: row.budgetDayStart,
    budgetMonthStart: row.budgetMonthStart,
    ...(custody.kind === 'present'
      ? {
          custodyBudgetPolicyRef: custody.custodyBudgetPolicyRef,
          custodyBudgetDayStart: custody.custodyBudgetDayStart,
        }
      : {}),
    state: row.state,
    ...(row.submissionStatus === undefined ? {} : { submissionStatus: row.submissionStatus }),
    ...(row.finalizationDigest === undefined ? {} : { finalizationDigest: row.finalizationDigest }),
    ...(row.paymentResponseDigest === undefined ? {} : { paymentResponseDigest: row.paymentResponseDigest }),
    ...(row.providerReceiptDigest === undefined ? {} : { providerReceiptDigest: row.providerReceiptDigest }),
    evidenceRefs: row.evidenceRefs,
    ...(row.reconciliationDigest === undefined ? {} : { reconciliationDigest: row.reconciliationDigest }),
    ...(row.reconciliationEvidenceRef === undefined ? {} : { reconciliationEvidenceRef: row.reconciliationEvidenceRef }),
    ...(row.reconciliationEvidenceDigest === undefined ? {} : { reconciliationEvidenceDigest: row.reconciliationEvidenceDigest }),
    ...(row.reversalEvidenceRef === undefined ? {} : { reversalEvidenceRef: row.reversalEvidenceRef }),
    ...(row.reversalEvidenceDigest === undefined ? {} : { reversalEvidenceDigest: row.reversalEvidenceDigest }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.finalizedAt === undefined ? {} : { finalizedAt: row.finalizedAt }),
    ...(row.reconciledAt === undefined ? {} : { reconciledAt: row.reconciledAt }),
    ...(row.reversedAt === undefined ? {} : { reversedAt: row.reversedAt }),
  }
}

function externalSpendRefusal(
  code: ExternalSpendRefusalCode,
  retryable = false,
): ExternalSpendMutationResult {
  return { kind: 'refused', code, retryable }
}

async function activeExternalSpendGrant(
  ctx: Pick<MutationCtx, 'db'>,
  input: ExternalSpendIdentity,
  now: number,
): Promise<boolean> {
  const [principal, grant] = await Promise.all([
    ctx.db
      .query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', input.principalId))
      .unique(),
    ctx.db
      .query('agentAccessGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', input.grantRef))
      .unique(),
  ])
  return principal !== null
    && principal.principalId === input.principalId
    && (principal.expiresAt === undefined || principal.expiresAt > now)
    && principal.environment === input.environment
    && principal.lifecycle === 'active'
    && principal.grantGeneration === input.grantGeneration
    && grant !== null
    && grant.grantRef === input.grantRef
    && grant.principalId === input.principalId
    && grant.credentialId === input.credentialId
    && grant.environment === input.environment
    && principal.applicationRef === grant.applicationRef
    && grant.lifecycle === 'active'
    && grant.generation === input.grantGeneration
    && grant.expiresAt > now
    && grant.policy.environment === input.environment
    && grant.policyDigest === principal.policyDigest
    && grant.policy.budget.generation === grant.generation
    && grant.budgetPolicyRef === grant.policy.budget.budgetPolicyRef
}

function externalSpendIdentityMatches(
  row: Doc<'moneyExternalSpendReservations'>,
  identity: ExternalSpendIdentity,
): boolean {
  const stored = externalSpendIdentityFromRow(row)
  return stored !== undefined
    && row.identityDigest === externalSpendIdentityDigest(stored)
    && sameExternalSpendIdentity(stored, identity)
}

async function transitionExternalSpendBudget(
  ctx: Pick<MutationCtx, 'db'>,
  row: Doc<'moneyExternalSpendReservations'>,
  target: 'settled' | 'released' | 'reversed',
  now: number,
): Promise<boolean> {
  const amount = amountFromParts(row.currency, row.amountUnits, row.exponent)
  if (amount === undefined) return false
  const custodyTarget = target === 'reversed' ? undefined : target
  const custody = custodyTarget === undefined
    ? { kind: 'none' as const }
    : externalSpendCustodyFromRow(row)
  if (custody.kind === 'invalid') return false
  const spendPrincipal = await ctx.db
    .query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) =>
      query.eq('principalId', row.principalId),
    )
    .unique()
  if (spendPrincipal === null) return false
  const rows = await readBudgetRows(ctx, {
    principalId: row.principalId,
    accountId: spendPrincipal.ownerId,
    credentialId: row.credentialId,
    generation: row.grantGeneration,
    environment: row.environment,
    budgetPolicyRef: row.budgetPolicyRef,
    dayStart: row.budgetDayStart,
    monthStart: row.budgetMonthStart,
    amount,
    now,
  })
  if (
    rows === undefined
    || rows.daily._creationTime === 0
    || rows.monthly._creationTime === 0
    || rows.concurrency._creationTime === 0
  ) return false
  const usage = budgetUsage(rows)
  if (usage === undefined) return false
  const transition =
    target === 'settled'
      ? settleCredentialBudget({ usage, amount })
      : target === 'released'
        ? releaseCredentialBudget({ usage, amount })
        : reverseCredentialBudget({ usage, amount })
  if (transition.kind === 'refused') return false
  await writeBudgetUsage(ctx, rows, transition.usage, now)
  if (
    custody.kind === 'present'
    && custodyTarget !== undefined
    && !await transitionCustodyDailyBudgetInTransaction(ctx, {
      custodyRef: custody.custodyRef,
      budgetPolicyRef: custody.custodyBudgetPolicyRef,
      dayStart: custody.custodyBudgetDayStart,
      amount,
      target: custodyTarget,
      observedAt: now,
    })
  ) {
    throw new Error('external_spend_custody_transition_conflict')
  }
  return true
}

async function settleThenReverseExternalSpendBudget(
  ctx: Pick<MutationCtx, 'db'>,
  row: Doc<'moneyExternalSpendReservations'>,
  now: number,
): Promise<boolean> {
  const amount = amountFromParts(row.currency, row.amountUnits, row.exponent)
  if (amount === undefined) return false
  const spendPrincipal = await ctx.db
    .query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) =>
      query.eq('principalId', row.principalId),
    )
    .unique()
  if (spendPrincipal === null) return false
  const rows = await readBudgetRows(ctx, {
    principalId: row.principalId,
    accountId: spendPrincipal.ownerId,
    credentialId: row.credentialId,
    generation: row.grantGeneration,
    environment: row.environment,
    budgetPolicyRef: row.budgetPolicyRef,
    dayStart: row.budgetDayStart,
    monthStart: row.budgetMonthStart,
    amount,
    now,
  })
  if (
    rows === undefined
    || rows.daily._creationTime === 0
    || rows.monthly._creationTime === 0
    || rows.concurrency._creationTime === 0
  ) return false
  const usage = budgetUsage(rows)
  if (usage === undefined) return false
  const settled = settleCredentialBudget({ usage, amount })
  if (settled.kind === 'refused') return false
  const reversed = reverseCredentialBudget({
    usage: settled.usage,
    amount,
  })
  if (reversed.kind === 'refused') return false
  await writeBudgetUsage(ctx, rows, reversed.usage, now)
  return true
}

function externalSpendAccepted(
  row: Doc<'moneyExternalSpendReservations'>,
  replayed: boolean,
): ExternalSpendMutationResult {
  const reservation = externalSpendReservationView(row)
  return reservation === undefined
    ? externalSpendRefusal('external_spend_state_conflict')
    : {
        kind: 'accepted',
        status: reservation.state,
        replayed,
        reservation,
      }
}

export async function reserveExternalInvocationSpendHandler(
  ctx: MutationCtx,
  args: ReserveExternalInvocationSpendArgs,
): Promise<ExternalSpendMutationResult> {
  const amount = readExactAmount(args.amount)
  if (amount === undefined || !Number.isFinite(args.observedAt)) {
    return externalSpendRefusal('external_spend_invalid_amount')
  }
  const { observedAt, ...rawFacts } = args
  const facts: ExternalSpendPaymentFacts = {
    ...rawFacts,
    amount,
  }
  const custodyRefusal = externalSpendCustodyPolicyRefusal(facts)
  if (custodyRefusal !== undefined) {
    return externalSpendRefusal(custodyRefusal)
  }
  if (!externalSpendPaymentFactsValid(facts)) {
    return externalSpendRefusal('external_spend_invalid_amount')
  }
  const identity = mintExternalSpendIdentity(facts)
  const priorByAttempt = await ctx.db
    .query('moneyExternalSpendReservations')
    .withIndex('by_invocationRef_and_attemptRef_and_effectGeneration', (query) =>
      query
        .eq('invocationRef', identity.invocationRef)
        .eq('attemptRef', identity.attemptRef)
        .eq('effectGeneration', identity.effectGeneration),
    )
    .unique()
  if (priorByAttempt !== null) {
    return externalSpendIdentityMatches(priorByAttempt, identity)
      ? externalSpendAccepted(priorByAttempt, true)
      : externalSpendRefusal('external_spend_identity_conflict')
  }
  const prior = await ctx.db
    .query('moneyExternalSpendReservations')
    .withIndex('by_reservationRef', (query) =>
      query.eq('reservationRef', identity.reservationRef),
    )
    .unique()
  if (prior !== null) {
    return externalSpendIdentityMatches(prior, identity)
      ? externalSpendAccepted(prior, true)
      : externalSpendRefusal('external_spend_identity_conflict')
  }
  const priorByIdempotency = await ctx.db
    .query('moneyExternalSpendReservations')
    .withIndex('by_idempotencyDigest', (query) =>
      query.eq('idempotencyDigest', identity.idempotencyDigest),
    )
    .unique()
  if (priorByIdempotency !== null) {
    return externalSpendRefusal('external_spend_identity_conflict')
  }
  if (!await activeExternalSpendGrant(ctx, identity, observedAt)) {
    return externalSpendRefusal('external_spend_grant_invalid')
  }
  const spendPrincipal = await ctx.db
    .query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) =>
      query.eq('principalId', identity.principalId),
    )
    .unique()
  if (spendPrincipal === null) {
    return externalSpendRefusal('external_spend_grant_invalid')
  }
  const budgetReservation = await prepareCredentialBudgetReservation(ctx, {
    principalId: identity.principalId,
    accountId: spendPrincipal.ownerId,
    credentialId: identity.credentialId,
    grantRef: identity.grantRef,
    generation: identity.grantGeneration,
    amount: identity.amount,
    observedAt,
  })
  if (budgetReservation.kind === 'refused') {
    return externalSpendRefusal(
      'external_spend_budget_refused',
      budgetReservation.retryable,
    )
  }
  const custodyFacts =
    identity.custodyRef !== undefined
    && identity.custodyGeneration !== undefined
    && identity.custodyDailyMaximum !== undefined
      ? {
          custodyRef: identity.custodyRef,
          custodyGeneration: identity.custodyGeneration,
          custodyDailyMaximum: identity.custodyDailyMaximum,
        }
      : undefined
  const custodyReservation = custodyFacts === undefined
    ? undefined
    : await reserveCustodyDailyBudgetInTransaction(ctx, {
        custodyRef: custodyFacts.custodyRef,
        maximumDailySpend: custodyFacts.custodyDailyMaximum,
        amount: identity.amount,
        observedAt,
      })
  if (custodyReservation?.kind === 'refused') {
    return externalSpendRefusal(custodyReservation.code)
  }
  await applyPreparedCredentialBudgetReservation(ctx, budgetReservation, observedAt)
  const identityDigest = externalSpendIdentityDigest(identity)
  const reservationId = await ctx.db.insert('moneyExternalSpendReservations', {
    reservationRef: identity.reservationRef,
    principalId: identity.principalId,
    credentialId: identity.credentialId,
    grantRef: identity.grantRef,
    grantGeneration: identity.grantGeneration,
    environment: identity.environment,
    budgetPolicyRef: budgetReservation.budgetPolicyRef,
    budgetDayStart: budgetReservation.dayStart,
    budgetMonthStart: budgetReservation.monthStart,
    ...(custodyFacts === undefined || custodyReservation === undefined
      ? {}
      : {
          custodyRef: custodyFacts.custodyRef,
          custodyGeneration: custodyFacts.custodyGeneration,
          custodyDailyMaximumUnits: custodyFacts.custodyDailyMaximum.units,
          custodyBudgetPolicyRef: custodyReservation.budgetPolicyRef,
          custodyBudgetDayStart: custodyReservation.dayStart,
        }),
    invocationRef: identity.invocationRef,
    attemptRef: identity.attemptRef,
    effectGeneration: identity.effectGeneration,
    operationRef: identity.operationRef,
    providerRef: identity.providerRef,
    paymentIdentifier: identity.paymentIdentifier,
    challengeDigest: identity.challengeDigest,
    idempotencyDigest: identity.idempotencyDigest,
    identityDigest,
    currency: identity.amount.currency,
    amountUnits: identity.amount.units,
    exponent: identity.amount.exponent,
    state: 'reserved',
    evidenceRefs: [],
    createdAt: observedAt,
    updatedAt: observedAt,
  })
  const created = await ctx.db.get(reservationId)
  if (created === null) throw new Error('external_spend_reservation_insert_missing')
  const accepted = externalSpendAccepted(created, false)
  if (accepted.kind === 'refused')
    throw new Error('external_spend_reservation_state_conflict')
  return accepted
}

export async function finalizeExternalInvocationSpendHandler(
  ctx: MutationCtx,
  args: FinalizeExternalInvocationSpendArgs,
): Promise<ExternalSpendMutationResult> {
  const amount = readExactAmount(args.amount)
  if (amount === undefined || !Number.isFinite(args.observedAt)) {
    return externalSpendRefusal('external_spend_invalid_amount')
  }
  const {
    observedAt,
    settlementStatus,
    submissionStatus,
    paymentResponseDigest,
    providerReceiptDigest,
    evidenceRefs,
    ...rawIdentity
  } = args
  const identity: ExternalSpendIdentity = {
    ...rawIdentity,
    amount,
  }
  const command = {
    submissionStatus,
    settlementStatus,
    ...(paymentResponseDigest === undefined ? {} : { paymentResponseDigest }),
    ...(providerReceiptDigest === undefined ? {} : { providerReceiptDigest }),
    evidenceRefs,
  } satisfies ExternalSpendFinalizationCommand
  const commandRefusal =
    externalSpendFinalizationCommandRefusal(identity, command)
  if (commandRefusal !== undefined) {
    return externalSpendRefusal(commandRefusal)
  }
  const row = await ctx.db
    .query('moneyExternalSpendReservations')
    .withIndex('by_reservationRef', (query) =>
      query.eq('reservationRef', identity.reservationRef),
    )
    .unique()
  if (row === null) return externalSpendRefusal('external_spend_not_found')
  if (!externalSpendIdentityMatches(row, identity)) {
    return externalSpendRefusal('external_spend_identity_conflict')
  }
  const reservation = externalSpendReservationView(row)
  if (reservation === undefined) {
    return externalSpendRefusal('external_spend_state_conflict')
  }
  const decision = decideExternalSpendFinalization({
    identity,
    reservation,
    command,
  })
  if (decision.kind === 'refused') {
    return externalSpendRefusal(decision.code)
  }
  if (decision.kind === 'replayed') {
    return externalSpendAccepted(row, true)
  }
  if (
    decision.budgetTarget !== undefined
    && !await transitionExternalSpendBudget(
      ctx,
      row,
      decision.budgetTarget,
      observedAt,
    )
  ) {
    return externalSpendRefusal('external_spend_budget_refused')
  }
  await ctx.db.patch(row._id, {
    state: decision.target,
    submissionStatus,
    finalizationDigest: decision.finalizationDigest,
    ...(paymentResponseDigest === undefined ? {} : { paymentResponseDigest }),
    ...(providerReceiptDigest === undefined ? {} : { providerReceiptDigest }),
    evidenceRefs,
    finalizedAt: observedAt,
    updatedAt: observedAt,
  })
  const updated = await ctx.db.get(row._id)
  return updated === null
    ? externalSpendRefusal('external_spend_state_conflict')
    : externalSpendAccepted(updated, false)
}

export async function reconcileExternalInvocationSpendHandler(
  ctx: MutationCtx,
  args: ReconcileExternalInvocationSpendArgs,
): Promise<ExternalSpendMutationResult> {
  const amount = readExactAmount(args.amount)
  if (amount === undefined || !Number.isFinite(args.observedAt)) {
    return externalSpendRefusal('external_spend_invalid_amount')
  }
  const { observedAt, settlementStatus, paymentResponseDigest, evidenceRef, evidenceDigest, ...rawIdentity } = args
  const identity: ExternalSpendIdentity = {
    ...rawIdentity,
    amount,
  }
  const command = {
    settlementStatus,
    paymentResponseDigest,
    evidenceRef,
    evidenceDigest,
  } as const
  const commandRefusal =
    externalSpendReconciliationCommandRefusal(identity, command)
  if (commandRefusal !== undefined) {
    return externalSpendRefusal(commandRefusal)
  }
  const row = await ctx.db
    .query('moneyExternalSpendReservations')
    .withIndex('by_reservationRef', (query) =>
      query.eq('reservationRef', identity.reservationRef),
    )
    .unique()
  if (row === null) return externalSpendRefusal('external_spend_not_found')
  if (!externalSpendIdentityMatches(row, identity)) {
    return externalSpendRefusal('external_spend_identity_conflict')
  }
  const reservation = externalSpendReservationView(row)
  if (reservation === undefined) {
    return externalSpendRefusal('external_spend_state_conflict')
  }
  const decision = decideExternalSpendReconciliation({
    identity,
    reservation,
    command,
  })
  if (decision.kind === 'refused') {
    return externalSpendRefusal(decision.code)
  }
  if (decision.kind === 'replayed') {
    return externalSpendAccepted(row, true)
  }
  if (
    !await transitionExternalSpendBudget(
      ctx,
      row,
      decision.target,
      observedAt,
    )
  ) {
    return externalSpendRefusal('external_spend_budget_refused')
  }
  await ctx.db.patch(row._id, {
    state: decision.target,
    paymentResponseDigest,
    reconciliationDigest: decision.reconciliationDigest,
    reconciliationEvidenceRef: evidenceRef,
    reconciliationEvidenceDigest: evidenceDigest,
    reconciledAt: observedAt,
    updatedAt: observedAt,
  })
  const updated = await ctx.db.get(row._id)
  return updated === null
    ? externalSpendRefusal('external_spend_state_conflict')
    : externalSpendAccepted(updated, false)
}

export async function reverseExternalInvocationSpendHandler(
  ctx: MutationCtx,
  args: ReverseExternalInvocationSpendArgs,
): Promise<ExternalSpendMutationResult> {
  const amount = readExactAmount(args.amount)
  if (
    amount === undefined
    || !Number.isFinite(args.observedAt)
  ) {
    return externalSpendRefusal('external_spend_invalid_amount')
  }
  const { observedAt, evidenceRef, evidenceDigest, ...rawIdentity } = args
  const identity: ExternalSpendIdentity = {
    ...rawIdentity,
    amount,
  }
  const commandRefusal = externalSpendReversalCommandRefusal(
    identity,
    evidenceRef,
    evidenceDigest,
  )
  if (commandRefusal !== undefined) {
    return externalSpendRefusal(commandRefusal)
  }
  const row = await ctx.db
    .query('moneyExternalSpendReservations')
    .withIndex('by_reservationRef', (query) =>
      query.eq('reservationRef', identity.reservationRef),
    )
    .unique()
  if (row === null) return externalSpendRefusal('external_spend_not_found')
  if (!externalSpendIdentityMatches(row, identity)) {
    return externalSpendRefusal('external_spend_identity_conflict')
  }
  const reservation = externalSpendReservationView(row)
  if (reservation === undefined) {
    return externalSpendRefusal('external_spend_state_conflict')
  }
  const decision = decideExternalSpendReversal({
    identity,
    reservation,
    evidenceRef,
    evidenceDigest,
  })
  if (decision.kind === 'refused') {
    return externalSpendRefusal(decision.code)
  }
  if (decision.kind === 'replayed') {
    return externalSpendAccepted(row, true)
  }
  if (!await transitionExternalSpendBudget(ctx, row, 'reversed', observedAt)) {
    return externalSpendRefusal('external_spend_budget_refused')
  }
  await ctx.db.patch(row._id, {
    state: 'reversed',
    reversalEvidenceRef: evidenceRef,
    reversalEvidenceDigest: evidenceDigest,
    reversedAt: observedAt,
    updatedAt: observedAt,
  })
  const updated = await ctx.db.get(row._id)
  return updated === null
    ? externalSpendRefusal('external_spend_state_conflict')
    : externalSpendAccepted(updated, false)
}

export async function reverseExternalInvocationSpendForInvalidOutputHandler(
  ctx: MutationCtx,
  args: ReverseExternalInvocationSpendForInvalidOutputArgs,
): Promise<ExternalSpendMutationResult> {
  const amount = readExactAmount(args.amount)
  if (amount === undefined || !Number.isFinite(args.observedAt)) {
    return externalSpendRefusal('external_spend_invalid_amount')
  }
  const {
    observedAt,
    settlementStatus,
    submissionStatus,
    paymentResponseDigest,
    providerReceiptDigest,
    evidenceRefs,
    invalidOutputEvidenceRef,
    invalidOutputEvidenceDigest,
    ...rawIdentity
  } = args
  const identity: ExternalSpendIdentity = {
    ...rawIdentity,
    amount,
  }
  const finalizationCommand = {
    submissionStatus,
    settlementStatus,
    ...(paymentResponseDigest === undefined ? {} : { paymentResponseDigest }),
    ...(providerReceiptDigest === undefined ? {} : { providerReceiptDigest }),
    evidenceRefs,
  } satisfies ExternalSpendFinalizationCommand
  const commandRefusal = externalSpendFinalizationCommandRefusal(
    identity,
    finalizationCommand,
  )
  if (commandRefusal !== undefined) {
    return externalSpendRefusal(commandRefusal)
  }
  if (submissionStatus !== 'observed' || settlementStatus !== 'settled') {
    return externalSpendRefusal('external_spend_state_conflict')
  }
  if (
    paymentResponseDigest === undefined
    || paymentResponseDigest.trim().length === 0
    || evidenceRefs.length === 0
    || !evidenceRefs.every((ref) => ref.trim().length > 0)
  ) {
    return externalSpendRefusal('external_spend_payment_response_invalid')
  }
  const reversalCommandRefusal = externalSpendReversalCommandRefusal(
    identity,
    invalidOutputEvidenceRef,
    invalidOutputEvidenceDigest,
  )
  if (reversalCommandRefusal !== undefined) {
    return externalSpendRefusal(reversalCommandRefusal)
  }
  const row = await ctx.db
    .query('moneyExternalSpendReservations')
    .withIndex('by_reservationRef', (query) =>
      query.eq('reservationRef', identity.reservationRef),
    )
    .unique()
  if (row === null) return externalSpendRefusal('external_spend_not_found')
  if (!externalSpendIdentityMatches(row, identity)) {
    return externalSpendRefusal('external_spend_identity_conflict')
  }
  const reservation = externalSpendReservationView(row)
  if (reservation === undefined) {
    return externalSpendRefusal('external_spend_state_conflict')
  }
  const finalizationDigest = externalSpendFinalizationDigest({
    identityDigest: reservation.identityDigest,
    ...finalizationCommand,
  })
  if (reservation.state === 'reversed') {
    return reservation.finalizationDigest === finalizationDigest
      && reservation.reversalEvidenceRef === invalidOutputEvidenceRef
      && reservation.reversalEvidenceDigest === invalidOutputEvidenceDigest
      ? externalSpendAccepted(row, true)
      : externalSpendRefusal('external_spend_already_reversed')
  }
  if (reservation.state === 'outcome_unknown') {
    return externalSpendRefusal('external_spend_reconciliation_required')
  }
  if (reservation.state !== 'reserved') {
    return externalSpendRefusal('external_spend_state_conflict')
  }
  if (!await settleThenReverseExternalSpendBudget(ctx, row, observedAt)) {
    return externalSpendRefusal('external_spend_budget_refused')
  }
  const custody = externalSpendCustodyFromRow(row)
  if (custody.kind === 'invalid') {
    throw new Error('external_spend_custody_transition_conflict')
  }
  if (
    custody.kind === 'present'
    && !await transitionCustodyDailyBudgetInTransaction(ctx, {
      custodyRef: custody.custodyRef,
      budgetPolicyRef: custody.custodyBudgetPolicyRef,
      dayStart: custody.custodyBudgetDayStart,
      amount,
      target: 'settled',
      observedAt,
    })
  ) {
    throw new Error('external_spend_custody_transition_conflict')
  }
  await ctx.db.patch(row._id, {
    state: 'reversed',
    submissionStatus,
    finalizationDigest,
    paymentResponseDigest,
    ...(providerReceiptDigest === undefined ? {} : { providerReceiptDigest }),
    evidenceRefs,
    reversalEvidenceRef: invalidOutputEvidenceRef,
    reversalEvidenceDigest: invalidOutputEvidenceDigest,
    finalizedAt: observedAt,
    reversedAt: observedAt,
    updatedAt: observedAt,
  })
  const updated = await ctx.db.get(row._id)
  return updated === null
    ? externalSpendRefusal('external_spend_state_conflict')
    : externalSpendAccepted(updated, false)
}
