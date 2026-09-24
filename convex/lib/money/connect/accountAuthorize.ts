import { v } from 'convex/values'
import { billingSourceArgs, identifier } from '../../../moneyLedgerValues'
import { clerkConsequenceProofValue, type ClerkConsequenceProofInput } from '../../consequenceProof'
import type { BillingSourceWriteArgs } from '../billingAuthorization/sourceWrite'
import type { MutationCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { requireBillingSourceWrite } from '../billingAuthorization/sourceWrite'
import { admitInteractiveOwnerConsequence } from '../../ownerConsequence'
import { payoutAccountView, refusedConnect } from './viewMapping'

export type AuthorizeConnectOnboardingArgs = BillingSourceWriteArgs & {
  businessId: string
  currency: string
  stripeAccountId: string
  expectedAccountVersion: number
  commandRef: string
  idempotencyKey: string
  proof?: ClerkConsequenceProofInput
}

export const authorizeConnectOnboardingArgs = {
  businessId: identifier,
  currency: identifier,
  stripeAccountId: identifier,
  expectedAccountVersion: v.number(),
  commandRef: identifier,
  idempotencyKey: identifier,
  proof: v.optional(clerkConsequenceProofValue),
  ...billingSourceArgs,
}


export async function authorizeConnectOnboardingHandler(
  ctx: MutationCtx,
  args: AuthorizeConnectOnboardingArgs,
) {
  await requireBillingSourceWrite(ctx, args)
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner')
    return refusedConnect('billing_identity_missing', false)
  const businessId = ctx.db.normalizeId('businesses', args.businessId)
  if (businessId === null)
    return refusedConnect('billing_identity_mismatch', false)
  const [business, binding] = await Promise.all([
    ctx.db.get(businessId),
    ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q.eq('businessId', args.businessId).eq('currency', args.currency),
      )
      .unique(),
  ])
  if (
    business === null ||
    business.owningAccountRef !== actor.canonicalAccountRef ||
    binding === null ||
    binding.stripeAccountId !== args.stripeAccountId ||
    !Number.isSafeInteger(args.expectedAccountVersion) ||
    args.expectedAccountVersion < 0
  )
    return refusedConnect('payout_not_ready', false)

  const currentVersion = binding.version ?? 0
  if (
    currentVersion !== args.expectedAccountVersion &&
    currentVersion !== args.expectedAccountVersion + 1
  )
    return refusedConnect('payout_not_ready', false)

  const now = Date.now()
  const consequence = await admitInteractiveOwnerConsequence(ctx, {
    actor,
    action: 'payout_authority.replace',
    target: {
      targetType: 'payout_account',
      targetRef: `payout-account:${args.businessId}:${args.currency}`,
      targetRevision: args.expectedAccountVersion,
    },
    requiredScopes: ['money:payout_authority_manage'],
    resourceRefs: [
      `business:${args.businessId}`,
      `currency:${args.currency}`,
      `destination:${args.stripeAccountId}`,
    ],
    budgetAmount: 0,
    consequenceSummary: 'Reopen Stripe-hosted onboarding for this payout authority.',
    statusReadbackRef: '/owner/operations#earnings',
    command: {
      version: 'ae.payout-authority-replace-consequence:v1',
      businessId: args.businessId,
      currency: args.currency,
      stripeAccountId: args.stripeAccountId,
      expectedAccountVersion: args.expectedAccountVersion,
      nextAccountVersion: args.expectedAccountVersion + 1,
      commandRef: args.commandRef,
      idempotencyKey: args.idempotencyKey,
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

  if (currentVersion === args.expectedAccountVersion + 1) {
    return consequence.proofUse === 'replayed'
      ? { kind: 'accepted' as const, account: payoutAccountView(binding) }
      : refusedConnect('payout_not_ready', false)
  }
  await ctx.db.patch(binding._id, {
    version: args.expectedAccountVersion + 1,
    updatedAt: now,
  })
  const updated = await ctx.db.get(binding._id)
  return updated === null
    ? refusedConnect('payout_reconciliation_required', false)
    : { kind: 'accepted' as const, account: payoutAccountView(updated) }
}
