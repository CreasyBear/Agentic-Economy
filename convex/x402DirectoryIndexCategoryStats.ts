import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import { parseWorkloadCronSnapshot, reconcileWorkloadCronSnapshot, workloadCronSnapshotValue } from './workloadCron'
import { categoryConcentration } from './lib/x402DirectoryIndex/categoryStats'
import { directoryGeneration } from './lib/x402DirectoryIndex/rows'

// A page of categories per invocation, not a page of resources: with the live
// generation updated in place (Well 8 Lane B), re-reading every resource in
// the whole catalogue every run is exactly the "rescan" cost this redesign
// removes. Driving the loop off the 'category' facet list (already
// maintained incrementally at write time) and reading only THAT category's
// rows keeps each invocation's work proportional to one category, not the
// catalogue.
const CATEGORY_PAGE_SIZE = 25
const ROWS_PER_CATEGORY_CAP = 5000

/**
 * Upserts marketDirectoryCategoryStats one category at a time, from the
 * `by_generation_and_network_and_category_and_payersOrder` index (already
 * exists) scoped to a single category - never a scan across the whole
 * generation. A category with zero remaining rows (e.g. its last resource was
 * swept out) has its stale stats row deleted rather than recomputed.
 */
export const finalize = internalMutation({
  args: { generation: v.string(), workload: workloadCronSnapshotValue, cursor: v.optional(v.string()) },
  returns: v.object({ kind: v.union(v.literal('building'), v.literal('ready')), processed: v.number() }),
  handler: async (ctx, args) => {
    await reconcileWorkloadCronSnapshot(ctx, 'refresh Agentic Economy API registry', parseWorkloadCronSnapshot(args.workload))
    const generation = await directoryGeneration(ctx, args.generation)
    if (generation === null) return { kind: 'building' as const, processed: 0 }
    const categoryPage = await ctx.db.query('marketDirectoryFacets')
      .withIndex('by_generation_and_kind_and_key', q => q.eq('generation', args.generation).eq('kind', 'category'))
      .paginate({ numItems: CATEGORY_PAGE_SIZE, cursor: args.cursor ?? null })
    const computedAt = Date.now()
    for (const facet of categoryPage.page) {
      const category = facet.key
      const rows = await ctx.db.query('marketDirectorySearchEntries')
        .withIndex('by_generation_and_network_and_category_and_payersOrder', q => q.eq('generation', args.generation).eq('network', '*').eq('category', category))
        .order('desc').take(ROWS_PER_CATEGORY_CAP)
      const existing = await ctx.db.query('marketDirectoryCategoryStats')
        .withIndex('by_generation_and_network', q => q.eq('generation', args.generation).eq('network', '*'))
        .filter(q => q.eq(q.field('category'), category)).unique()
      const [stat] = categoryConcentration(rows)
      if (stat === undefined) {
        if (existing !== null) await ctx.db.delete(existing._id)
        continue
      }
      const patch = {
        generation: args.generation, network: '*', category: stat.category, label: stat.label,
        toolCount: stat.toolCount, documentedPayers: stat.documentedPayers,
        totalCalls: stat.totalCalls, totalPayers: stat.totalPayers,
        top3Share: stat.top3Share, hhi: stat.hhi, computedAt,
      }
      if (existing === null) await ctx.db.insert('marketDirectoryCategoryStats', patch)
      else await ctx.db.replace(existing._id, patch)
    }
    const processed = categoryPage.page.length
    if (!categoryPage.isDone) {
      await ctx.scheduler.runAfter(0, internal.x402DirectoryIndexCategoryStats.finalize, { generation: args.generation, workload: args.workload, cursor: categoryPage.continueCursor })
      return { kind: 'building' as const, processed }
    }
    await ctx.db.patch(generation._id, { analyticsStatsStatus: 'ready' })
    return { kind: 'ready' as const, processed }
  },
})
