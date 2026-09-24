import { v, type Infer } from 'convex/values'
import { internal } from '../../_generated/api'
import type { MutationCtx } from '../../_generated/server'
import { deleteAnalyticsMembership, eligibleFacetsNamespace } from './analytics'
import { directoryFacets } from './facets'
import { facetKeys } from './membership'
import { refreshProviderLead } from './providerLead'
import { directoryGeneration, directoryState, storedDirectoryEntry } from './rows'

/**
 * Removal sweep (Well 8 Lane B): replaces the old "delete the abandoned
 * generation" cleanup. The live generation is never torn down wholesale
 * anymore - this deletes only the resources a full, successful scan did NOT
 * see this run (`lastSeenRunAt < runStartedAt`), decrementing their facet
 * memberships the same budgeted way the old cleanup did. Scheduled only from
 * x402DirectoryIndexRefresh.onComplete after a scan reports `kind: 'complete'`
 * - never after a partial/failed scan (see `fail` above).
 */
export const cleanupArgs = v.object({ generation: v.string(), runStartedAt: v.number() })
export const cleanupReturns = v.null()
export const cleanupHandler = async (ctx: MutationCtx, args: Infer<typeof cleanupArgs>) => {
    const state = await directoryState(ctx)
    if (state?.activeGeneration !== args.generation) return null
    const generation = await directoryGeneration(ctx, args.generation)
    if (generation === null) return null
    // Batch 200, same facet-key budget pattern as the old cleanup: each row's
    // facetKeys() fans out to category + provider + up to 128 network
    // aggregate deletes, so the budget (not the row count) bounds one
    // invocation's work.
    const CLEANUP_FACET_KEY_BUDGET = 2000
    const stale = await ctx.db.query('marketExternalRegistryEntries')
      .withIndex('by_generation_and_lastSeenRunAt', q => q.eq('generation', args.generation).lt('lastSeenRunAt', args.runStartedAt))
      .take(200)
    if (stale.length === 0) {
      console.info(JSON.stringify({ kind: 'x402_directory_sweep_complete', generation: args.generation }))
      return null
    }
    let keyBudget = 0
    let deleted = 0
    for (const [processed, row] of stale.entries()) {
      const keys = facetKeys(row)
      if (processed > 0 && keyBudget + keys.length > CLEANUP_FACET_KEY_BUDGET) break
      if (row.source !== 'coinbase') throw new Error('directory_cleanup_source_conflict')
      const endpointUrl = row.endpointUrl
      if (endpointUrl === undefined) throw new Error('directory_cleanup_endpoint_missing')
      const searchRows = await ctx.db.query('marketDirectorySearchEntries')
        .withIndex('by_generation_and_resource', q => q.eq('generation', args.generation).eq('resource', endpointUrl)).take(130)
      const wasEligible = searchRows.some(searchRow => searchRow.eligible === true)
      for (const key of keys) {
        await directoryFacets.delete(ctx, { namespace: args.generation, key, id: endpointUrl })
        if (wasEligible) await directoryFacets.deleteIfExists(ctx, { namespace: eligibleFacetsNamespace(args.generation), key, id: endpointUrl })
      }
      await deleteAnalyticsMembership(ctx, args.generation, endpointUrl, storedDirectoryEntry(row))
      for (const searchRow of searchRows) await ctx.db.delete(searchRow._id)
      await refreshProviderLead(ctx, args.generation, row.provider)
      await ctx.db.delete(row._id)
      deleted += 1
      keyBudget += keys.length
    }
    if (deleted > 0) await ctx.db.patch(generation._id, { ingestedCount: Math.max(0, generation.ingestedCount - deleted) })
    console.info(JSON.stringify({ kind: 'x402_directory_sweep_progress', generation: args.generation, deleted }))
    await ctx.scheduler.runAfter(0, internal.x402DirectoryIndexStore.cleanup, args)
    return null
  }
