import { v } from 'convex/values'
import { normalizePricingConfig } from '@/modules/money/public'
import { internalQuery } from './_generated/server'

/** Bounded server-only source amounts; display values never authorize a Quote. */
export const priceSources = internalQuery({
  args: { toolRefs: v.array(v.string()) },
  returns: v.array(v.object({ toolRef: v.string(), environment: v.union(v.literal('sandbox'), v.literal('production')), atomicUnits: v.string() })),
  handler: async (ctx, args) => {
    if (args.toolRefs.length > 100) throw new Error('catalog_page_too_large')
    const result = []
    for (const toolRef of args.toolRefs) {
      const row = await ctx.db.query('capabilityPublications').withIndex('by_toolRef_and_disposition', (q) => q.eq('toolRef', toolRef).eq('disposition', 'current')).unique()
      if (row?.pricingConfigJson === undefined) continue
      let parsed: unknown
      try { parsed = JSON.parse(row.pricingConfigJson) } catch { continue }
      const price = normalizePricingConfig(parsed)
      if (price.kind !== 'valid' || price.config.kind !== 'managed_x402') continue
      result.push({ toolRef, environment: row.runtimeEnvironment, atomicUnits: price.config.sourceRequirement.atomicUnits })
    }
    return result
  },
})

/** AE network membership is publication metadata, separate from payment networks. */
export const filterNetwork = internalQuery({
  args: { toolRefs: v.array(v.string()), networkId: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    if (args.toolRefs.length > 100) throw new Error('catalog_page_too_large')
    const refs: string[] = []
    for (const toolRef of args.toolRefs) {
      const row = await ctx.db.query('capabilityPublications').withIndex('by_toolRef_and_disposition', (q) => q.eq('toolRef', toolRef).eq('disposition', 'current')).unique()
      if (row?.networkId === args.networkId) refs.push(toolRef)
    }
    return refs
  },
})
