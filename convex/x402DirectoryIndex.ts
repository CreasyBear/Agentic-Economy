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

import { ANALYTICS_VERSION, analyticsNamespace } from './lib/x402DirectoryIndex/analytics'
import { DIRECTORY_ADOPTION_BANDS, DIRECTORY_PRICE_BANDS } from '@/modules/market/x402-directory-index'

type SearchRow = Doc<'marketDirectorySearchEntries'>

function orderedDirectoryRows(ctx: QueryCtx, generation: string, input: X402DirectoryIndexInput) {
  const network = input.network === undefined ? '*' : directoryNetwork(input.network)
  const rows = ctx.db.query('marketDirectorySearchEntries')
  // Read the narrowed selectors once: the index builders below are closures, so
  // reading input inside them loses the narrowing these branches established.
  const { query, provider, category } = input
  if (query) {
    return rows.withSearchIndex('search_text_by_generation_network_category_provider', q => {
      let search = q.search('searchText', query).eq('generation', generation).eq('network', network)
      if (category !== undefined) search = search.eq('category', category)
      if (provider !== undefined) search = search.eq('provider', provider)
      return search
    })
  }
  if (input.sort === 'adoption') {
    if (provider !== undefined) return rows.withIndex('by_generation_and_network_and_provider_and_payersOrder', q => q.eq('generation', generation).eq('network', network).eq('provider', provider)).order('desc')
    if (category !== undefined) return rows.withIndex('by_generation_and_network_and_category_and_payersOrder', q => q.eq('generation', generation).eq('network', network).eq('category', category)).order('desc')
    return rows.withIndex('by_generation_and_network_and_payersOrder', q => q.eq('generation', generation).eq('network', network)).order('desc')
  }
  if (input.sort === 'price_asc') {
    if (provider !== undefined) return rows.withIndex('by_generation_and_network_and_provider_and_priceOrder', q => q.eq('generation', generation).eq('network', network).eq('provider', provider)).order('asc')
    if (category !== undefined) return rows.withIndex('by_generation_and_network_and_category_and_priceOrder', q => q.eq('generation', generation).eq('network', network).eq('category', category)).order('asc')
    return rows.withIndex('by_generation_and_network_and_priceOrder', q => q.eq('generation', generation).eq('network', network)).order('asc')
  }
  if (input.sort === 'updated') {
    if (provider !== undefined) return rows.withIndex('by_generation_and_network_and_provider_and_updatedOrder', q => q.eq('generation', generation).eq('network', network).eq('provider', provider)).order('desc')
    if (category !== undefined) return rows.withIndex('by_generation_and_network_and_category_and_updatedOrder', q => q.eq('generation', generation).eq('network', network).eq('category', category)).order('desc')
    return rows.withIndex('by_generation_and_network_and_updatedOrder', q => q.eq('generation', generation).eq('network', network)).order('desc')
  }
  if (provider !== undefined) return rows.withIndex('by_generation_and_network_and_provider_and_popularOrder', q => q.eq('generation', generation).eq('network', network).eq('provider', provider)).order('desc')
  if (category !== undefined) return rows.withIndex('by_generation_and_network_and_category_and_popularOrder', q => q.eq('generation', generation).eq('network', network).eq('category', category)).order('desc')
  return rows.withIndex('by_generation_and_network_and_popularOrder', q => q.eq('generation', generation).eq('network', network)).order('desc')
}

