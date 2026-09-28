import { canonicalDigest } from '@/modules/common/canonical-digest'
import { paginationOptsValidator } from 'convex/server'
import { filter } from 'convex-helpers/server/filter'
import { v, type Infer } from 'convex/values'
import Decimal from 'decimal.js'
import { directoryNetwork, directoryIndexRangesValid, x402DirectoryIndexInputSchema, type X402DirectoryIndexInput } from '@/modules/market/x402-directory-index'
import type { Doc } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import { ANALYTICS_VERSION } from './analytics'
import { filterArgs, pageValue } from './contracts'
import { choiceForDirectoryPage } from './choices'
import { activeDirectoryGeneration, compactDirectoryText, directoryCoverage, indexedDirectoryEntry } from './rows'

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
export const browseArgs = v.object({ ...filterArgs, alternativeTo: v.optional(v.string()), paginationOpts: paginationOptsValidator })
export const browseReturns = pageValue
export const browseHandler = async (ctx: QueryCtx, args: Infer<typeof browseArgs>) => {
    const { paginationOpts, alternativeTo, ...filters } = args
    const parsed = x402DirectoryIndexInputSchema.safeParse(filters)
    if (!parsed.success || !directoryIndexRangesValid(parsed.data) || paginationOpts.numItems < 1 || paginationOpts.numItems > 50 || !Number.isSafeInteger(paginationOpts.numItems)
      || (alternativeTo !== undefined && (alternativeTo.length < 1 || alternativeTo.length > 8192 || !parsed.data.query))) return { kind: 'unavailable' as const, reason: 'query_invalid' }
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
    const choiceFor = choiceForDirectoryPage(ctx, Date.now())
    const page = await filter(source, async row => {
      if (!matchesRemainingConstraints(row, parsed.data)) return false
      if (alternativeTo === undefined) return true
      const choice = await choiceFor(row)
      return choice.access === 'ae_callable' && choice.toolRef !== alternativeTo && row.sourceRouteRef !== alternativeTo
    }).paginate({
      ...paginationOpts, numItems: Math.min(paginationOpts.numItems, 12),
      maximumRowsRead: Math.min(paginationOpts.maximumRowsRead ?? 512, alternativeTo === undefined ? 512 : 48),
      maximumBytesRead: Math.min(paginationOpts.maximumBytesRead ?? 1024 * 1024, 1024 * 1024),
    })
    const rawEntries = await Promise.all(page.page.map(async row => ({ row, entry: await ctx.db.get(row.entryId) })))
    const found = rawEntries.flatMap(({ row, entry }) => entry === null ? [] : [{ row, entry }])
    const withTool = await Promise.all(found.map(async item => ({ ...item, choice: await choiceFor(item.row) })))
    return {
      kind: 'ok' as const, coverage: directoryCoverage(generation),
      searchMethod: parsed.data.query ? 'native_full_text' as const : 'native_index' as const,
      ...page,
      page: withTool.map(({ row, entry, choice }) => ({
        ...indexedDirectoryEntry(entry, row), choice,
        ...(choice.sourceRouteRef === undefined ? {} : { sourceRouteRef: choice.sourceRouteRef }),
        ...(choice.toolRef === undefined ? {} : { toolRef: choice.toolRef }),
      })),
    }
  }

const actionClassValue = v.union(v.literal('retrieve'), v.literal('transform'), v.literal('analyze'), v.literal('create'), v.literal('mutate'), v.literal('other'), v.literal('unclassified'))
const objectClassValue = v.union(v.literal('web'), v.literal('document'), v.literal('image'), v.literal('location'), v.literal('chain'), v.literal('data'), v.literal('other'), v.literal('unclassified'))

export const searchCompactArgs = v.object({
  query: v.string(),
  actionClass: v.optional(actionClassValue),
  objectClass: v.optional(objectClassValue),
  category: v.optional(v.string()),
  provider: v.optional(v.string()),
  network: v.optional(v.string()),
  priceBand: v.optional(v.string()),
  access: v.optional(v.union(v.literal('ae_callable'), v.literal('external_listing'))),
  paginationOpts: paginationOptsValidator,
})
export const searchCompactReturns = v.union(
  v.object({ kind: v.literal('unavailable'), reason: v.string() }),
  v.object({
    kind: v.literal('ok'),
    coverage: v.object({ generation: v.string(), completedAt: v.number() }),
    page: v.array(v.object({
      id: v.string(), source: v.union(v.literal('coinbase'), v.literal('provider')),
      sourceRouteRef: v.optional(v.string()), toolRef: v.optional(v.string()),
      choice: v.optional(v.object({
        access: v.union(v.literal('external_listing'), v.literal('ae_callable'), v.literal('setup_required'), v.literal('unavailable')),
        sourceRouteRef: v.optional(v.string()), toolRef: v.optional(v.string()),
      })),
      title: v.string(), summary: v.string(), provider: v.string(),
      actionClass: actionClassValue, objectClass: objectClassValue, category: v.optional(v.string()),
      completedAt: v.number(), minimumUsdPrice: v.optional(v.string()),
    })),
    continueCursor: v.string(), isDone: v.boolean(),
  }),
)

