import { v } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { InteractiveAuthorityError } from '../../../interactiveAuthority'
import { requireAuthenticatedAccountContext } from '../billingSettings/authority'

type MonthlySpendBudgetRead = Readonly<{
  kind: 'missing' | 'configured'
  revision: number
  enabled: boolean
  ceilingUnits: string
}>

export const readMonthlySpendBudgetArgs = {}
export const readMonthlySpendBudgetResult = v.object({
  kind: v.union(v.literal('missing'), v.literal('configured')),
  revision: v.number(),
  enabled: v.boolean(),
  ceilingUnits: v.string(),
})

export async function readMonthlySpendBudgetHandler(ctx: QueryCtx): Promise<MonthlySpendBudgetRead> {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const { canonicalAccountRef } = await requireAuthenticatedAccountContext(ctx.db, identity)

    const row = await ctx.db
      .query('moneyMonthlySpendBudgets')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()

    if (row === null) {
      return {
        kind: 'missing',
        revision: 0,
        enabled: false,
        ceilingUnits: '0',
      }
    }

    return {
      kind: 'configured',
      revision: row.revision,
      enabled: row.enabled,
      ceilingUnits: row.ceilingUnits,
    }
}
