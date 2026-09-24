import { paginationOptsValidator } from 'convex/server'
import { filter } from 'convex-helpers/server/filter'
import { v, type Infer } from 'convex/values'
import Decimal from 'decimal.js'
import { directoryNetwork, directoryIndexRangesValid, x402DirectoryIndexInputSchema, type X402DirectoryIndexInput } from '@/modules/market/x402-directory-index'
import type { Doc } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'
import { ANALYTICS_VERSION } from './analytics'
import { filterArgs, pageValue } from './contracts'
import { activeDirectoryGeneration, directoryCoverage, indexedDirectoryEntry } from './rows'

type SearchRow = Doc<'marketDirectorySearchEntries'>

/**
 * Joins live, never stored on the directory row: a withdrawn or superseded
 * publication must stop resolving immediately, and this join is the only
 * place that decides "is this resource an admitted Tool right now" - a
 * cached answer would go stale the moment disposition changes underneath it.
 */
export async function admittedToolRef(ctx: QueryCtx, sourceRouteRef: string | undefined): Promise<string | undefined> {
  if (sourceRouteRef === undefined) return undefined
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_sourceRouteRef_and_disposition', q => q.eq('sourceRouteRef', sourceRouteRef).eq('disposition', 'current'))
    .unique()
  return publication?.toolRef
}

export async function withAdmittedToolRefs<Row extends { row: SearchRow; entry: Doc<'marketExternalRegistryEntries'> }>(
  ctx: QueryCtx, entries: readonly Row[],
): Promise<{ row: SearchRow; entry: Doc<'marketExternalRegistryEntries'>; toolRef?: string }[]> {
  return Promise.all(entries.map(async ({ row, entry }) => {
    const toolRef = await admittedToolRef(ctx, row.sourceRouteRef)
    return { row, entry, ...(toolRef === undefined ? {} : { toolRef }) }
  }))
}

/**
 * Eligible-only is the default everywhere except a provider filter: the
 * Provider page intentionally shows its ineligible long tail
 * (docs/architecture/catalogue-distillation.md#9, Lane 1), so a provider
 * filter always reads the un-narrowed indexes. Momentum sort keeps its
 * existing base index (out of Lane 1's scope).
 */
