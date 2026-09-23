import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import { refreshProviderLead } from './lib/x402DirectoryIndex/providerLead'
import { directoryState } from './lib/x402DirectoryIndex/rows'

const PAGE_SIZE = 20

/** Notes each host's busiest Tool so the Providers list can sort. One page per invocation. */
export const backfill = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({ kind: v.union(v.literal('building'), v.literal('ready')), processed: v.number() }),
  handler: async (ctx, args) => {
    const state = await directoryState(ctx)
    const generation = state?.activeGeneration
    if (generation === undefined) return { kind: 'ready' as const, processed: 0 }
    const page = await ctx.db.query('marketDirectoryFacets')
      .withIndex('by_generation_and_kind_and_key', q => q.eq('generation', generation).eq('kind', 'provider'))
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor ?? null })
    for (const facet of page.page) await refreshProviderLead(ctx, generation, facet.key)
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.x402DirectoryIndexProviderLead.backfill, { cursor: page.continueCursor })
      return { kind: 'building' as const, processed: page.page.length }
    }
    return { kind: 'ready' as const, processed: page.page.length }
  },
})
