import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { filter } from 'convex-helpers/server/filter'
import { v } from 'convex/values'
import Decimal from 'decimal.js'

import {
  directoryEntryMatchesFilters, directoryNetwork, directoryIndexRangesValid, x402DirectoryIndexInputSchema,
  type X402DirectoryIndexInput,
} from '@/modules/market/x402-directory-index'
import type { Doc } from './_generated/dataModel'
import { internalQuery, query, type QueryCtx } from './_generated/server'
import {
  coverageValue, directoryEntryValue, filterArgs, indexedEntryValue, pageValue, unavailableValue,
} from './lib/x402DirectoryIndex/contracts'
import { directoryFacets } from './lib/x402DirectoryIndex/facets'
import {
  activeDirectoryGeneration, directoryCoverage, directoryState, indexedDirectoryEntry, storedDirectoryEntry,
} from './lib/x402DirectoryIndex/rows'

import { ANALYTICS_VERSION, analyticsNamespace, eligibleFacetsNamespace } from './lib/x402DirectoryIndex/analytics'
import { DIRECTORY_ADOPTION_BANDS, DIRECTORY_DEPTH_BANDS, DIRECTORY_MOMENTUM_BANDS, DIRECTORY_PRICE_BANDS, DIRECTORY_RECENCY_BANDS } from '@/modules/market/x402-directory-index'

type SearchRow = Doc<'marketDirectorySearchEntries'>

/**
 * Joins live, never stored on the directory row: a withdrawn or superseded
 * publication must stop resolving immediately, and this join is the only
 * place that decides "is this resource an admitted Tool right now" - a
 * cached answer would go stale the moment disposition changes underneath it.
 */
async function admittedToolRef(ctx: QueryCtx, sourceRouteRef: string | undefined): Promise<string | undefined> {
  if (sourceRouteRef === undefined) return undefined
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_sourceRouteRef_and_disposition', q => q.eq('sourceRouteRef', sourceRouteRef).eq('disposition', 'current'))
    .unique()
  return publication?.toolRef
}

