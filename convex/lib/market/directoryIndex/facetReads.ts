import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v, type Infer } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { analyticsNamespace, eligibleFacetsNamespace } from './analytics'
import { coverageValue, facetValue, indexedEntryValue, unavailableValue } from './contracts'
import { directoryFacets } from './facets'
import { activeDirectoryGeneration, directoryCoverage, directoryState } from './rows'

/**
 * Category/provider/network counts default to the eligible-only namespace
 * (mirrored at write time in x402DirectoryIndexStore.writeFacetMembership);
 * tag/bundle counts stay generation-wide for now (deferred — see Lane 1
 * report note). The `facets` query has no provider argument, so it is always
 * eligible-only; `overview`'s category/provider/network shelves pass the
 * same default.
 */
export async function readFacets(ctx: QueryCtx, generation: string, kind: 'category' | 'provider' | 'network' | 'tag' | 'bundle', limit: number, eligibleOnly: boolean) {
  const rows = await ctx.db.query('marketDirectoryFacets')
    .withIndex('by_generation_and_kind_and_key', q => q.eq('generation', generation).eq('kind', kind)).take(limit)
  const namespace = kind === 'tag' || kind === 'bundle' ? analyticsNamespace(generation) : eligibleOnly ? eligibleFacetsNamespace(generation) : generation
  const counts = await directoryFacets.countBatch(ctx, rows.map(row => ({ namespace, bounds: { prefix: [kind, row.key] } })))
  return rows.flatMap((row, index) => {
    const count = counts[index] ?? 0
    return count === 0 ? [] : [{ key: row.key, label: row.label, count, ...(row.iconUrl === undefined ? {} : { iconUrl: row.iconUrl }) }]
  })
}

/** Cursor traversal of every declared facet; overview is only a bounded sample. */
export const facetsArgs = v.object({ kind: v.union(v.literal('category'), v.literal('provider'), v.literal('network'), v.literal('tag'), v.literal('bundle')), paginationOpts: paginationOptsValidator })
export const facetsReturns = v.union(unavailableValue, v.object({ kind: v.literal('ok'), coverage: coverageValue, ...paginationResultValidator(facetValue).fields }))
export const facetsHandler = async (ctx: QueryCtx, args: Infer<typeof facetsArgs>) => {
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) return { kind: 'unavailable' as const, reason: 'query_invalid' }
    const generation = await activeDirectoryGeneration(ctx)
    if (generation === null) return { kind: 'unavailable' as const, reason: 'index_unavailable' }
    const paginationOpts = { ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 24) }
    const byKey = () => ctx.db.query('marketDirectoryFacets').withIndex('by_generation_and_kind_and_key', q => q.eq('generation', generation.generation).eq('kind', args.kind)).paginate(paginationOpts)
    const ranked = args.kind === 'provider'
      ? await ctx.db.query('marketDirectoryFacets').withIndex('by_generation_and_kind_and_leadCalls', q => q.eq('generation', generation.generation).eq('kind', 'provider')).order('desc').paginate(paginationOpts)
      : null
    // Until the lead is noted, the key order still lists every host.
    const page = ranked !== null && (ranked.page.length > 0 || args.paginationOpts.cursor !== null) ? ranked : await byKey()
    // No provider argument on this query: category/provider/network are always eligible-only.
    const namespace = args.kind === 'tag' || args.kind === 'bundle' ? analyticsNamespace(generation.generation) : eligibleFacetsNamespace(generation.generation)
    const counts = await directoryFacets.countBatch(ctx, page.page.map(row => ({ namespace, bounds: { prefix: [args.kind, row.key] } })))
    return {
      kind: 'ok' as const, coverage: directoryCoverage(generation), ...page,
      page: page.page.flatMap((row, index) => {
        const count = counts[index] ?? 0
        const leadCalls = row.kind === 'provider' ? row.leadCalls : undefined
        return count === 0 ? [] : [{
          key: row.key, label: row.label, count, ...(row.iconUrl === undefined ? {} : { iconUrl: row.iconUrl }),
          ...(leadCalls === undefined || leadCalls < 0 ? {} : {
            leadCalls,
            ...(row.leadPayers === undefined ? {} : { leadPayers: row.leadPayers }),
            ...(row.leadTitle === undefined ? {} : { leadTitle: row.leadTitle }),
            ...(row.leadPrice === undefined ? {} : { leadPrice: row.leadPrice }),
            ...(row.leadSlug === undefined ? {} : { leadSlug: row.leadSlug }),
          }),
        }]
      }),
    }
  }

export const overviewArgs = v.object({})
export const overviewReturns = v.union(unavailableValue, v.object({
    kind: v.literal('ok'), coverage: coverageValue,
    categories: v.array(facetValue), providers: v.array(facetValue), networks: v.array(facetValue), tags: v.optional(v.array(facetValue)), bundleSlugs: v.optional(v.array(facetValue)),
    popular: v.array(indexedEntryValue), recentlyUpdated: v.array(indexedEntryValue),
    rising: v.array(indexedEntryValue), falling: v.array(indexedEntryValue),
  }))
export const overviewHandler = async (ctx: QueryCtx) => {
    const generation = await activeDirectoryGeneration(ctx)
    if (generation === null) return { kind: 'unavailable' as const, reason: 'index_unavailable' }
    const [categories, providers, networks] = await Promise.all([
      readFacets(ctx, generation.generation, 'category', 128, true), readFacets(ctx, generation.generation, 'provider', 12, true), readFacets(ctx, generation.generation, 'network', 32, true),
    ])
    const popular: Array<never> = []
    const recentlyUpdated: Array<never> = []
    const rising: Array<never> = []
    const falling: Array<never> = []
    // Tags/bundles stay generation-wide (deferred, see readFacets comment).
    const labels = generation.analyticsStatus === 'ready' ? { tags: await readFacets(ctx, generation.generation, 'tag', 64, false), bundleSlugs: await readFacets(ctx, generation.generation, 'bundle', 64, false) } : {}
    return { kind: 'ok' as const, coverage: directoryCoverage(generation), categories, providers, networks, popular, recentlyUpdated, rising, falling, ...labels }
  }

export const statusArgs = v.object({})
export const statusReturns = v.object({
    kind: v.union(v.literal('unavailable'), v.literal('ready')), coverage: v.optional(coverageValue),
    refreshState: v.union(v.literal('none'), v.literal('refreshing'), v.literal('complete'), v.literal('failed')),
    lastError: v.optional(v.string()),
  })
export const statusHandler = async (ctx: QueryCtx) => {
    const [state, generation] = await Promise.all([directoryState(ctx), activeDirectoryGeneration(ctx)])
    return {
      kind: generation === null ? 'unavailable' as const : 'ready' as const,
      ...(generation === null ? {} : { coverage: directoryCoverage(generation) }),
      refreshState: state?.lastAttemptStatus ?? 'none' as const,
      ...(state?.lastError === undefined ? {} : { lastError: state.lastError }),
    }
  }
