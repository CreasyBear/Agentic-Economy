import { v } from 'convex/values'
import { normalizePricingConfig } from '@/modules/money/public'
import { internal } from './_generated/api'
import { internalMutation, internalQuery } from './_generated/server'

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

/** One invocation drains existing rows through native scheduled page continuations. */
export const backfillSearchText = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({ done: v.boolean(), cursor: v.string(), updated: v.number() }),
  handler: async (ctx, args): Promise<{ done: boolean; cursor: string; updated: number }> => {
    const page = await ctx.db.query('capabilityPublications').paginate({ cursor: args.cursor ?? null, numItems: 50 })
    for (const row of page.page) {
      const offering = await ctx.db.query('capabilityOfferings').withIndex('by_offeringId', (q) => q.eq('offeringId', row.offeringId)).unique()
      const business = await ctx.db.get(row.businessId)
      await ctx.db.patch(row._id, { searchText: [row.capabilityId, offering?.presentation.label, offering?.presentation.summary, ...(offering?.searchTerms ?? []), business?.name].filter(Boolean).join(' ') })
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.capabilityToolCatalogData.backfillSearchText, { cursor: page.continueCursor })
    return { done: page.isDone, cursor: page.continueCursor, updated: page.page.length }
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
