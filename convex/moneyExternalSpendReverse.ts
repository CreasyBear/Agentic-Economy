import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import {
  budgetUsage,
  readBudgetRows,
  transitionCustodyDailyBudgetInTransaction,
  writeBudgetUsage,
} from './moneyBudgetPersist'
import { identifier } from './moneyLedgerValues'
import {
  amountFromParts,
  decideExternalSpendReversal,
  externalSpendFinalizationCommandRefusal,
  externalSpendFinalizationDigest,
  externalSpendReversalCommandRefusal,
  readExactAmount,
  reverseCredentialBudget,
  settleCredentialBudget,
  type ExternalSpendFinalizationCommand,
  type ExternalSpendIdentity,
  type ExternalSpendMutationResult,
  type ExternalSpendSettlementStatus,
  type ExternalSpendSubmissionStatus,
} from '../src/modules/money/public'
import {
  externalSpendAccepted,
  externalSpendCustodyFromRow,
  externalSpendIdentityArgs,
  externalSpendIdentityMatches,
  externalSpendRefusal,
  externalSpendReservationView,
  externalSpendSettlementStatus,
  externalSpendSubmissionStatus,
  transitionExternalSpendBudget,
} from './moneyExternalSpendShared'

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
