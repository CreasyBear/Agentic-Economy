import { v } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'

export const readOrganizationMonthlySpendBudgetForAccountArgs = { accountRef: v.string() }
export const readOrganizationMonthlySpendBudgetForAccountResult = v.object({ enabled: v.boolean(), ceilingUnits: v.string() })

export async function readOrganizationMonthlySpendBudgetForAccountHandler(ctx: QueryCtx, args: { accountRef: string }): Promise<{ enabled: boolean; ceilingUnits: string }> {
    const row = await ctx.db
      .query('moneyMonthlySpendBudgets')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', args.accountRef))
      .unique()
    if (row === null || !row.enabled) {
      return { enabled: false, ceilingUnits: '0' }
    }
    return { enabled: true, ceilingUnits: row.ceilingUnits }
}
