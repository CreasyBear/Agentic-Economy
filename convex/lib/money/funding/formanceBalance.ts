import { v, type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'

export const readBalanceArgs = {}
export const readBalanceResult = v.union(
  v.object({
    kind: v.literal('available'),
    accountRef: v.string(),
    balance: v.object({ currency: v.literal('AUD'), units: v.string(), exponent: v.literal(6) }),
    totalBalance: v.object({ currency: v.literal('AUD'), units: v.string(), exponent: v.literal(6) }),
    promotionalBalance: v.object({ currency: v.literal('AUD'), units: v.string(), exponent: v.literal(6) }),
    nextPromotionalExpiryAt: v.union(v.number(), v.null()),
    locked: v.boolean(),
    version: v.number(),
    updatedAt: v.optional(v.number()),
    lastTransactionRef: v.optional(v.string()),
    pendingTopup: v.optional(v.object({ commandRef: v.string() })),
  }),
  v.object({ kind: v.literal('refused'), code: v.string(), retryable: v.boolean() }),
)

type BalanceResult = Infer<typeof readBalanceResult>

export async function readBalanceHandler(ctx: ActionCtx): Promise<BalanceResult> {
    const subject: Readonly<
      | { kind: 'resolved'; accountRef: string; locked: boolean }
      | { kind: 'refused'; code: string; retryable: boolean }
    > = await ctx.runQuery(internal.moneyAccountFunding.readBalanceSubject, {})
    if (subject.kind === 'refused') return subject
    const balance: Readonly<
      | { kind: 'available'; units: string; purchasedUnits: string; promotionalUnits: string; nextPromotionalExpiryAt: number | null; observedAt: number }
      | { kind: 'setup_required' | 'unavailable'; code: string }
    > = await ctx.runAction(internal.moneyAccountCreditBalance.read, {
      accountRef: subject.accountRef,
    })
    if (balance.kind !== 'available') {
      return { kind: 'refused' as const, code: balance.code, retryable: true }
    }
    const moneyFacts = await ctx.runQuery(internal.moneyLedger.readCreditAccountMoneyFacts, {
      accountRef: subject.accountRef,
    })
    return {
      kind: 'available' as const,
      accountRef: subject.accountRef,
      balance: { currency: 'AUD' as const, units: balance.purchasedUnits, exponent: 6 as const },
      totalBalance: { currency: 'AUD' as const, units: balance.units, exponent: 6 as const },
      promotionalBalance: { currency: 'AUD' as const, units: balance.promotionalUnits, exponent: 6 as const },
      nextPromotionalExpiryAt: balance.nextPromotionalExpiryAt,
      locked: subject.locked,
      version: balance.observedAt,
      updatedAt: balance.observedAt,
      ...(moneyFacts.pendingTopup === undefined
        ? {}
        : { pendingTopup: { commandRef: moneyFacts.pendingTopup.commandRef } }),
    }
}
