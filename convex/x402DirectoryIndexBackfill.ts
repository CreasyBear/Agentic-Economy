import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalAction, internalMutation, internalQuery } from './_generated/server'
import { activeDirectoryGeneration, directoryGeneration, storedDirectoryEntry } from './lib/x402DirectoryIndex/rows'
import { ANALYTICS_VERSION, searchAnalytics, writeAnalytics } from './lib/x402DirectoryIndex/analytics'
import { parseWorkloadCronSnapshot, reconcileWorkloadCronSnapshot, workloadCronSnapshotValue } from './workloadCron'

/** Rebuild only derived search/aggregate data from retained observations. */
export const batch = internalMutation({
  args: { generation: v.string(), workload: workloadCronSnapshotValue },
  returns: v.object({ kind: v.union(v.literal('building'), v.literal('ready'), v.literal('stale')), processed: v.number() }),
  handler: async (ctx, args) => {
    await reconcileWorkloadCronSnapshot(ctx, 'refresh Agentic Economy API registry', parseWorkloadCronSnapshot(args.workload))
    const generation = await directoryGeneration(ctx, args.generation)
    const active = await activeDirectoryGeneration(ctx)
    if (generation === null || active?.generation !== args.generation) return { kind: 'stale' as const, processed: 0 }
    if (generation.analyticsVersion === ANALYTICS_VERSION && generation.analyticsStatus === 'ready') return { kind: 'ready' as const, processed: generation.analyticsProcessed ?? generation.ingestedCount }
    const page = await ctx.db.query('marketExternalRegistryEntries').withIndex('by_generation_and_documentId', q => q.eq('generation', args.generation))
      .paginate({ numItems: 5, cursor: generation.analyticsCursor ?? null })
    for (const row of page.page) {
      const entry = storedDirectoryEntry(row)
      const projections = await ctx.db.query('marketDirectorySearchEntries').withIndex('by_generation_and_resource', q => q.eq('generation', args.generation).eq('resource', entry.resource)).take(130)
      for (const projection of projections) {
        const projected = searchAnalytics(entry, projection.network)
        await ctx.db.patch(projection._id, { ...projected, minimumUsdPrice: projected.minimumUsdPrice })
      }
      // The projection and memberships commit together. A defined payer order
      // (including the -1 missing sentinel) identifies a committed v1 projection.
      if (!projections.some(projection => projection.network === '*' && projection.payersOrder !== undefined)) await writeAnalytics(ctx, args.generation, entry.resource, entry)
    }
    const processed = (generation.analyticsProcessed ?? 0) + page.page.length
    await ctx.db.patch(generation._id, {
      analyticsVersion: ANALYTICS_VERSION, analyticsStatus: page.isDone ? 'ready' : 'building',
      analyticsProcessed: processed, analyticsCursor: page.isDone ? undefined : page.continueCursor,
    })
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.x402DirectoryIndexBackfill.batch, args)
    return { kind: page.isDone ? 'ready' as const : 'building' as const, processed }
  },
})

export const start = internalAction({
  args: {}, returns: v.object({ kind: v.union(v.literal('building'), v.literal('ready'), v.literal('stale')), processed: v.number() }),
  handler: async (ctx): Promise<{ kind: 'building' | 'ready' | 'stale'; processed: number }> => {
    await ctx.runMutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const workload = await ctx.runQuery(internal.workloadCron.admit, { name: 'refresh Agentic Economy API registry' })
    const status = await ctx.runQuery(internal.x402DirectoryIndexBackfill.state, {})
    if (status.generation === undefined) return { kind: 'stale', processed: 0 }
    return await ctx.runMutation(internal.x402DirectoryIndexBackfill.batch, { generation: status.generation, workload })
  },
})

export const state = internalQuery({
  args: {}, returns: v.object({ generation: v.optional(v.string()), status: v.string(), processed: v.number() }),
  handler: async ctx => {
    const generation = await activeDirectoryGeneration(ctx)
    return { ...(generation === null ? {} : { generation: generation.generation }), status: generation?.analyticsStatus ?? 'missing', processed: generation?.analyticsProcessed ?? 0 }
  },
})
