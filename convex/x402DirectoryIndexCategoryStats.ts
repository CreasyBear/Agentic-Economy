import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { parseWorkloadCronSnapshot, reconcileWorkloadCronSnapshot, workloadCronSnapshotValue } from './workloadCron'
import { categoryConcentration } from './lib/x402DirectoryIndex/categoryStats'
import { directoryGeneration } from './lib/x402DirectoryIndex/rows'

const STATS_PAGE_SIZE = 250
// A full generation must finish inside one invocation; the self-reschedule is a
// safety valve for pathologically large generations, not the expected path.
const STATS_MAX_PAGES = 200

/**
 * Replaces all category concentration rows for the generation from the FULL
 * '*' projection set, then marks the generation's analytics stats ready.
 */
export const finalize = internalMutation({
  args: { generation: v.string(), workload: workloadCronSnapshotValue, cursor: v.optional(v.string()) },
  returns: v.object({ kind: v.union(v.literal('building'), v.literal('ready')), processed: v.number() }),
  handler: async (ctx, args) => {
    await reconcileWorkloadCronSnapshot(ctx, 'refresh Agentic Economy API registry', parseWorkloadCronSnapshot(args.workload))
    const generation = await directoryGeneration(ctx, args.generation)
    if (generation === null) return { kind: 'building' as const, processed: 0 }
    let cursor = args.cursor ?? null
    let processed = 0
    let rows: Doc<'marketDirectorySearchEntries'>[] = []
    for (let page = 0; page < STATS_MAX_PAGES; page += 1) {
      const result = await ctx.db.query('marketDirectorySearchEntries')
        .withIndex('by_generation_and_network_and_popularOrder', q => q.eq('generation', args.generation).eq('network', '*'))
        .paginate({ numItems: STATS_PAGE_SIZE, cursor })
      rows = rows.concat(result.page)
      processed += result.page.length
      if (result.isDone) {
        const computedAt = Date.now()
        for (const existing of await ctx.db.query('marketDirectoryCategoryStats').withIndex('by_generation_and_network', q => q.eq('generation', args.generation).eq('network', '*')).collect()) {
          await ctx.db.delete(existing._id)
        }
        for (const stat of categoryConcentration(rows)) {
          await ctx.db.insert('marketDirectoryCategoryStats', {
            generation: args.generation, network: '*', category: stat.category, label: stat.label,
            toolCount: stat.toolCount, documentedPayers: stat.documentedPayers,
            totalCalls: stat.totalCalls, totalPayers: stat.totalPayers,
            top3Share: stat.top3Share, hhi: stat.hhi, computedAt,
          })
        }
        await ctx.db.patch(generation._id, { analyticsStatsStatus: 'ready' })
        return { kind: 'ready' as const, processed }
      }
      cursor = result.continueCursor
    }
    await ctx.scheduler.runAfter(0, internal.x402DirectoryIndexCategoryStats.finalize, { generation: args.generation, workload: args.workload, ...(cursor === null ? {} : { cursor }) })
    return { kind: 'building' as const, processed }
  },
})
