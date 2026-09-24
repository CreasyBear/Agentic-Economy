import { v } from 'convex/values'

import type { MutationCtx } from '../../_generated/server'

export const markFundingBookingUnknownArgs = {
  commandRef: v.string(), stripeEventId: v.string(), observedAt: v.number(),
}
export const markFundingReversalUnknownArgs = {
  paymentId: v.string(), refundId: v.string(), stripeEventId: v.string(),
  statusRef: v.string(), observedAt: v.number(),
}
export const markFundingUnknownResult = v.null()

export async function markFundingBookingUnknownHandler(
  ctx: MutationCtx,
  args: Readonly<{ commandRef: string; stripeEventId: string; observedAt: number }>,
): Promise<null> {
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_commandRef', (builder) => builder.eq('commandRef', args.commandRef))
    .unique()
  if (command !== null && command.state !== 'succeeded' && command.state !== 'failed') {
    await ctx.db.patch(command._id, {
      state: 'outcome_unknown', providerStatus: 'outcome_unknown', updatedAt: args.observedAt,
    })
  }
  return null
}

export async function markFundingReversalUnknownHandler(
  ctx: MutationCtx,
  args: Readonly<{
    paymentId: string
    refundId: string
    stripeEventId: string
    statusRef: string
    observedAt: number
  }>,
): Promise<null> {
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_paymentId', (builder) => builder.eq('paymentId', args.paymentId))
    .unique()
  if (command !== null
    && command.state === 'succeeded'
    && command.reversalRefundId === args.refundId
    && command.reversalStripeEventId === args.stripeEventId) {
    await ctx.db.patch(command._id, {
      reversalState: 'outcome_unknown',
      reversalStatusRef: args.statusRef,
      updatedAt: args.observedAt,
    })
  }
  return null
}