async function withAdmittedToolRefs<Row extends { row: SearchRow; entry: Doc<'marketExternalRegistryEntries'> }>(
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
export const browse = query({
  args: { ...filterArgs, paginationOpts: paginationOptsValidator },
  returns: pageValue,
  handler: async (ctx, args) => {
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
  },
})

export const resource = query({
  args: { resource: v.string() },
  returns: v.union(unavailableValue, v.object({ kind: v.literal('not_found') }), v.object({ kind: v.literal('found'), coverage: coverageValue, item: indexedEntryValue })),
  handler: async (ctx, args) => {
    if (args.resource.length === 0 || args.resource.length > 8192) return { kind: 'unavailable' as const, reason: 'query_invalid' }
    const generation = await activeDirectoryGeneration(ctx)
    if (generation === null) return { kind: 'unavailable' as const, reason: 'index_unavailable' }
    const selected = await ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_network_and_resource', q => q.eq('generation', generation.generation).eq('network', '*').eq('resource', args.resource)).unique()
    const row = selected === null ? null : await ctx.db.get(selected.entryId)
    if (row === null || selected === null) return { kind: 'not_found' as const }
    const toolRef = await admittedToolRef(ctx, selected.sourceRouteRef)
    return { kind: 'found' as const, coverage: directoryCoverage(generation), item: { ...indexedDirectoryEntry(row, selected), ...(toolRef === undefined ? {} : { toolRef }) } }
  },
})

/**
 * Canonical `/tools/<providerKey>/<slug>` lookup: an indexed read (title,
 * Provider, price, description render synchronously from this) plus the
 * admitted toolRef when the same join above already found one - a pure V8
 * query/action path, so a cache hit never pays the Node admission action's
 * cold start (convex/x402Directory.ts).
 */
export const bySlug = query({
  args: { providerKey: v.string(), slug: v.string() },
  returns: v.union(unavailableValue, v.object({ kind: v.literal('not_found') }), v.object({ kind: v.literal('found'), coverage: coverageValue, item: indexedEntryValue })),
  handler: async (ctx, args) => {
    if (args.providerKey.length === 0 || args.providerKey.length > 253 || args.slug.length === 0 || args.slug.length > 200) return { kind: 'unavailable' as const, reason: 'query_invalid' }
    const generation = await activeDirectoryGeneration(ctx)
    if (generation === null) return { kind: 'unavailable' as const, reason: 'index_unavailable' }
    const selected = await ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_providerKey_and_slug', q => q.eq('generation', generation.generation).eq('providerKey', args.providerKey).eq('slug', args.slug))
      .filter(q => q.eq(q.field('network'), '*'))
      .unique()
    const row = selected === null ? null : await ctx.db.get(selected.entryId)
    if (row === null || selected === null) return { kind: 'not_found' as const }
    const toolRef = await admittedToolRef(ctx, selected.sourceRouteRef)
    return { kind: 'found' as const, coverage: directoryCoverage(generation), item: { ...indexedDirectoryEntry(row, selected), ...(toolRef === undefined ? {} : { toolRef }) } }
  },
})

/**
 * Reverse lookup for the `/tools/$toolRef` redirect: an admitted Tool's
 * current publication back to the directory entry's canonical URL, so an
 * agent-facing `operation:v1:` link still lands on a shareable, human-legible
 * page. `null` (no directory entry, or the Tool did not originate from this
 * directory) keeps the caller on the existing `/tools/$toolRef` page.
 */
export const canonicalUrlForTool = query({
  args: { toolRef: v.string() },
  returns: v.union(v.null(), v.object({ providerHost: v.string(), slug: v.string() })),
  handler: async (ctx, args) => {
    const publication = await ctx.db.query('capabilityPublications')
      .withIndex('by_toolRef_and_disposition', q => q.eq('toolRef', args.toolRef).eq('disposition', 'current')).unique()
    if (publication === null || publication.sourceRouteRef === undefined) return null
    const generation = await activeDirectoryGeneration(ctx)
    if (generation === null) return null
    const row = await ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_sourceRouteRef', q => q.eq('generation', generation.generation).eq('sourceRouteRef', publication.sourceRouteRef))
      .filter(q => q.eq(q.field('network'), '*'))
      .first()
    return row === null || row.providerKey === undefined || row.slug === undefined ? null : { providerHost: row.providerKey, slug: row.slug }
  },
})

/**
 * First adoption-sorted page of eligible entries in a just-completed
 * generation, read by x402DirectoryIndexRefresh.onComplete to pre-admit a
 * bounded set of Tools (plan-limit budget: 24, not the whole eligible set).
 */
export const firstEligiblePage = internalQuery({
  args: { generation: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_network_and_elig_and_payersOrder', q => q.eq('generation', args.generation).eq('network', '*').eq('eligible', true))
      .order('desc').take(24)
    return rows.map(row => row.resource)
  },
})

/** Exact selected snapshot; neither text rank nor the first source page is an admission gate. */
export const selectedSource = internalQuery({
  args: { resource: v.string(), network: v.optional(v.string()), provider: v.optional(v.string()), maxUsdPrice: v.optional(v.number()) },
  returns: v.union(unavailableValue, v.object({ kind: v.literal('not_found') }), v.object({ kind: v.literal('found'), sourceJson: v.string(), entry: directoryEntryValue })),
  handler: async (ctx, args) => {
    const { resource, ...filters } = args
    const parsed = x402DirectoryIndexInputSchema.safeParse(filters)
    if (!parsed.success || resource.length === 0 || resource.length > 8192) return { kind: 'unavailable' as const, reason: 'query_invalid' }
    const generation = await activeDirectoryGeneration(ctx)
    if (generation === null) return { kind: 'unavailable' as const, reason: 'index_unavailable' }
    const selected = await ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_network_and_resource', q => q.eq('generation', generation.generation).eq('network', '*').eq('resource', resource)).unique()
    const row = selected === null ? null : await ctx.db.get(selected.entryId)
    if (row === null) return { kind: 'not_found' as const }
    const entry = storedDirectoryEntry(row)
    if (!directoryEntryMatchesFilters(entry, parsed.data)) return { kind: 'unavailable' as const, reason: 'resource_filters_mismatch' }
    // The stored source snapshot is optional on the row, and the caller is asking
    // for exactly that snapshot, so a row without one has nothing to return.
    const sourceJson = row.directorySourceJson
    if (sourceJson === undefined) return { kind: 'not_found' as const }
    return { kind: 'found' as const, sourceJson, entry }
  },
})

const facetValue = v.object({ key: v.string(), label: v.string(), count: v.number(), iconUrl: v.optional(v.string()) })

/**
 * Category/provider/network counts default to the eligible-only namespace
 * (mirrored at write time in x402DirectoryIndexStore.writeFacetMembership);
 * tag/bundle counts stay generation-wide for now (deferred — see Lane 1
 * report note). The `facets` query has no provider argument, so it is always
 * eligible-only; `overview`'s category/provider/network shelves pass the
 * same default.
 */
async function readFacets(ctx: QueryCtx, generation: string, kind: 'category' | 'provider' | 'network' | 'tag' | 'bundle', limit: number, eligibleOnly: boolean) {
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
export const facets = query({
  args: { kind: v.union(v.literal('category'), v.literal('provider'), v.literal('network'), v.literal('tag'), v.literal('bundle')), paginationOpts: paginationOptsValidator },
  returns: v.union(unavailableValue, v.object({ kind: v.literal('ok'), coverage: coverageValue, ...paginationResultValidator(facetValue).fields })),
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) return { kind: 'unavailable' as const, reason: 'query_invalid' }
    const generation = await activeDirectoryGeneration(ctx)
    if (generation === null) return { kind: 'unavailable' as const, reason: 'index_unavailable' }
    const page = await ctx.db.query('marketDirectoryFacets').withIndex('by_generation_and_kind_and_key', q => q.eq('generation', generation.generation).eq('kind', args.kind))
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 24) })
    // No provider argument on this query: category/provider/network are always eligible-only.
    const namespace = args.kind === 'tag' || args.kind === 'bundle' ? analyticsNamespace(generation.generation) : eligibleFacetsNamespace(generation.generation)
    const counts = await directoryFacets.countBatch(ctx, page.page.map(row => ({ namespace, bounds: { prefix: [args.kind, row.key] } })))
    return {
      kind: 'ok' as const, coverage: directoryCoverage(generation), ...page,
      page: page.page.flatMap((row, index) => {
        const count = counts[index] ?? 0
        return count === 0 ? [] : [{ key: row.key, label: row.label, count, ...(row.iconUrl === undefined ? {} : { iconUrl: row.iconUrl }) }]
      }),
    }
  },
})