function orderedDirectoryRows(ctx: QueryCtx, generation: string, input: X402DirectoryIndexInput) {
  const network = input.network === undefined ? '*' : directoryNetwork(input.network)
  const rows = ctx.db.query('marketDirectorySearchEntries')
  // Read the narrowed selectors once: the index builders below are closures, so
  // reading input inside them loses the narrowing these branches established.
  const { query, provider, category } = input
  const eligibleOnly = provider === undefined
  if (query) {
    return rows.withSearchIndex('search_text_by_generation_network_category_provider', q => {
      let search = q.search('searchText', query).eq('generation', generation).eq('network', network)
      if (category !== undefined) search = search.eq('category', category)
      if (provider !== undefined) search = search.eq('provider', provider)
      else search = search.eq('eligible', true)
      return search
    })
  }
  if (input.sort === 'momentum') {
    // Base index only: provider/category narrowing happens in the filter chain.
    return rows.withIndex('by_generation_and_network_and_momentumOrder', q => q.eq('generation', generation).eq('network', network)).order('desc')
  }
  if (input.sort === 'adoption') {
    if (provider !== undefined) return rows.withIndex('by_generation_and_network_and_provider_and_payersOrder', q => q.eq('generation', generation).eq('network', network).eq('provider', provider)).order('desc')
    if (category !== undefined) return rows.withIndex('by_generation_and_network_and_elig_and_category_and_payersOrder', q => q.eq('generation', generation).eq('network', network).eq('eligible', eligibleOnly).eq('category', category)).order('desc')
    return rows.withIndex('by_generation_and_network_and_elig_and_payersOrder', q => q.eq('generation', generation).eq('network', network).eq('eligible', eligibleOnly)).order('desc')
  }
  if (input.sort === 'price_asc') {
    if (provider !== undefined) return rows.withIndex('by_generation_and_network_and_provider_and_priceOrder', q => q.eq('generation', generation).eq('network', network).eq('provider', provider)).order('asc')
    if (category !== undefined) return rows.withIndex('by_generation_and_network_and_elig_and_category_and_priceOrder', q => q.eq('generation', generation).eq('network', network).eq('eligible', eligibleOnly).eq('category', category)).order('asc')
    return rows.withIndex('by_generation_and_network_and_elig_and_priceOrder', q => q.eq('generation', generation).eq('network', network).eq('eligible', eligibleOnly)).order('asc')
  }
  if (input.sort === 'updated') {
    if (provider !== undefined) return rows.withIndex('by_generation_and_network_and_provider_and_updatedOrder', q => q.eq('generation', generation).eq('network', network).eq('provider', provider)).order('desc')
    if (category !== undefined) return rows.withIndex('by_gen_net_elig_cat_updated', q => q.eq('generation', generation).eq('network', network).eq('eligible', eligibleOnly).eq('category', category)).order('desc')
    return rows.withIndex('by_generation_and_network_and_elig_and_updatedOrder', q => q.eq('generation', generation).eq('network', network).eq('eligible', eligibleOnly)).order('desc')
  }
  if (provider !== undefined) return rows.withIndex('by_generation_and_network_and_provider_and_popularOrder', q => q.eq('generation', generation).eq('network', network).eq('provider', provider)).order('desc')
  if (category !== undefined) return rows.withIndex('by_gen_net_elig_cat_popular', q => q.eq('generation', generation).eq('network', network).eq('eligible', eligibleOnly).eq('category', category)).order('desc')
  return rows.withIndex('by_generation_and_network_and_elig_and_popularOrder', q => q.eq('generation', generation).eq('network', network).eq('eligible', eligibleOnly)).order('desc')
}

function matchesRemainingConstraints(row: SearchRow, input: X402DirectoryIndexInput): boolean {
  // Defense in depth: the index/search-filter branches above already narrow to
  // eligible===true whenever no provider filter is present; this catches any
  // row read through a path that didn't (e.g. a not-yet-backfilled row).
  if (input.provider === undefined && row.eligible !== true) return false
  if (input.category !== undefined && row.category !== input.category) return false
  if (input.provider !== undefined && row.provider !== input.provider) return false
  if (input.maxUsdPrice !== undefined && (row.minimumUsdPrice === undefined || new Decimal(row.minimumUsdPrice).gt(input.maxUsdPrice))) return false
  if (input.minUsdPrice !== undefined && (row.minimumUsdPrice === undefined || new Decimal(row.minimumUsdPrice).lt(input.minUsdPrice))) return false
  const payersOrder = row.payersOrder ?? -1
  if (input.minPayers30d !== undefined && payersOrder < input.minPayers30d) return false
  if (input.maxPayers30d !== undefined && (payersOrder < 0 || payersOrder > input.maxPayers30d)) return false
  if (input.curatedOnly === true && row.curated !== true) return false
  if (input.priceBand !== undefined && row.priceBand !== input.priceBand) return false
  if (input.adoptionBand !== undefined && row.adoptionBand !== input.adoptionBand) return false
  if (input.tags !== undefined && !input.tags.some(tag => row.tags?.includes(tag))) return false
  if (input.bundleSlugs !== undefined && !input.bundleSlugs.some(slug => row.bundleSlugs?.includes(slug))) return false
  for (const key of ['hasInputFields', 'hasOutputFields', 'hasInputSchema', 'hasOutputSchema', 'hasOutputExample'] as const) if (input[key] !== undefined && Boolean(row[key]) !== input[key]) return false
  return true
}