/** Compact indexed search; live publication joins decide access before cursor pagination. */
export const searchCompactHandler = async (ctx: QueryCtx, args: Infer<typeof searchCompactArgs>) => {
  const { paginationOpts, access, actionClass, objectClass, ...filters } = args
  const parsed = x402DirectoryIndexInputSchema.safeParse(filters)
  if (!parsed.success || paginationOpts.numItems < 1 || paginationOpts.numItems > 12 || !Number.isSafeInteger(paginationOpts.numItems)) {
    return { kind: 'unavailable' as const, reason: 'query_invalid' }
  }
  const generation = await activeDirectoryGeneration(ctx)
  if (generation === null) return { kind: 'unavailable' as const, reason: 'index_unavailable' }
  if (filters.priceBand !== undefined && (generation.analyticsVersion !== ANALYTICS_VERSION || generation.analyticsStatus !== 'ready')) {
    return { kind: 'unavailable' as const, reason: 'analytics_building' }
  }
  const scope = canonicalDigest([
    'compact-directory:v1', generation.generation, String(generation.completedAt ?? generation.startedAt),
    parsed.data.query ?? '', actionClass ?? '', objectClass ?? '',
    parsed.data.category ?? '', parsed.data.provider ?? '',
    parsed.data.network === undefined ? '*' : directoryNetwork(parsed.data.network),
    parsed.data.priceBand ?? '', access ?? '',
  ])
  const requestedCursor = paginationOpts.cursor
  const separator = requestedCursor?.indexOf('|') ?? -1
  if (requestedCursor !== null && (requestedCursor.length > 8192 || separator < 0 || requestedCursor.slice(0, separator) !== scope)) {
    return { kind: 'unavailable' as const, reason: 'cursor_invalid' }
  }
  const nativeCursor = requestedCursor === null ? null : requestedCursor.slice(separator + 1)
  const { query, category, provider, network, priceBand } = parsed.data
  const networkKey = network === undefined ? '*' : directoryNetwork(network)
  const source = query
    ? ctx.db.query('marketDirectorySearchEntries')
      .withSearchIndex('search_text_by_generation_network_category_provider', search => {
        let indexed = search.search('searchText', query).eq('generation', generation.generation).eq('network', networkKey)
        if (category !== undefined) indexed = indexed.eq('category', category)
        if (provider !== undefined) indexed = indexed.eq('provider', provider)
        else indexed = indexed.eq('eligible', true)
        return indexed
      })
    : provider === undefined
      ? ctx.db.query('marketDirectorySearchEntries')
        .withIndex('by_generation_and_network_and_elig_and_popularOrder', q => q.eq('generation', generation.generation).eq('network', networkKey).eq('eligible', true)).order('desc')
      : ctx.db.query('marketDirectorySearchEntries')
        .withIndex('by_generation_and_network_and_provider_and_popularOrder', q => q.eq('generation', generation.generation).eq('network', networkKey).eq('provider', provider)).order('desc')
  const rows = source
    .filter(q => q.and(
      ...(category === undefined ? [] : [q.eq(q.field('category'), category)]),
      ...(actionClass === undefined ? [] : [q.or(q.eq(q.field('actionClass'), actionClass), ...(actionClass === 'unclassified' ? [q.eq(q.field('actionClass'), undefined)] : [q.eq(q.field('actionClass'), 'unclassified'), q.eq(q.field('actionClass'), undefined)]))]),
      ...(objectClass === undefined ? [] : [q.or(q.eq(q.field('objectClass'), objectClass), ...(objectClass === 'unclassified' ? [q.eq(q.field('objectClass'), undefined)] : [q.eq(q.field('objectClass'), 'unclassified'), q.eq(q.field('objectClass'), undefined)]))]),
      ...(priceBand === undefined ? [] : [q.eq(q.field('priceBand'), priceBand)]),
    ))
  const choiceFor = choiceForDirectoryPage(ctx, Date.now())
  const page = await filter(rows, async row => {
    if (access === undefined) return true
    const choice = await choiceFor(row)
    return access === 'ae_callable' ? choice.access === 'ae_callable' : choice.access !== 'ae_callable'
  }).paginate({
    ...paginationOpts, cursor: nativeCursor, maximumRowsRead: Math.min(paginationOpts.maximumRowsRead ?? 512, access === undefined ? 512 : 48),
    maximumBytesRead: Math.min(paginationOpts.maximumBytesRead ?? 1024 * 1024, 1024 * 1024),
  })
  const compact = await Promise.all(page.page.map(async row => {
    // Older rows are served until the ordinary unchanged-source refresh fills
    // their slim projection; current rows never load retained source JSON.
    const legacy = row.documentId === undefined || row.title === undefined || row.summary === undefined
      ? await ctx.db.get(row.entryId) : null
    const id = row.documentId ?? legacy?.documentId
    const title = row.title ?? legacy?.name
    const summary = row.summary ?? legacy?.summary
    if (id === undefined || title === undefined || summary === undefined) throw new Error('directory_index_entry_missing')
    const choice = await choiceFor(row)
    return {
      id, source: row.source ?? legacy?.source ?? 'coinbase',
      ...(row.sourceRouteRef === undefined ? {} : { sourceRouteRef: row.sourceRouteRef }),
      choice,
      ...(choice.access !== 'ae_callable' || choice.toolRef === undefined ? {} : { toolRef: choice.toolRef }),
      title: compactDirectoryText(title, 72),
      summary: compactDirectoryText(summary, 100),
      provider: compactDirectoryText(row.provider, 48),
      actionClass: row.actionClass ?? 'unclassified', objectClass: row.objectClass ?? 'unclassified',
      ...(row.category === 'uncategorized' ? {} : { category: row.category }),
      completedAt: generation.completedAt ?? generation.startedAt,
      ...(row.minimumUsdPrice === undefined ? {} : { minimumUsdPrice: row.minimumUsdPrice }),
    }
  }))
  return {
    kind: 'ok' as const, coverage: { generation: generation.generation, completedAt: generation.completedAt ?? generation.startedAt },
    page: compact, continueCursor: `${scope}|${page.continueCursor}`, isDone: page.isDone,
  }
}
