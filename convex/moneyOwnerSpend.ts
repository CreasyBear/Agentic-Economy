import { v, type Infer } from 'convex/values'

import { internal } from './_generated/api'
import { action } from './_generated/server'
import { accountHistoryResultValue } from './moneyLedgerValues'

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

/** Account identity is resolved afresh from the authenticated owner on every page. */
export const readOwnerHistory = action({
  args: { cursor: v.optional(v.string()) },
  returns: accountHistoryResultValue,
  handler: async (ctx, args): Promise<Infer<typeof accountHistoryResultValue>> => {
    const subject: Readonly<
      | { kind: 'resolved'; accountRef: string; locked: boolean }
      | { kind: 'refused'; code: string; retryable: boolean }
    > = await ctx.runQuery(internal.moneyAccountFunding.readBalanceSubject, {})
    if (subject.kind === 'refused') return { kind: 'refused', code: subject.code }
    return await ctx.runAction(internal.moneyFormance.readAccountHistory, {
      accountRef: subject.accountRef, ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
    })
  },
})

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
