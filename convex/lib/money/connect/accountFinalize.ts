import { v } from 'convex/values'
import { billingSourceArgs, identifier } from '../../../moneyLedgerValues'
import type { BillingSourceWriteArgs } from '../billingAuthorization/sourceWrite'
import type { MutationCtx } from '../../../_generated/server'
import { requireBillingSourceWrite } from '../billingAuthorization/sourceWrite'
import { connectAccountFinalizeOutcomeArg, transitionPayoutAccount, type ConnectAccountOutcome } from '../../../../src/modules/money/public'
import { connectAccountCommandView, payoutAccountView, refusedConnect } from './viewMapping'

export type FinalizeConnectAccountArgs = BillingSourceWriteArgs & {
  businessId: string
  currency: string
  exponent: number
  idempotencyKey: string
  commandRef: string
  inputDigest: string
  providerRequestDigest: string
  recoveryLeaseOwner: string
  recoveryLeaseGeneration: number
  outcome: ConnectAccountOutcome
}


export const finalizeConnectAccountArgs = {
  businessId: identifier,
  currency: identifier,
  exponent: v.number(),
  idempotencyKey: identifier,
  commandRef: identifier,
  inputDigest: identifier,
  providerRequestDigest: identifier,
  recoveryLeaseOwner: identifier,
  recoveryLeaseGeneration: v.number(),
  outcome: connectAccountFinalizeOutcomeArg,
  ...billingSourceArgs,
}


export async function finalizeConnectAccountHandler(
  ctx: MutationCtx,
  args: FinalizeConnectAccountArgs,
) {
  await requireBillingSourceWrite(ctx, args)
  const command = await ctx.db
    .query('moneyConnectAccountCommands')
    .withIndex('by_commandRef', (q) => q.eq('commandRef', args.commandRef))
    .unique()
  if (
    command === null
    || command.businessId !== args.businessId
    || command.currency !== args.currency
    || command.exponent !== args.exponent
    || command.idempotencyKey !== args.idempotencyKey
    || command.inputDigest !== args.inputDigest
    || command.providerRequestDigest !== args.providerRequestDigest
  ) return refusedConnect('ledger_idempotency_conflict', false)
  const outcome = args.outcome
  if (command.state !== 'pending') {
    const sameOutcome = outcome.state === 'succeeded'
      ? command.state === 'succeeded'
        && command.stripeAccountId === outcome.stripeAccountId
        && command.providerEvidenceRef === outcome.providerEvidenceRef
      : command.state === outcome.state
        && command.failureCode === outcome.failureCode
        && command.failureRetryable === outcome.failureRetryable
    return sameOutcome
      ? { kind: 'accepted' as const, command: connectAccountCommandView(command), execute: false }
      : refusedConnect('ledger_idempotency_conflict', false)
  }
  const now = Date.now()
  const outcomeStripeAccountId = outcome.state === 'succeeded' ? outcome.stripeAccountId : undefined
  const outcomeProviderEvidenceRef = outcome.state === 'succeeded' ? outcome.providerEvidenceRef : undefined
  const retainUnboundProviderOutcome = async () => {
    await ctx.db.patch('moneyConnectAccountCommands', command._id, {
      state: 'outcome_unknown',
      stripeAccountId: outcomeStripeAccountId ?? command.stripeAccountId,
      providerEvidenceRef: outcomeProviderEvidenceRef ?? command.providerEvidenceRef,
      failureCode: 'payout_reconciliation_required',
      failureRetryable: false,
      recoveryLeaseOwner: undefined,
      recoveryLeaseExpiresAt: undefined,
      updatedAt: now,
    })
    return refusedConnect('payout_reconciliation_required', false)
  }
  if (
    command.recoveryLeaseOwner !== args.recoveryLeaseOwner
    || command.recoveryLeaseGeneration !== args.recoveryLeaseGeneration
    || command.recoveryLeaseExpiresAt === undefined
    || now >= command.recoveryLeaseExpiresAt
  ) return refusedConnect('ledger_idempotency_conflict', false)
  if (now >= command.providerRecoveryDeadlineAt)
    return refusedConnect('payout_reconciliation_required', false)
  if (outcome.state === 'succeeded') {
    const stripeAccountId = outcome.stripeAccountId
    const providerEvidenceRef = outcome.providerEvidenceRef
    const [current, stripeBindings] = await Promise.all([
      ctx.db
        .query('moneyPayoutAccounts')
        .withIndex('by_businessId_and_currency', (q) =>
          q.eq('businessId', args.businessId).eq('currency', args.currency),
        )
        .unique(),
      ctx.db
        .query('moneyPayoutAccounts')
        .withIndex('by_stripeAccountId', (q) => q.eq('stripeAccountId', stripeAccountId))
        .take(2),
    ])
    if (
      stripeBindings.some((binding) =>
        binding.businessId !== args.businessId || binding.currency !== args.currency,
      )
      || stripeBindings.length > 1
      || (current !== null && current.stripeAccountId !== stripeAccountId)
    ) return await retainUnboundProviderOutcome()
    const transition = transitionPayoutAccount({
      ...(current === null ? {} : { current: payoutAccountView(current) }),
      businessId: args.businessId,
      currency: args.currency,
      exponent: args.exponent,
      stripeAccountId,
      event: { kind: 'onboarding_started', observedAt: now },
    })
    if (transition.kind === 'refused') return await retainUnboundProviderOutcome()
    if (current === null) await ctx.db.insert('moneyPayoutAccounts', transition.value)
    else await ctx.db.patch('moneyPayoutAccounts', current._id, transition.value)
    await ctx.db.patch('moneyConnectAccountCommands', command._id, {
      state: 'succeeded',
      stripeAccountId,
      providerEvidenceRef,
      failureCode: undefined,
      failureRetryable: undefined,
      recoveryLeaseOwner: undefined,
      recoveryLeaseExpiresAt: undefined,
      updatedAt: now,
    })
  } else {
    await ctx.db.patch('moneyConnectAccountCommands', command._id, {
      state: outcome.state,
      failureCode: outcome.failureCode,
      failureRetryable: outcome.failureRetryable,
      recoveryLeaseOwner: undefined,
      recoveryLeaseExpiresAt: undefined,
      updatedAt: now,
    })
  }
  const updated = await ctx.db.get(command._id)
  return updated === null
    ? refusedConnect('payout_reconciliation_required', false)
    : { kind: 'accepted' as const, command: connectAccountCommandView(updated), execute: false }
}
