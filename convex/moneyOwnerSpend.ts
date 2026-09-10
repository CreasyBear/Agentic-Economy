import { v, type Infer } from 'convex/values'

import { internal } from './_generated/api'
import { action } from './_generated/server'

const spendResult = v.union(
  v.object({
    kind: v.literal('available'),
    currency: v.literal('AUD'),
    exponent: v.literal(6),
    spendUnits: v.string(),
    transactionCountUnits: v.string(),
    periodStartAt: v.number(),
    periodEndAt: v.number(),
    observedAt: v.number(),
    source: v.literal('formance_transaction_cursor'),
    authoritativeForConsequences: v.literal(false),
  }),
  v.object({ kind: v.literal('empty') }),
  v.object({ kind: v.literal('setup_required'), code: v.string() }),
  v.object({ kind: v.literal('unavailable'), code: v.string() }),
  v.object({ kind: v.literal('refused'), code: v.string() }),
)

export const readOwnerSpend = action({
  args: {
    periodStartAt: v.number(),
    periodEndAt: v.number(),
  },
  returns: spendResult,
  handler: async (ctx, args): Promise<Infer<typeof spendResult>> => {
    const admission: Readonly<
      | { kind: 'allowed'; accountRef: string }
      | { kind: 'refused'; code: string }
    > = await ctx.runQuery(internal.capabilityCallProjections.prepareOwnerSpendRead, args)
    if (admission.kind === 'refused') return admission
    return await ctx.runAction(internal.moneyFormance.readPeriodSpend, {
      accountRef: admission.accountRef,
      periodStartAt: args.periodStartAt,
      periodEndAt: args.periodEndAt,
    })
  },
})
