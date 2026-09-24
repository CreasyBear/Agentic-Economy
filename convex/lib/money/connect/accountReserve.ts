import { v } from 'convex/values'
import { billingSourceArgs, identifier } from '../../../moneyLedgerValues'
import { clerkConsequenceProofValue, type ClerkConsequenceProofInput } from '../../consequenceProof'
import type { BillingSourceWriteArgs } from '../billingAuthorization/sourceWrite'
import type { MutationCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { requireBillingSourceWrite } from '../billingAuthorization/sourceWrite'
import { STRIPE_CONNECT_RECOVERY_LEASE_MS, STRIPE_CONNECT_RECOVERY_WINDOW_MS } from '../../../../src/modules/money/public'
import { admitInteractiveOwnerConsequence } from '../../ownerConsequence'
import { connectAccountCommandView, refusedConnect } from './viewMapping'

export type ReserveConnectAccountArgs = BillingSourceWriteArgs & {
  businessId: string
  currency: string
  exponent: number
  idempotencyKey: string
  commandRef: string
  inputDigest: string
  providerRequestDigest: string
  recoveryLeaseOwner: string
  proof?: ClerkConsequenceProofInput
}

export const reserveConnectAccountArgs = {
  businessId: identifier,
  currency: identifier,
  exponent: v.number(),
  idempotencyKey: identifier,
  commandRef: identifier,
  inputDigest: identifier,
  providerRequestDigest: identifier,
  recoveryLeaseOwner: identifier,
  proof: v.optional(clerkConsequenceProofValue),
  ...billingSourceArgs,
}


export async function reserveConnectAccountHandler(
  ctx: MutationCtx,
  args: ReserveConnectAccountArgs,
) {
  await requireBillingSourceWrite(ctx, args)
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner')
    return refusedConnect('billing_identity_missing', false)
  const businessId = ctx.db.normalizeId('businesses', args.businessId)
  if (businessId === null)
    return refusedConnect('billing_identity_mismatch', false)
  const business = await ctx.db.get(businessId)
  if (business === null || business.owningAccountRef !== actor.canonicalAccountRef)
    return refusedConnect('billing_identity_mismatch', false)

  const now = Date.now()
  const [binding, commands, sameKey] = await Promise.all([
    ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q.eq('businessId', args.businessId).eq('currency', args.currency),
      )
      .unique(),
    ctx.db
      .query('moneyConnectAccountCommands')
      .withIndex('by_businessId_and_currency', (q) =>
        q.eq('businessId', args.businessId).eq('currency', args.currency),
      )
      .take(21),
    ctx.db
      .query('moneyConnectAccountCommands')
      .withIndex('by_businessId_and_currency_and_idempotencyKey', (q) =>
        q
          .eq('businessId', args.businessId)
          .eq('currency', args.currency)
          .eq('idempotencyKey', args.idempotencyKey),
      )
      .unique(),
  ])
  if (sameKey !== null && (
    sameKey.commandRef !== args.commandRef
    || sameKey.inputDigest !== args.inputDigest
    || sameKey.providerRequestDigest !== args.providerRequestDigest
    || sameKey.exponent !== args.exponent
  )) return refusedConnect('ledger_idempotency_conflict', false)

  const bindingReplay =
    binding !== null
    && sameKey !== null
    && sameKey.state === 'succeeded'
    && sameKey.stripeAccountId === binding.stripeAccountId
  if (binding !== null && !bindingReplay)
    return refusedConnect('payment_binding_invalid', false)
  if (
    binding === null
    && sameKey === null
    && (commands.length > 20 || commands.some((command) => command.state !== 'failed'))
  ) return refusedConnect('payout_reconciliation_required', false)

  const consequence = await admitInteractiveOwnerConsequence(ctx, {
    actor,
    action: 'payout_authority.create',
    target: {
      targetType: 'payout_account',
      targetRef: `payout-account:${args.businessId}:${args.currency}`,
      targetRevision: (binding?.version ?? 0) + 1,
    },
    requiredScopes: ['money:payout_authority_manage'],
    resourceRefs: [`business:${args.businessId}`, `currency:${args.currency}`],
    budgetAmount: 0,
    consequenceSummary: 'Create this Stripe-hosted payout authority for the owner Account.',
    statusReadbackRef: '/owner/operations#earnings',
    command: {
      version: 'ae.payout-authority-consequence:v1',
      action: 'payout_authority.create',
      businessId: args.businessId,
      currency: args.currency,
      exponent: args.exponent,
      commandRef: args.commandRef,
      idempotencyKey: args.idempotencyKey,
      inputDigest: args.inputDigest,
      providerRequestDigest: args.providerRequestDigest,
      targetRevision: (binding?.version ?? 0) + 1,
    },
    correlationRef: args.correlationId,
    idempotencyRef: args.idempotencyKey,
    ...(args.proof === undefined ? {} : { proof: args.proof }),
    now,
  })
  if (consequence.kind === 'refused')
    return refusedConnect(
      consequence.code,
      consequence.code === 'rate_limited' || consequence.code === 'security_control_unavailable',
      consequence.correlationRef,
    )

  if (bindingReplay)
    return { kind: 'accepted' as const, command: connectAccountCommandView(sameKey), execute: false }
  const leaseExpiresAt = now + STRIPE_CONNECT_RECOVERY_LEASE_MS
  if (sameKey !== null) {
    if (sameKey.state === 'succeeded')
      return { kind: 'accepted' as const, command: connectAccountCommandView(sameKey), execute: false }
    if (sameKey.state === 'failed') {
      const recoveryLeaseGeneration = sameKey.recoveryLeaseGeneration + 1
      await ctx.db.patch('moneyConnectAccountCommands', sameKey._id, {
        state: 'pending',
        recoveryLeaseOwner: args.recoveryLeaseOwner,
        recoveryLeaseGeneration,
        recoveryLeaseExpiresAt: leaseExpiresAt,
        failureCode: undefined,
        failureRetryable: undefined,
        updatedAt: now,
      })
      const updated = await ctx.db.get(sameKey._id)
      return updated === null
        ? refusedConnect('payout_reconciliation_required', false)
        : { kind: 'accepted' as const, command: connectAccountCommandView(updated), execute: true }
    }
    if (now >= sameKey.providerRecoveryDeadlineAt) {
      if (
        sameKey.state !== 'outcome_unknown'
        || sameKey.failureCode !== 'payout_reconciliation_required'
        || sameKey.failureRetryable !== false
        || sameKey.recoveryLeaseOwner !== undefined
        || sameKey.recoveryLeaseExpiresAt !== undefined
      ) {
        await ctx.db.patch('moneyConnectAccountCommands', sameKey._id, {
          state: 'outcome_unknown',
          failureCode: 'payout_reconciliation_required',
          failureRetryable: false,
          recoveryLeaseOwner: undefined,
          recoveryLeaseExpiresAt: undefined,
          updatedAt: now,
        })
      }
      const updated = await ctx.db.get(sameKey._id)
      return updated === null
        ? refusedConnect('payout_reconciliation_required', false)
        : { kind: 'accepted' as const, command: connectAccountCommandView(updated), execute: false }
    }
    if (
      sameKey.recoveryLeaseOwner !== undefined
      && sameKey.recoveryLeaseExpiresAt !== undefined
      && sameKey.recoveryLeaseExpiresAt > now
    ) {
      return { kind: 'accepted' as const, command: connectAccountCommandView(sameKey), execute: false }
    }
    const recoveryLeaseGeneration = sameKey.recoveryLeaseGeneration + 1
    await ctx.db.patch('moneyConnectAccountCommands', sameKey._id, {
      state: 'pending',
      recoveryLeaseOwner: args.recoveryLeaseOwner,
      recoveryLeaseGeneration,
      recoveryLeaseExpiresAt: leaseExpiresAt,
      failureCode: undefined,
      failureRetryable: undefined,
      updatedAt: now,
    })
    const updated = await ctx.db.get(sameKey._id)
    return updated === null
      ? refusedConnect('payout_reconciliation_required', false)
      : { kind: 'accepted' as const, command: connectAccountCommandView(updated), execute: true }
  }
  const row = {
    commandRef: args.commandRef,
    businessId: args.businessId,
    currency: args.currency,
    exponent: args.exponent,
    idempotencyKey: args.idempotencyKey,
    inputDigest: args.inputDigest,
    providerRequestDigest: args.providerRequestDigest,
    providerRecoveryDeadlineAt: now + STRIPE_CONNECT_RECOVERY_WINDOW_MS,
    recoveryLeaseGeneration: 1,
    recoveryLeaseOwner: args.recoveryLeaseOwner,
    recoveryLeaseExpiresAt: leaseExpiresAt,
    state: 'pending' as const,
    createdAt: now,
    updatedAt: now,
  }
  await ctx.db.insert('moneyConnectAccountCommands', row)
  return { kind: 'accepted' as const, command: row, execute: true }
}