export const overview = query({
  args: {},
  returns: v.union(unavailableValue, v.object({
    kind: v.literal('ok'), coverage: coverageValue,
    categories: v.array(facetValue), providers: v.array(facetValue), networks: v.array(facetValue), tags: v.optional(v.array(facetValue)), bundleSlugs: v.optional(v.array(facetValue)),
    popular: v.array(indexedEntryValue), recentlyUpdated: v.array(indexedEntryValue),
    rising: v.array(indexedEntryValue), falling: v.array(indexedEntryValue),
  })),
  handler: async (ctx) => {
    const generation = await activeDirectoryGeneration(ctx)
    if (generation === null) return { kind: 'unavailable' as const, reason: 'index_unavailable' }
    const [categories, providers, networks, popularRows, updatedRows, risingRows, fallingRows] = await Promise.all([
      readFacets(ctx, generation.generation, 'category', 128, true), readFacets(ctx, generation.generation, 'provider', 12, true), readFacets(ctx, generation.generation, 'network', 32, true),
      ctx.db.query('marketDirectorySearchEntries').withIndex('by_generation_and_network_and_elig_and_popularOrder', q => q.eq('generation', generation.generation).eq('network', '*').eq('eligible', true).gt('popularOrder', 0)).order('desc').take(6),
      ctx.db.query('marketDirectorySearchEntries').withIndex('by_generation_and_network_and_elig_and_updatedOrder', q => q.eq('generation', generation.generation).eq('network', '*').eq('eligible', true).gt('updatedOrder', 0)).order('desc').take(6),
      // Momentum stays un-narrowed (out of Lane 1's scope, see orderedDirectoryRows).
      ctx.db.query('marketDirectorySearchEntries').withIndex('by_generation_and_network_and_momentumOrder', q => q.eq('generation', generation.generation).eq('network', '*').gt('momentumOrder', 0)).order('desc').take(6),
      ctx.db.query('marketDirectorySearchEntries').withIndex('by_generation_and_network_and_momentumOrder', q => q.eq('generation', generation.generation).eq('network', '*').gt('momentumOrder', 0)).order('asc').take(6),
    ])
    const hydrate = async (rows: SearchRow[]) => (await Promise.all(rows.map(async row => ({ row, entry: await ctx.db.get(row.entryId) })))).flatMap(({ row, entry }) => entry === null ? [] : [indexedDirectoryEntry(entry, row)])
    const [popular, recentlyUpdated, rising, falling] = await Promise.all([hydrate(popularRows), hydrate(updatedRows), hydrate(risingRows), hydrate(fallingRows)])
    // Tags/bundles stay generation-wide (deferred, see readFacets comment).
    const labels = generation.analyticsStatus === 'ready' ? { tags: await readFacets(ctx, generation.generation, 'tag', 64, false), bundleSlugs: await readFacets(ctx, generation.generation, 'bundle', 64, false) } : {}
    return { kind: 'ok' as const, coverage: directoryCoverage(generation), categories, providers, networks, popular, recentlyUpdated, rising, falling, ...labels }
  },
})

