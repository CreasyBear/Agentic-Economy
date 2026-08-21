import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { decideChargeOutcomeUnknown } from '../src/modules/money/public'
import {
  applyPreparedCredentialBudgetTransition,
  prepareCredentialBudgetTransition,
} from './moneyBudgetPersist'
import { readPayoutAccrualAmounts } from './moneyChargeJournal'
import { identifier } from './moneyLedgerValues'
import { appendRefundBody } from './moneyRefund'

function principalAllowed(
  identity: { tokenIdentifier?: string } | null,
  principalId: string,
): boolean {
  if (identity === null || identity.tokenIdentifier === undefined) return false
  return (
    identity.tokenIdentifier === principalId ||
    `clerk_api_key:${identity.tokenIdentifier}` === principalId
  )
}

type ReconcileChargeResult =
  | Readonly<{ kind: 'accepted'; transactionRef: string; outcome: 'released' }>
  | Readonly<{ kind: 'accepted'; transactionRef: string; currency: string }>
  | Readonly<{ kind: 'refused'; code: string; retryable: boolean }>

export type ReconcileChargeInput = Readonly<{
  principalId: string
  transactionRef: string
  outcome: 'not_released' | 'released'
  refundTransactionRef: string
  refundIdempotencyKey: string
  refundInputDigest: string
  sourceDigest: string
  evidenceRefs: readonly string[]
  observedAt: number
}>

export type ReconcileInvocationChargeInput = Readonly<{
  invocationRef: string
  principalId: string
  credentialId: string
  attemptRef: string
  transactionRef: string
  inputDigest: string
  outcome: 'not_released' | 'released'
  refundTransactionRef: string
  refundIdempotencyKey: string
  refundInputDigest: string
  sourceDigest: string
  evidenceRefs: readonly string[]
  observedAt: number
}>

export type MarkChargeOutcomeUnknownInput = Readonly<{
  transactionRef: string
  principalId: string
  now: number
}>

export type InvocationChargeReconciliationResult =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'settled' }>
  | Readonly<{ kind: 'reconciliation_required' }>

export type ChargeOutcomeUnknownResult =
  | Readonly<{ kind: 'outcome_unknown'; transactionRef: string }>
  | Readonly<{ kind: 'refused'; code: string; retryable: boolean }>

export const reconcileChargeArgs = {
  principalId: identifier,
  transactionRef: identifier,
  outcome: v.union(v.literal('not_released'), v.literal('released')),
  refundTransactionRef: identifier,
  refundIdempotencyKey: identifier,
  refundInputDigest: identifier,
  sourceDigest: identifier,
  evidenceRefs: v.array(v.string()),
  observedAt: v.number(),
}
export const reconcileInvocationChargeArgs = {
  invocationRef: identifier,
  principalId: identifier,
  credentialId: identifier,
  attemptRef: identifier,
  transactionRef: identifier,
  inputDigest: identifier,
  outcome: v.union(v.literal('not_released'), v.literal('released')),
  refundTransactionRef: identifier,
  refundIdempotencyKey: identifier,
  refundInputDigest: identifier,
  sourceDigest: identifier,
  evidenceRefs: v.array(v.string()),
  observedAt: v.number(),
}
export const invocationChargeReconciliationResult = v.union(
  v.object({ kind: v.literal('none') }),
  v.object({ kind: v.literal('settled') }),
  v.object({ kind: v.literal('reconciliation_required') }),
)
export const markChargeOutcomeUnknownArgs = {
  transactionRef: identifier,
  principalId: identifier,
  now: v.number(),
}
export const chargeOutcomeUnknownResultValue = v.union(
  v.object({
    kind: v.literal('outcome_unknown'),
    transactionRef: identifier,
  }),
  v.object({
    kind: v.literal('refused'),
    code: identifier,
    retryable: v.boolean(),
  }),
)