function matchesRemainingConstraints(row: SearchRow, input: X402DirectoryIndexInput): boolean {
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
    const needsAnalytics = input.sort === 'adoption' || input.sort === 'price_asc' || ['minUsdPrice', 'minPayers30d', 'maxPayers30d', 'priceBand', 'adoptionBand', 'curatedOnly', 'tags', 'bundleSlugs', 'hasInputFields', 'hasOutputFields', 'hasInputSchema', 'hasOutputSchema', 'hasOutputExample'].some(key => filters[key as keyof typeof filters] !== undefined)
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
    ))
    // Rich source documents have a separate bounded budget from slim search rows.
    // A shorter native page still preserves its cursor and complete traversal.
    const page = await filter(source, row => matchesRemainingConstraints(row, parsed.data)).paginate({
      ...paginationOpts, numItems: Math.min(paginationOpts.numItems, 12),
      maximumRowsRead: Math.min(paginationOpts.maximumRowsRead ?? 512, 512),
      maximumBytesRead: Math.min(paginationOpts.maximumBytesRead ?? 1024 * 1024, 1024 * 1024),
    })
    const entries = await Promise.all(page.page.map(row => ctx.db.get(row.entryId)))
    return {
      kind: 'ok' as const, coverage: directoryCoverage(generation),
      searchMethod: parsed.data.query ? 'native_full_text' as const : 'native_index' as const,
      ...page,
      page: entries.flatMap(row => row === null ? [] : [indexedDirectoryEntry(row)]),
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
    return row === null ? { kind: 'not_found' as const } : { kind: 'found' as const, coverage: directoryCoverage(generation), item: indexedDirectoryEntry(row) }
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

async function readFacets(ctx: QueryCtx, generation: string, kind: 'category' | 'provider' | 'network' | 'tag' | 'bundle', limit: number) {
  const rows = await ctx.db.query('marketDirectoryFacets')
    .withIndex('by_generation_and_kind_and_key', q => q.eq('generation', generation).eq('kind', kind)).take(limit)
  const counts = await directoryFacets.countBatch(ctx, rows.map(row => ({ namespace: kind === 'tag' || kind === 'bundle' ? analyticsNamespace(generation) : generation, bounds: { prefix: [kind, row.key] } })))
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
    const counts = await directoryFacets.countBatch(ctx, page.page.map(row => ({ namespace: args.kind === 'tag' || args.kind === 'bundle' ? analyticsNamespace(generation.generation) : generation.generation, bounds: { prefix: [args.kind, row.key] } })))
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
  })),
  handler: async (ctx) => {
    const generation = await activeDirectoryGeneration(ctx)
    if (generation === null) return { kind: 'unavailable' as const, reason: 'index_unavailable' }
    const [categories, providers, networks, popularRows, updatedRows] = await Promise.all([
      readFacets(ctx, generation.generation, 'category', 128), readFacets(ctx, generation.generation, 'provider', 12), readFacets(ctx, generation.generation, 'network', 32),
      ctx.db.query('marketDirectorySearchEntries').withIndex('by_generation_and_network_and_popularOrder', q => q.eq('generation', generation.generation).eq('network', '*').gt('popularOrder', 0)).order('desc').take(6),
      ctx.db.query('marketDirectorySearchEntries').withIndex('by_generation_and_network_and_updatedOrder', q => q.eq('generation', generation.generation).eq('network', '*').gt('updatedOrder', 0)).order('desc').take(6),
    ])
    const hydrate = async (rows: SearchRow[]) => (await Promise.all(rows.map(row => ctx.db.get(row.entryId)))).flatMap(row => row === null ? [] : [indexedDirectoryEntry(row)])
    const [popular, recentlyUpdated] = await Promise.all([hydrate(popularRows), hydrate(updatedRows)])
    const labels = generation.analyticsStatus === 'ready' ? { tags: await readFacets(ctx, generation.generation, 'tag', 64), bundleSlugs: await readFacets(ctx, generation.generation, 'bundle', 64) } : {}
    return { kind: 'ok' as const, coverage: directoryCoverage(generation), categories, providers, networks, popular, recentlyUpdated, ...labels }
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

/** Native aggregate counts cover the completed generation, never a visible result page. */
export const analytics = query({
  args: { network: v.optional(v.string()) },
  returns: v.union(unavailableValue, v.object({
    kind: v.literal('ok'), coverage: coverageValue, scope: v.literal('whole_generation'), totalTools: v.number(),
    adoption: v.array(v.object({ ...countValue.fields, key: v.union(v.literal('missing'), v.literal('0'), v.literal('1'), v.literal('2_4'), v.literal('5_9'), v.literal('10_49'), v.literal('50_plus')) })), metadata: v.array(v.object({ ...countValue.fields, key: v.union(v.literal('hasInputFields'), v.literal('hasOutputFields'), v.literal('hasInputSchema'), v.literal('hasOutputSchema'), v.literal('hasOutputExample'), v.literal('curated')) })), categories: v.array(facetValue), networks: v.array(facetValue),
    curated: v.array(indexedEntryValue),
    price: v.object({
      scope: v.union(v.literal('whole_generation'), v.literal('network')), network: v.optional(v.string()),
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
      ...DIRECTORY_PRICE_BANDS.map(key => [`price_band:${network}`, key] as [string, string]),
    ]
    const [counts, categories, networks, curatedRows] = await Promise.all([
      directoryFacets.countBatch(ctx, prefixes.map(prefix => ({ namespace, bounds: { prefix } }))),
      readFacets(ctx, generation.generation, 'category', 128), readFacets(ctx, generation.generation, 'network', 32),
      ctx.db.query('marketDirectorySearchEntries').withIndex('by_generation_and_network_and_curated_and_payersOrder', q => q.eq('generation', generation.generation).eq('network', '*').eq('curated', true)).order('desc').take(6),
    ])
    const adoption = DIRECTORY_ADOPTION_BANDS.map((key, i) => ({ key, label: adoptionLabels[i] ?? key, count: counts[i] ?? 0 }))
    const metadata = metadataKeys.map((key, i) => ({ key, label: metadataLabels[key], count: counts[DIRECTORY_ADOPTION_BANDS.length + i] ?? 0 }))
    const bands = DIRECTORY_PRICE_BANDS.map((key, i) => ({ key, label: priceLabels[i] ?? key, count: counts[DIRECTORY_ADOPTION_BANDS.length + metadataKeys.length + i] ?? 0 }))
    const totalTools = bands.reduce((total, band) => total + band.count, 0)
    const unknownPriceTools = bands.find(band => band.key === 'unknown')?.count ?? 0
    const knownPriceTools = totalTools - unknownPriceTools
    let quantiles: { minimum: string; p25: string; median: string; p75: string; maximum: string } | undefined
    if (knownPriceTools > 0) {
      // Observed nearest-rank quantiles return actual exact decimal observations.
      const ranks = [0, Math.max(0, Math.ceil(knownPriceTools * 0.25) - 1), Math.max(0, Math.ceil(knownPriceTools * 0.5) - 1), Math.max(0, Math.ceil(knownPriceTools * 0.75) - 1), knownPriceTools - 1]
      const items = await directoryFacets.atBatch(ctx, ranks.map(offset => ({ namespace, offset, bounds: { prefix: [`price:${network}`] } })))
      const rows = await Promise.all(items.map(item => ctx.db.query('marketDirectorySearchEntries').withIndex('by_generation_and_network_and_resource', q => q.eq('generation', generation.generation).eq('network', network).eq('resource', item.id)).unique()))
      const [minimum, p25, median, p75, maximum] = rows.map(row => row?.minimumUsdPrice)
      if (minimum !== undefined && p25 !== undefined && median !== undefined && p75 !== undefined && maximum !== undefined) {
        quantiles = { minimum, p25, median, p75, maximum }
      }
    }
    const curated = (await Promise.all(curatedRows.map(row => ctx.db.get(row.entryId)))).flatMap(row => row === null ? [] : [indexedDirectoryEntry(row)])
    return {
      kind: 'ok' as const, coverage: directoryCoverage(generation), scope: 'whole_generation' as const,
      totalTools: generation.ingestedCount, adoption, metadata, categories, networks, curated,
      price: { scope: network === '*' ? 'whole_generation' as const : 'network' as const, ...(network === '*' ? {} : { network }), totalTools, knownPriceTools, unknownPriceTools, bands, basis: 'minimum_exact_usdc_per_tool' as const, ...(quantiles === undefined ? {} : { quantiles }) },
    }
  },
})
