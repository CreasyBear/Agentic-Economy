import { v, type Infer } from 'convex/values'
import { DIRECTORY_ADOPTION_BANDS, DIRECTORY_DEPTH_BANDS, DIRECTORY_MOMENTUM_BANDS, DIRECTORY_PRICE_BANDS, DIRECTORY_RECENCY_BANDS, directoryNetwork } from '@/modules/market/x402-directory-index'
import type { QueryCtx } from '../../../_generated/server'
import { ANALYTICS_VERSION, analyticsNamespace } from './analytics'
import { coverageValue, facetValue, indexedEntryValue, unavailableValue } from './contracts'
import { readFacets } from './facetReads'
import { directoryFacets } from './facets'
import { activeDirectoryGeneration, directoryCoverage, indexedDirectoryEntry } from './rows'

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
export const analyticsArgs = v.object({ network: v.optional(v.string()) })
export const analyticsReturns = v.union(unavailableValue, v.object({
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
  }))
export const analyticsHandler = async (ctx: QueryCtx, args: Infer<typeof analyticsArgs>) => {
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
  }
