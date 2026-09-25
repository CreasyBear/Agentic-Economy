import { v } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { InteractiveAuthorityError } from '../../../interactiveAuthority'
import { requireAuthenticatedAccountContext } from '../billingSettings/authority'

type AutoRechargeSettingsRead = Readonly<{
  kind: 'missing' | 'configured'
  revision: number
  enabled: boolean
  thresholdUnits: string
  rechargeAmountUnits: string
}>

export const readAutoRechargeSettingsArgs = {}
export const readAutoRechargeSettingsResult = v.object({
  kind: v.union(v.literal('missing'), v.literal('configured')),
  revision: v.number(),
  enabled: v.boolean(),
  thresholdUnits: v.string(),
  rechargeAmountUnits: v.string(),
})

export async function readAutoRechargeSettingsHandler(ctx: QueryCtx): Promise<AutoRechargeSettingsRead> {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const { canonicalAccountRef } = await requireAuthenticatedAccountContext(ctx.db, identity)

    const row = await ctx.db
      .query('moneyAutoRechargeSettings')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()

    if (row === null) {
      return {
        kind: 'missing',
        revision: 0,
        enabled: false,
        thresholdUnits: '0',
        rechargeAmountUnits: '0',
      }
    }

    return {
      kind: 'configured',
      revision: row.revision,
      enabled: row.enabled,
      thresholdUnits: row.thresholdUnits,
      rechargeAmountUnits: row.rechargeAmountUnits,
    }
}