/** Keyword search is Convex full text; semantic discovery is a separate upstream operation. */
export const browseArgs = v.object({ ...filterArgs, paginationOpts: paginationOptsValidator })
export const browseReturns = pageValue
export const browseHandler = async (ctx: QueryCtx, args: Infer<typeof browseArgs>) => {
    const { paginationOpts, ...filters } = args
    const parsed = x402DirectoryIndexInputSchema.safeParse(filters)
    if (!parsed.success || !directoryIndexRangesValid(parsed.data) || paginationOpts.numItems < 1 || paginationOpts.numItems > 50 || !Number.isSafeInteger(paginationOpts.numItems)) return { kind: 'unavailable' as const, reason: 'query_invalid' }
    if (parsed.data.query && parsed.data.sort !== undefined && parsed.data.sort !== 'relevance') return { kind: 'unavailable' as const, reason: 'query_sort_unsupported' }
    const generation = await activeDirectoryGeneration(ctx)
    if (generation === null) return { kind: 'unavailable' as const, reason: 'index_unavailable' }
    const input = parsed.data
    const needsAnalytics = input.sort === 'adoption' || input.sort === 'price_asc' || input.sort === 'momentum' || ['minUsdPrice', 'minPayers30d', 'maxPayers30d', 'priceBand', 'adoptionBand', 'curatedOnly', 'tags', 'bundleSlugs', 'hasInputFields', 'hasOutputFields', 'hasInputSchema', 'hasOutputSchema', 'hasOutputExample'].some(key => filters[key as keyof typeof filters] !== undefined)
    if (needsAnalytics && (generation.analyticsVersion !== ANALYTICS_VERSION || generation.analyticsStatus !== 'ready')) return { kind: 'unavailable' as const, reason: 'analytics_building' }
    const source = orderedDirectoryRows(ctx, generation.generation, input).filter(q => q.and(
      ...(input.category === undefined ? [] : [q.eq(q.field('category'), input.category)]),
      ...(input.provider === undefined ? [] : [q.eq(q.field('provider'), input.provider)]),
      ...(input.minUsdPrice === undefined ? [] : [q.gte(q.field('minimumUsdPriceOrder'), input.minUsdPrice)]),
      ...(input.minPayers30d === undefined ? [] : [q.gte(q.field('payersOrder'), input.minPayers30d)]),
      ...(input.maxPayers30d === undefined ? [] : [q.gte(q.field('payersOrder'), 0), q.lte(q.field('payersOrder'), input.maxPayers30d)]),
      ...(input.curatedOnly === true ? [q.eq(q.field('curated'), true)] : []),
      ...(input.priceBand === undefined ? [] : [q.eq(q.field('priceBand'), input.priceBand)]),
      ...(input.adoptionBand === undefined ? [] : [q.eq(q.field('adoptionBand'), input.adoptionBand)]),
      ...(input.maxUsdPrice === undefined ? [] : [q.gte(q.field('minimumUsdPriceOrder'), 0), q.lte(q.field('minimumUsdPriceOrder'), input.maxUsdPrice)]),
      ...(input.sort === 'momentum' ? [q.gt(q.field('momentumOrder'), 0)] : []),
    ))
    // Rich source documents have a separate bounded budget from slim search rows.
    // A shorter native page still preserves its cursor and complete traversal.
    const page = await filter(source, row => matchesRemainingConstraints(row, parsed.data)).paginate({
      ...paginationOpts, numItems: Math.min(paginationOpts.numItems, 12),
      maximumRowsRead: Math.min(paginationOpts.maximumRowsRead ?? 512, 512),
      maximumBytesRead: Math.min(paginationOpts.maximumBytesRead ?? 1024 * 1024, 1024 * 1024),
    })
    const rawEntries = await Promise.all(page.page.map(async row => ({ row, entry: await ctx.db.get(row.entryId) })))
    const found = rawEntries.flatMap(({ row, entry }) => entry === null ? [] : [{ row, entry }])
    const withTool = await withAdmittedToolRefs(ctx, found)
    return {
      kind: 'ok' as const, coverage: directoryCoverage(generation),
      searchMethod: parsed.data.query ? 'native_full_text' as const : 'native_index' as const,
      ...page,
      page: withTool.map(({ row, entry, toolRef }) => ({ ...indexedDirectoryEntry(entry, row), ...(toolRef === undefined ? {} : { toolRef }) })),
    }
  }
