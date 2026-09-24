import { v } from 'convex/values'
import { accountUpdatedEventArg, billingSourceArgs, identifier } from '../../../moneyLedgerValues'
import type { BillingSourceWriteArgs } from '../../../moneyBillingAuthorization'
import type { StripeAccountUpdatedWebhookEvent } from '../../../../src/modules/money/public'
import type { MutationCtx } from '../../../_generated/server'
import { requireBillingSourceWrite } from '../../../moneyBillingAuthorization'
import { eventRowFields, eventRowMatches } from '../../../moneyStripeEvents'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { transitionPayoutAccount } from '../../../../src/modules/money/public'
import { payoutAccountView, refusedConnect } from './view-mapping'

export type RecordConnectAccountEventArgs = BillingSourceWriteArgs & {
  businessId: string
  currency: string
  exponent: number
  event: StripeAccountUpdatedWebhookEvent
  readback: {
    detailsSubmitted: boolean
    recipientCapabilityActive: boolean
    restricted: boolean
    requirementsDigest: string
    providerObjectDigest: string
    providerObjectVersion?: number
    observedAt: number
  }
  expectedVersion?: number
}

export const connectAccountReadbackArg = v.object({
  detailsSubmitted: v.boolean(),
  recipientCapabilityActive: v.boolean(),
  restricted: v.boolean(),
  requirementsDigest: identifier,
  providerObjectDigest: identifier,
  providerObjectVersion: v.optional(v.number()),
  observedAt: v.number(),
})

export const recordConnectAccountEventFromInboxArgs = {
  businessId: identifier,
  currency: identifier,
  exponent: v.number(),
  event: accountUpdatedEventArg,
  readback: connectAccountReadbackArg,
  expectedVersion: v.optional(v.number()),
}
export const recordConnectAccountEventArgs = {
  ...recordConnectAccountEventFromInboxArgs,
  ...billingSourceArgs,
}


export async function recordConnectAccountEventHandler(
  ctx: MutationCtx,
  args: RecordConnectAccountEventArgs,
) {
  await requireBillingSourceWrite(ctx, args)
  return await recordConnectAccountEventFromInboxHandler(ctx, args)
}

export async function recordConnectAccountEventFromInboxHandler(
  ctx: MutationCtx,
  args: Omit<RecordConnectAccountEventArgs, keyof BillingSourceWriteArgs>,
) {
  const event = args.event
  if (event.externalRef !== event.stripeAccountId)
    return refusedConnect('payment_binding_invalid', false)
  if (
    event.providerObjectVersion !== undefined &&
    args.readback.providerObjectVersion !== undefined &&
    event.providerObjectVersion !== args.readback.providerObjectVersion
  )
    return refusedConnect('payout_reconciliation_required', false)
  const priorEvent = await ctx.db
    .query('moneyStripeEvents')
    .withIndex('by_stripeEventId', (q) =>
      q.eq('stripeEventId', event.stripeEventId),
    )
    .unique()
  if (priorEvent !== null && !eventRowMatches(priorEvent, event))
    return refusedConnect('ledger_idempotency_conflict', false)
  const [account, stripeBindings] = await Promise.all([
    ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q.eq('businessId', args.businessId).eq('currency', args.currency),
      )
      .unique(),
    ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_stripeAccountId', (q) =>
        q.eq('stripeAccountId', event.stripeAccountId),
      )
      .take(2),
  ])
  if (
    stripeBindings.some(
      (binding) =>
        binding.businessId !== args.businessId ||
        binding.currency !== args.currency,
    ) ||
    stripeBindings.length > 1
  )
    return refusedConnect('payment_binding_invalid', false)
  if (account !== null && account.stripeAccountId !== event.stripeAccountId)
    return refusedConnect('payment_binding_invalid', false)
  if (
    account !== null &&
    account.lastStripeEventId === event.stripeEventId &&
    account.lastStripePayloadDigest === event.payloadDigest &&
    account.providerObjectDigest === args.readback.providerObjectDigest
  )
    return { kind: 'accepted' as const, account: payoutAccountView(account) }
  const currentVersion = account?.version ?? 0
  if (
    args.expectedVersion !== undefined &&
    args.expectedVersion !== currentVersion
  )
    return refusedConnect('payout_reconciliation_required', false)
  if (account !== null) {
    if (
      account.providerObjectVersion !== undefined &&
      event.providerObjectVersion !== undefined &&
      event.providerObjectVersion < account.providerObjectVersion
    )
      return refusedConnect('payout_reconciliation_required', false)
    if (
      account.lastStripeObservedAt !== undefined &&
      event.observedAt <= account.lastStripeObservedAt
    )
      return refusedConnect('payout_reconciliation_required', false)
  }
  const transition = transitionPayoutAccount({
    ...(account === null ? {} : { current: payoutAccountView(account) }),
    businessId: args.businessId,
    currency: args.currency,
    exponent: account?.exponent ?? args.exponent,
    stripeAccountId: event.stripeAccountId,
    event: {
      kind: 'status',
      detailsSubmitted: args.readback.detailsSubmitted,
      recipientCapabilityActive: args.readback.recipientCapabilityActive,
      restricted: args.readback.restricted,
      requirementsDigest: args.readback.requirementsDigest,
      stripeEventId: event.stripeEventId,
      payloadDigest: event.payloadDigest,
      providerObjectDigest: args.readback.providerObjectDigest,
      observedAt: event.observedAt,
    },
  })
  if (transition.kind === 'refused') return transition
  const value = transition.value
  const nextRow = {
    ...value,
    ...(event.providerObjectVersion === undefined
      ? {}
      : { providerObjectVersion: event.providerObjectVersion }),
  }
  if (account === null) await ctx.db.insert('moneyPayoutAccounts', nextRow)
  else await ctx.db.patch('moneyPayoutAccounts', account._id, nextRow)
  const appliedRef = canonicalDigest({
    format: 'money-connect-account-binding:v1',
    businessId: args.businessId,
    currency: args.currency,
    stripeAccountId: event.stripeAccountId,
  })
  if (priorEvent === null)
    await ctx.db.insert('moneyStripeEvents', {
      ...eventRowFields(event),
      status: 'applied',
      appliedRef,
      appliedAt: event.observedAt,
    })
  else
    await ctx.db.patch('moneyStripeEvents', priorEvent._id, {
      status: 'applied',
      appliedRef,
      appliedAt: event.observedAt,
    })
  const updated =
    account === null
      ? await ctx.db
          .query('moneyPayoutAccounts')
          .withIndex('by_businessId_and_currency', (q) =>
            q.eq('businessId', args.businessId).eq('currency', args.currency),
          )
          .unique()
      : await ctx.db.get(account._id)
  return updated === null
    ? refusedConnect('payout_reconciliation_required', false)
    : { kind: 'accepted' as const, account: payoutAccountView(updated) }
}