export const status = query({
  args: {},
  returns: v.object({
    kind: v.union(v.literal('unavailable'), v.literal('ready')), coverage: v.optional(coverageValue),
    refreshState: v.union(v.literal('none'), v.literal('refreshing'), v.literal('complete'), v.literal('failed')),
    lastError: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    const [state, generation] = await Promise.all([directoryState(ctx), activeDirectoryGeneration(ctx)])
    return {
      kind: generation === null ? 'unavailable' as const : 'ready' as const,
      ...(generation === null ? {} : { coverage: directoryCoverage(generation) }),
      refreshState: state?.lastAttemptStatus ?? 'none' as const,
      ...(state?.lastError === undefined ? {} : { lastError: state.lastError }),
    }
  },
})

const countValue = v.object({ key: v.string(), label: v.string(), count: v.number() })
const metadataLabels = {
  hasInputFields: 'Input fields', hasOutputFields: 'Output fields', hasInputSchema: 'Input schema',
  hasOutputSchema: 'Output schema', hasOutputExample: 'Output example', curated: 'Coinbase curated',
} as const
const adoptionLabels = ['Not reported', '0 payers', '1 payer', '2–4 payers', '5–9 payers', '10–49 payers', '50+ payers']
const priceLabels = ['Below $0.01', '$0.01–<$0.03', '$0.03–<$0.10', '$0.10–<$1', '$1–<$10', '$10+', 'Price unknown']
const depthLabels = ['Not comparable', 'Broad (≈1 call/payer)', 'Repeat (2–4)', 'Concentrated (5–9)', 'Whale-heavy (10+)']
const recencyLabels = ['Not reported', 'Active <7d', 'Touched 7–30d', 'Stale 30d+']
const momentumLabels = ['New', 'Rising', 'Holding', 'Falling', 'Not comparable']

/**
 * Native aggregate counts cover the completed generation, never a visible
 * result page. Deliberately not eligible-narrowed: this is the operator
 * reporting surface over the whole catalogue, not the customer discovery
 * surface (browse/search/facets).
 */
export const analytics = query({
  args: { network: v.optional(v.string()) },
  returns: v.union(unavailableValue, v.object({
    kind: v.literal('ok'), coverage: coverageValue, scope: v.literal('whole_generation'), totalTools: v.number(),
    adoption: v.array(v.object({ ...countValue.fields, key: v.union(v.literal('missing'), v.literal('0'), v.literal('1'), v.literal('2_4'), v.literal('5_9'), v.literal('10_49'), v.literal('50_plus')) })), metadata: v.array(v.object({ ...countValue.fields, key: v.union(v.literal('hasInputFields'), v.literal('hasOutputFields'), v.literal('hasInputSchema'), v.literal('hasOutputSchema'), v.literal('hasOutputExample'), v.literal('curated')) })), categories: v.array(facetValue), networks: v.array(facetValue),
    curated: v.array(indexedEntryValue),
    depth: v.array(v.object({ ...countValue.fields, key: v.union(...DIRECTORY_DEPTH_BANDS.map(band => v.literal(band))) })),
    recency: v.array(v.object({ ...countValue.fields, key: v.union(...DIRECTORY_RECENCY_BANDS.map(band => v.literal(band))) })),
    momentum: v.array(v.object({ ...countValue.fields, key: v.union(...DIRECTORY_MOMENTUM_BANDS.map(band => v.literal(band))) })),
    concentration: v.object({
      basis: v.literal('declared_calls30d'), categoryCount: v.number(),
      categories: v.array(v.object({ key: v.string(), label: v.string(), toolCount: v.number(), documentedPayers: v.number(), totalCalls: v.number(), totalPayers: v.number(), top3Share: v.number(), hhi: v.number() })),
    }),
    rising: v.array(indexedEntryValue), falling: v.array(indexedEntryValue),
    price: v.object({
      // Price facet memberships are only ever written for the aggregate '*'
      // row (see memberships() in lib/x402DirectoryIndex/analytics.ts) - no
      // caller reads a per-network price breakdown, so this section always
      // reports the whole-generation aggregate regardless of args.network.
      scope: v.literal('whole_generation'),
      totalTools: v.number(), knownPriceTools: v.number(), unknownPriceTools: v.number(), bands: v.array(v.object({ ...countValue.fields, key: v.union(v.literal('lt_0_01'), v.literal('0_01_to_0_03'), v.literal('0_03_to_0_10'), v.literal('0_10_to_1'), v.literal('1_to_10'), v.literal('10_plus'), v.literal('unknown')) })),
      basis: v.literal('minimum_exact_usdc_per_tool'),
      quantiles: v.optional(v.object({ minimum: v.string(), p25: v.string(), median: v.string(), p75: v.string(), maximum: v.string() })),
    }),
  })),
  handler: async (ctx, args) => {
    const generation = await activeDirectoryGeneration(ctx)
    if (generation === null) return { kind: 'unavailable' as const, reason: 'index_unavailable' }
    if (generation.analyticsVersion !== ANALYTICS_VERSION || generation.analyticsStatus !== 'ready') return { kind: 'unavailable' as const, reason: 'analytics_building' }
    if (args.network !== undefined && (args.network.length === 0 || args.network.length > 128)) return { kind: 'unavailable' as const, reason: 'query_invalid' }
    const network = args.network === undefined ? '*' : directoryNetwork(args.network)
    const namespace = analyticsNamespace(generation.generation)
    const metadataKeys = Object.keys(metadataLabels) as (keyof typeof metadataLabels)[]
    const prefixes: [string, string][] = [
      ...DIRECTORY_ADOPTION_BANDS.map(key => ['adoption', key] as [string, string]),
      ...metadataKeys.map(key => ['metadata', key] as [string, string]),
      // Aggregate-only key: the writer no longer fans price facets out per network.
      ...DIRECTORY_PRICE_BANDS.map(key => ['price_band:*', key] as [string, string]),
      ...DIRECTORY_DEPTH_BANDS.map(key => ['depth', key] as [string, string]),
      ...DIRECTORY_RECENCY_BANDS.map(key => ['recency', key] as [string, string]),
      ...DIRECTORY_MOMENTUM_BANDS.map(key => ['momentum', key] as [string, string]),
    ]
    const [counts, categories, networks, curatedRows, statsRows, risingRows, fallingRows] = await Promise.all([
      directoryFacets.countBatch(ctx, prefixes.map(prefix => ({ namespace, bounds: { prefix } }))),
      readFacets(ctx, generation.generation, 'category', 128, false), readFacets(ctx, generation.generation, 'network', 32, false),
      ctx.db.query('marketDirectorySearchEntries').withIndex('by_generation_and_network_and_curated_and_payersOrder', q => q.eq('generation', generation.generation).eq('network', '*').eq('curated', true)).order('desc').take(6),
      ctx.db.query('marketDirectoryCategoryStats').withIndex('by_generation_and_network', q => q.eq('generation', generation.generation).eq('network', network)).collect(),
      ctx.db.query('marketDirectorySearchEntries').withIndex('by_generation_and_network_and_momentumOrder', q => q.eq('generation', generation.generation).eq('network', '*').gt('momentumOrder', 0)).order('desc').take(6),
      ctx.db.query('marketDirectorySearchEntries').withIndex('by_generation_and_network_and_momentumOrder', q => q.eq('generation', generation.generation).eq('network', '*').gt('momentumOrder', 0)).order('asc').take(6),
    ])
    const adoption = DIRECTORY_ADOPTION_BANDS.map((key, i) => ({ key, label: adoptionLabels[i] ?? key, count: counts[i] ?? 0 }))
    const metadata = metadataKeys.map((key, i) => ({ key, label: metadataLabels[key], count: counts[DIRECTORY_ADOPTION_BANDS.length + i] ?? 0 }))
    const priceStart = DIRECTORY_ADOPTION_BANDS.length + metadataKeys.length
    const bands = DIRECTORY_PRICE_BANDS.map((key, i) => ({ key, label: priceLabels[i] ?? key, count: counts[priceStart + i] ?? 0 }))
    const depthStart = priceStart + DIRECTORY_PRICE_BANDS.length
    const recencyStart = depthStart + DIRECTORY_DEPTH_BANDS.length
    const momentumStart = recencyStart + DIRECTORY_RECENCY_BANDS.length
    const depth = DIRECTORY_DEPTH_BANDS.map((key, i) => ({ key, label: depthLabels[i] ?? key, count: counts[depthStart + i] ?? 0 }))
    const recency = DIRECTORY_RECENCY_BANDS.map((key, i) => ({ key, label: recencyLabels[i] ?? key, count: counts[recencyStart + i] ?? 0 }))
    const momentum = DIRECTORY_MOMENTUM_BANDS.map((key, i) => ({ key, label: momentumLabels[i] ?? key, count: counts[momentumStart + i] ?? 0 }))
    const concentration = {
      basis: 'declared_calls30d' as const, categoryCount: statsRows.length,
      categories: statsRows.sort((a, b) => b.toolCount - a.toolCount || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0)).slice(0, 12)
        .map(row => ({
          key: row.category, label: row.label, toolCount: row.toolCount, documentedPayers: row.documentedPayers,
          totalCalls: row.totalCalls, totalPayers: row.totalPayers,
          // Concentration ratios are only meaningful with at least 3 tools.
          top3Share: row.toolCount >= 3 ? row.top3Share : 0, hhi: row.toolCount >= 3 ? row.hhi : 0,
        })),
    }
    const totalTools = bands.reduce((total, band) => total + band.count, 0)
    const unknownPriceTools = bands.find(band => band.key === 'unknown')?.count ?? 0
    const knownPriceTools = totalTools - unknownPriceTools
    let quantiles: { minimum: string; p25: string; median: string; p75: string; maximum: string } | undefined
    if (knownPriceTools > 0) {
      // Observed nearest-rank quantiles return actual exact decimal observations.
      const ranks = [0, Math.max(0, Math.ceil(knownPriceTools * 0.25) - 1), Math.max(0, Math.ceil(knownPriceTools * 0.5) - 1), Math.max(0, Math.ceil(knownPriceTools * 0.75) - 1), knownPriceTools - 1]
      const items = await directoryFacets.atBatch(ctx, ranks.map(offset => ({ namespace, offset, bounds: { prefix: ['price:*'] } })))
      const rows = await Promise.all(items.map(item => ctx.db.query('marketDirectorySearchEntries').withIndex('by_generation_and_network_and_resource', q => q.eq('generation', generation.generation).eq('network', '*').eq('resource', item.id)).unique()))
      const [minimum, p25, median, p75, maximum] = rows.map(row => row?.minimumUsdPrice)
      if (minimum !== undefined && p25 !== undefined && median !== undefined && p75 !== undefined && maximum !== undefined) {
        quantiles = { minimum, p25, median, p75, maximum }
      }
    }
    const curated = (await Promise.all(curatedRows.map(async row => ({ row, entry: await ctx.db.get(row.entryId) })))).flatMap(({ row, entry }) => entry === null ? [] : [indexedDirectoryEntry(entry, row)])
    const momentumLists = await Promise.all([risingRows, fallingRows].map(async rows => (await Promise.all(rows.map(async row => ({ row, entry: await ctx.db.get(row.entryId) })))).flatMap(({ row, entry }) => entry === null ? [] : [indexedDirectoryEntry(entry, row)])))
    return {
      kind: 'ok' as const, coverage: directoryCoverage(generation), scope: 'whole_generation' as const,
      totalTools: generation.ingestedCount, adoption, metadata, categories, networks, curated,
      depth, recency, momentum, concentration, rising: momentumLists[0] ?? [], falling: momentumLists[1] ?? [],
      price: { scope: 'whole_generation' as const, totalTools, knownPriceTools, unknownPriceTools, bands, basis: 'minimum_exact_usdc_per_tool' as const, ...(quantiles === undefined ? {} : { quantiles }) },
    }
  },
})