export async function reconcileChargeBody(
  ctx: MutationCtx,
  args: ReconcileChargeInput,
  transaction: Doc<'moneyTransactions'>,
): Promise<ReconcileChargeResult> {
  if (args.outcome === 'released') {
    if (
      transaction.state === 'reversed' ||
      transaction.budgetState === 'released'
    )
      return {
        kind: 'refused' as const,
        code: 'charge_reconciliation_required' as const,
        retryable: false,
      }
    const preparedBudget = await prepareCredentialBudgetTransition(
      ctx,
      transaction,
      'released',
      args.observedAt,
    )
    if (preparedBudget === undefined)
      return {
        kind: 'refused' as const,
        code: 'charge_reconciliation_required' as const,
        retryable: false,
      }
    if (
      transaction.amountUnits !== '0' &&
      transaction.settledAt === undefined &&
      transaction.budgetState !== 'settled'
    ) {
      if ((await readPayoutAccrualAmounts(ctx, transaction)) === undefined)
        return {
          kind: 'refused' as const,
          code: 'charge_reconciliation_required' as const,
          retryable: false,
        }
    }
    const shouldApplyState =
      transaction.state === 'outcome_unknown' ||
      transaction.budgetState === 'reserved' ||
      transaction.budgetState === 'unknown' ||
      (
        transaction.amountUnits !== '0' &&
        transaction.settledAt === undefined
      )
    if (shouldApplyState) {
      await applyPreparedCredentialBudgetTransition(ctx, preparedBudget)
      await ctx.db.patch(transaction._id, {
        state: 'applied',
        ...(transaction.amountUnits !== '0' &&
        transaction.settledAt === undefined
          ? { settledAt: args.observedAt }
          : {}),
        updatedAt: args.observedAt,
      })
    }
    return {
      kind: 'accepted' as const,
      transactionRef: args.transactionRef,
      outcome: 'released' as const,
    }
  }
  if (transaction.amountUnits === '0') {
    if (transaction.state === 'reversed')
      return {
        kind: 'accepted' as const,
        transactionRef: args.transactionRef,
        currency: transaction.currency,
      }
    const preparedBudget = await prepareCredentialBudgetTransition(
      ctx,
      transaction,
      'not_released',
      args.observedAt,
    )
    if (preparedBudget === undefined)
      return {
        kind: 'refused' as const,
        code: 'charge_reconciliation_required' as const,
        retryable: false,
      }
    await applyPreparedCredentialBudgetTransition(ctx, preparedBudget)
    await ctx.db.patch(transaction._id, {
      state: 'reversed',
      updatedAt: args.observedAt,
    })
    return {
      kind: 'accepted' as const,
      transactionRef: args.transactionRef,
      currency: transaction.currency,
    }
  }
  return await appendRefundBody(
    ctx,
    {
      principalId: args.principalId,
      originalTransactionRef: args.transactionRef,
      transactionRef: args.refundTransactionRef,
      idempotencyKey: args.refundIdempotencyKey,
      inputDigest: args.refundInputDigest,
      sourceDigest: args.sourceDigest,
      evidenceRefs: args.evidenceRefs,
      observedAt: args.observedAt,
    },
    transaction,
  )
}

export async function reconcileChargeHandler(
  ctx: MutationCtx,
  args: ReconcileChargeInput,
): Promise<ReconcileChargeResult> {
  const identity = await ctx.auth.getUserIdentity()
  if (!principalAllowed(identity, args.principalId))
    return {
      kind: 'refused' as const,
      code: 'billing_identity_missing' as const,
      retryable: false as const,
    }
  const transaction = await ctx.db
    .query('moneyTransactions')
    .withIndex('by_transactionRef', (q) =>
      q.eq('transactionRef', args.transactionRef),
    )
    .unique()
  if (
    transaction === null ||
    transaction.principalId !== args.principalId ||
    transaction.kind !== 'charge'
  )
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false as const,
    }
  return await reconcileChargeBody(ctx, args, transaction)
}

