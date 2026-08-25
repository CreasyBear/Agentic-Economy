import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { exactAmount, identifier } from './moneyLedgerValues'
import {
  budgetUsage,
  readBudgetRows,
  transitionCustodyDailyBudgetInTransaction,
  writeBudgetUsage,
} from './moneyBudgetPersist'
import {
  amountFromParts,
  externalSpendIdentityDigest,
  externalSpendPaymentFactsValid,
  releaseCredentialBudget,
  reverseCredentialBudget,
  sameExternalSpendIdentity,
  settleCredentialBudget,
  type ExternalSpendIdentity,
  type ExternalSpendMutationResult,
  type ExternalSpendRefusalCode,
  type ExternalSpendReservation,
} from '../src/modules/money/public'

const externalSpendEnvironment = v.union(
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
const externalSpendReservationState = v.union(
  v.literal('reserved'),
  v.literal('settled'),
  v.literal('released'),
  v.literal('outcome_unknown'),
  v.literal('reversed'),
)
const externalSpendRefusalCode = v.union(
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
const externalSpendReservationValue = v.object({
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

export function externalSpendCustodyFromRow(
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

export function externalSpendReservationView(
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

export function externalSpendRefusal(
  code: ExternalSpendRefusalCode,
  retryable = false,
): ExternalSpendMutationResult {
  return { kind: 'refused', code, retryable }
}

export function externalSpendIdentityMatches(
  row: Doc<'moneyExternalSpendReservations'>,
  identity: ExternalSpendIdentity,
): boolean {
  const stored = externalSpendIdentityFromRow(row)
  return stored !== undefined
    && row.identityDigest === externalSpendIdentityDigest(stored)
    && sameExternalSpendIdentity(stored, identity)
}

export async function transitionExternalSpendBudget(
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

export function externalSpendAccepted(
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