export async function reconcileInvocationChargeHandler(
  ctx: MutationCtx,
  args: ReconcileInvocationChargeInput,
): Promise<InvocationChargeReconciliationResult> {
  const expectedTransactionRef = `operation-money:${args.invocationRef}:${args.attemptRef}:1`
  const expectedRefundTransactionRef = `operation-money-refund:${args.invocationRef}:${args.attemptRef}:1`
  const expectedRefundInputDigest = canonicalDigest({
    format: 'operation-money-refund:v1',
    invocationRef: args.invocationRef,
    attemptRef: args.attemptRef,
    inputDigest: args.inputDigest,
    transactionRef: args.transactionRef,
    outcome: args.outcome,
  } as never)
  if (
    args.transactionRef !== expectedTransactionRef ||
    args.refundTransactionRef !== expectedRefundTransactionRef ||
    args.refundIdempotencyKey !== expectedRefundTransactionRef ||
    args.refundInputDigest !== expectedRefundInputDigest ||
    args.evidenceRefs.length === 0 ||
    args.sourceDigest.length === 0
  )
    return { kind: 'reconciliation_required' as const }
  const usageRows = await ctx.db
    .query('moneyUsageEvents')
    .withIndex('by_invocationRef', (q) =>
      q.eq('invocationRef', args.invocationRef),
    )
    .take(20)
  const transaction = await ctx.db
    .query('moneyTransactions')
    .withIndex('by_transactionRef', (q) =>
      q.eq('transactionRef', args.transactionRef),
    )
    .unique()
  if (usageRows.length === 0)
    return transaction === null
      ? { kind: 'none' as const }
      : { kind: 'reconciliation_required' as const }
  const matchingRows = usageRows.filter(
    (usage) =>
      usage.invocationRef === args.invocationRef &&
      usage.attemptRef === args.attemptRef &&
      usage.principalId === args.principalId &&
      usage.credentialId === args.credentialId,
  )
  if (matchingRows.length === 0)
    return { kind: 'reconciliation_required' as const }
  const usage = matchingRows.find(
    (candidate) => candidate.transactionRef === args.transactionRef,
  )
  if (usage === undefined) {
    return transaction !== null ||
      !matchingRows.every(
        (candidate) =>
          candidate.transactionRef === undefined &&
          candidate.chargeState !== 'paid' &&
          candidate.chargeState !== 'outcome_unknown',
      )
      ? { kind: 'reconciliation_required' as const }
      : { kind: 'none' as const }
  }
  if (
    matchingRows.filter(
      (candidate) => candidate.transactionRef === args.transactionRef,
    ).length !== 1
  )
    return { kind: 'reconciliation_required' as const }
  if (
    transaction === null ||
    transaction.kind !== 'charge' ||
    transaction.principalId !== args.principalId ||
    transaction.credentialId !== args.credentialId ||
    transaction.inputDigest !== args.inputDigest
  )
    return { kind: 'reconciliation_required' as const }
  const result = await reconcileChargeBody(
    ctx,
    {
      principalId: args.principalId,
      transactionRef: args.transactionRef,
      outcome: args.outcome,
      refundTransactionRef: args.refundTransactionRef,
      refundIdempotencyKey: args.refundIdempotencyKey,
      refundInputDigest: args.refundInputDigest,
      sourceDigest: args.sourceDigest,
      evidenceRefs: args.evidenceRefs,
      observedAt: args.observedAt,
    },
    transaction,
  )
  return result.kind === 'accepted'
    ? { kind: 'settled' as const }
    : { kind: 'reconciliation_required' as const }
}

export async function markChargeOutcomeUnknownHandler(
  ctx: MutationCtx,
  args: MarkChargeOutcomeUnknownInput,
): Promise<ChargeOutcomeUnknownResult> {
  const identity = await ctx.auth.getUserIdentity()
  if (!principalAllowed(identity, args.principalId))
    return {
      kind: 'refused' as const,
      code: 'billing_identity_missing' as const,
      retryable: false,
    }
  const transaction = await ctx.db
    .query('moneyTransactions')
    .withIndex('by_transactionRef', (q) =>
      q.eq('transactionRef', args.transactionRef),
    )
    .unique()
  const decision = decideChargeOutcomeUnknown({
    transaction,
    principalId: args.principalId,
  })
  if (decision.kind === 'refused')
    return {
      kind: 'refused' as const,
      code: decision.code,
      retryable: false,
    }
  if (decision.kind === 'already_unknown')
    return {
      kind: 'outcome_unknown' as const,
      transactionRef: decision.transactionRef,
    }
  if (transaction === null)
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  await ctx.db.patch('moneyTransactions', transaction._id, {
    state: 'outcome_unknown',
    budgetState: 'unknown',
    updatedAt: args.now,
  })
  return {
    kind: 'outcome_unknown' as const,
    transactionRef: decision.transactionRef,
  }
}
