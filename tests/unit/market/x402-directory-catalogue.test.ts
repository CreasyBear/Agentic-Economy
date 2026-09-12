import { beforeEach, describe, expect, it, vi } from 'vitest'
const { query, upstream } = vi.hoisted(() => ({ query: vi.fn(), upstream: vi.fn() }))
vi.mock('@/lib/server/convex-source', () => ({ sourceQuery: (name: string) => name, callPublicSourceQuery: query }))
vi.mock('@/modules/market/x402-directory.server', () => ({ readX402Directory: upstream }))
import { readX402DirectoryAnalytics, readX402DirectoryCatalogue, readX402DirectoryCatalogueOverview, readX402DirectoryCatalogueResource } from '@/modules/market/x402-directory-index.server'
import { x402DirectoryCatalogueInputSchema } from '@/modules/market/x402-directory-catalogue'

beforeEach(() => { query.mockReset(); upstream.mockReset() })
describe('indexed catalogue server boundary', () => {
  it('validates source-only inputs and rejects incompatible search sorting', async () => {
    for (const input of [{ provider: 'https://example.com' }, { indexCursor: '' }, { query: 'image', sort: 'popular' }, { directoryCategory: '' }, { indexCursor: 'cursor', offset: 20 }, { executable: 'anything' }]) {
      expect(x402DirectoryCatalogueInputSchema.safeParse(input).success).toBe(false)
    }
    expect(await readX402DirectoryCatalogue({ maxUsdPrice: -1 })).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(query).not.toHaveBeenCalled()
  })
  it('preserves native pagination and keeps unfiltered coverage distinct from result counts', async () => {
    const entry = { resource: 'https://example.com/tool', title: 'Tool' }
    const coverage = { indexedTotal: 4000 }
    query.mockResolvedValue({ kind: 'ok', coverage, searchMethod: 'native_index', page: [{ entry }], continueCursor: 'next', isDone: false, pageStatus: 'SplitRecommended', splitCursor: 'split' })
    const result = await readX402DirectoryCatalogue({ directoryCategory: 'CREATIVE', provider: 'EXAMPLE.com', indexCursor: 'previous' })
    expect(query).toHaveBeenCalledWith('x402DirectoryIndex:browse', { category: 'creative', provider: 'example.com', paginationOpts: { numItems: 24, cursor: 'previous', maximumRowsRead: 512 } })
    expect(result).toMatchObject({ kind: 'ok', source: 'index', coverage, page: { items: [entry] }, indexCursor: 'next', isDone: false, splitCursor: 'split' })
    if (result.kind === 'ok') expect(result.page.total).toBeUndefined()
    expect(upstream).not.toHaveBeenCalled()
  })
  it('falls back only when the index explicitly has no active generation', async () => {
    query.mockResolvedValue({ kind: 'unavailable', reason: 'index_unavailable' })
    upstream.mockResolvedValue({ kind: 'ok', items: [], offset: 20, limit: 20, nextOffset: 40 })
    expect(await readX402DirectoryCatalogue({ offset: 20 })).toMatchObject({ kind: 'ok', source: 'upstream_limited', isDone: false })
    expect(upstream).toHaveBeenCalledWith({ offset: 20 })
    upstream.mockClear()
    for (const input of [{ directoryCategory: 'creative' }, { indexCursor: 'cursor' }]) {
      expect(await readX402DirectoryCatalogue(input)).toEqual({ kind: 'unavailable', reason: 'index_unavailable' })
    }
    // Sort cannot block on unavailability - the upstream directory can't honour index-only
    // orderings (e.g. adoption), so it falls back to relevance rather than staying unavailable.
    expect(await readX402DirectoryCatalogue({ sort: 'popular' as const })).toMatchObject({ kind: 'ok', source: 'upstream_limited' })
    upstream.mockClear()
    query.mockRejectedValue(new Error('offline'))
    expect(await readX402DirectoryCatalogue({})).toEqual({ kind: 'unavailable', reason: 'source_unavailable' })
    expect(upstream).not.toHaveBeenCalled()
  })
  it('preserves query failures without SDK fallback and reads an exact resource independently', async () => {
    query.mockResolvedValueOnce({ kind: 'unavailable', reason: 'query_sort_unsupported' })
    expect(await readX402DirectoryCatalogue({})).toEqual({ kind: 'unavailable', reason: 'query_sort_unsupported' })
    query.mockResolvedValueOnce({ kind: 'not_found' })
    expect(await readX402DirectoryCatalogueResource({ resource: 'https://example.com/exact?x=1' })).toEqual({ kind: 'not_found' })
    expect(query).toHaveBeenLastCalledWith('x402DirectoryIndex:resource', { resource: 'https://example.com/exact?x=1' })
    expect(await readX402DirectoryCatalogueResource({ resource: '' })).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(upstream).not.toHaveBeenCalled()
  })
  it('passes overview facts through and reports transport failures', async () => {
    const overview = { kind: 'ok', categories: [], providers: [], networks: [], popular: [], recentlyUpdated: [] }
    query.mockResolvedValueOnce(overview).mockRejectedValueOnce(new Error('offline'))
    expect(await readX402DirectoryCatalogueOverview()).toEqual(overview)
    expect(await readX402DirectoryCatalogueOverview()).toEqual({ kind: 'unavailable', reason: 'source_unavailable' })
  })
})

describe('complete Provider facet pages', () => {
  it('validates a separate cursor and traverses exact indexed counts without SDK fallback', async () => {
    const { readX402DirectoryProviders } = await import('@/modules/market/x402-directory-index.server')
    const page = { kind: 'ok', page: [{ key: 'example.com', label: 'example.com', count: 142 }], continueCursor: 'next', isDone: false }
    query.mockResolvedValue(page)
    expect(await readX402DirectoryProviders({ providerCursor: 'cursor:+/=' })).toEqual(page)
    expect(query).toHaveBeenCalledWith('x402DirectoryIndex:facets', { kind: 'provider', paginationOpts: { numItems: 24, cursor: 'cursor:+/=' } })
    query.mockClear()
    expect(await readX402DirectoryProviders({ providerCursor: '' })).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(query).not.toHaveBeenCalled()
    query.mockResolvedValue({ kind: 'unavailable', reason: 'index_unavailable' })
    expect(await readX402DirectoryProviders({})).toEqual({ kind: 'unavailable', reason: 'index_unavailable' })
    query.mockRejectedValue(new Error('offline'))
    expect(await readX402DirectoryProviders({})).toEqual({ kind: 'unavailable', reason: 'source_unavailable' })
    expect(upstream).not.toHaveBeenCalled()
  })
})

it('passes exact explorer bands and metadata filters to the native index and never broadens them through fallback', async () => {
  const filters = { priceBand: '0_01_to_0_03' as const, adoptionBand: '0' as const, tags: ['search', 'a&b'], bundleSlugs: ['image-tools'], hasInputSchema: false, hasOutputExample: true, minUsdPrice: 0, maxUsdPrice: 0.03, minPayers30d: 0, maxPayers30d: 4 };
  query.mockResolvedValue({ kind: 'unavailable', reason: 'index_unavailable' });
  expect(await readX402DirectoryCatalogue(filters)).toEqual({ kind: 'unavailable', reason: 'index_unavailable' });
  expect(query).toHaveBeenCalledWith('x402DirectoryIndex:browse', { ...filters, paginationOpts: { numItems: 24, cursor: null, maximumRowsRead: 512 } });
  expect(upstream).not.toHaveBeenCalled();
  query.mockClear();
  for (const input of [{ minUsdPrice: 0.03, maxUsdPrice: 0.01 }, { minPayers30d: 5, maxPayers30d: 4 }]) {
    expect(await readX402DirectoryCatalogue(input)).toEqual({ kind: 'unavailable', reason: 'query_invalid' });
  }
  expect(query).not.toHaveBeenCalled();
});

describe('directory analytics mapper boundary', () => {
  const coverage = { source: 'coinbase', generation: 'g2', indexedTotal: 1000, reportedTotal: 1000, reportedTotalAtStart: 1000, sourceChangedDuringScan: false, duplicateObservations: 0, pagesFetched: 10, startedAt: 1, completedAt: 2, completeness: 'completed_observed_scan' }
  const indexedEntry = { entry: { resource: 'https://example.com/tool', title: 'Tool', description: '', protocol: 'http', provider: 'example.com', metadataJson: '{}', prices: [] }, category: 'search', categorySource: 'provider_declared', observedAt: 3, sourceDigest: 'digest' }
  const analytics = {
    kind: 'ok', coverage, scope: 'whole_generation', totalTools: 1000,
    adoption: [{ key: 'missing', label: 'Not reported', count: 600 }],
    metadata: [{ key: 'curated', label: 'Curated', count: 12 }],
    categories: [{ key: 'search', label: 'Search', count: 55 }],
    networks: [{ key: 'eip155:8453', label: 'Base', count: 900 }],
    curated: [],
    price: { scope: 'whole_generation', totalTools: 1000, knownPriceTools: 20, unknownPriceTools: 980, bands: [{ key: 'unknown', label: 'Unknown', count: 980 }], basis: 'minimum_exact_usdc_per_tool' },
    depth: [
      { key: 'unknown', label: 'Not comparable', count: 400 },
      { key: 'broad', label: 'Broad (≈1 call/payer)', count: 300 },
      { key: 'repeat', label: 'Repeat (2–4)', count: 200 },
      { key: 'concentrated', label: 'Concentrated (5–9)', count: 80 },
      { key: 'whale_heavy', label: 'Whale-heavy (10+)', count: 20 },
    ],
    recency: [
      { key: 'unknown', label: 'Not reported', count: 100 },
      { key: 'fresh', label: 'Active <7d', count: 500 },
      { key: 'recent', label: 'Touched 7–30d', count: 300 },
      { key: 'stale', label: 'Stale 30d+', count: 100 },
    ],
    momentum: [
      { key: 'new', label: 'New', count: 50 },
      { key: 'rising', label: 'Rising', count: 120 },
      { key: 'flat', label: 'Holding', count: 600 },
      { key: 'falling', label: 'Falling', count: 80 },
      { key: 'unknown', label: 'Not comparable', count: 150 },
    ],
    concentration: {
      basis: 'declared_calls30d', categoryCount: 2,
      categories: [
        { key: 'search', label: 'Search', toolCount: 55, documentedPayers: 40, totalCalls: 250_000, totalPayers: 4_000, top3Share: 0.62, hhi: 0.31 },
        { key: 'creative', label: 'Creative', toolCount: 8, documentedPayers: 5, totalCalls: 900, totalPayers: 30, top3Share: 0.9, hhi: 0.51 },
      ],
    },
    rising: [{ ...indexedEntry, analytics: { payerDepth: 2.5, depthBand: 'repeat', lastActivatedAt: 900, lastCalledBand: 'fresh', callDelta: 400, payerDelta: 3, momentumBand: 'rising' } }],
    falling: [{ ...indexedEntry, resource: 'other' }],
  }
  it('maps the complete convex analytics result 1:1 including depth, recency, momentum and concentration', async () => {
    query.mockResolvedValueOnce(analytics)
    expect(await readX402DirectoryAnalytics({})).toEqual(analytics)
    expect(query).toHaveBeenCalledWith('x402DirectoryIndex:analytics', {})
  })
  it('preserves exact band keys and labels across every bucket array', async () => {
    query.mockResolvedValueOnce(analytics)
    const result = await readX402DirectoryAnalytics({ network: 'eip155:8453' })
    expect(query).toHaveBeenLastCalledWith('x402DirectoryIndex:analytics', { network: 'eip155:8453' })
    if (result.kind !== 'ok') throw new Error('expected ok')
    expect(result.depth.map(bucket => [bucket.key, bucket.label])).toEqual([
      ['unknown', 'Not comparable'], ['broad', 'Broad (≈1 call/payer)'], ['repeat', 'Repeat (2–4)'],
      ['concentrated', 'Concentrated (5–9)'], ['whale_heavy', 'Whale-heavy (10+)'],
    ])
    expect(result.recency.map(bucket => [bucket.key, bucket.label])).toEqual([
      ['unknown', 'Not reported'], ['fresh', 'Active <7d'], ['recent', 'Touched 7–30d'], ['stale', 'Stale 30d+'],
    ])
    expect(result.momentum.map(bucket => [bucket.key, bucket.label])).toEqual([
      ['new', 'New'], ['rising', 'Rising'], ['flat', 'Holding'], ['falling', 'Falling'], ['unknown', 'Not comparable'],
    ])
  })
  it('keeps concentration basis, category order and per-category concentration math intact', async () => {
    query.mockResolvedValueOnce(analytics)
    const result = await readX402DirectoryAnalytics({})
    if (result.kind !== 'ok') throw new Error('expected ok')
    expect(result.concentration.basis).toBe('declared_calls30d')
    expect(result.concentration.categoryCount).toBe(2)
    expect(result.concentration.categories.map(category => [category.toolCount, category.hhi, category.top3Share])).toEqual([[55, 0.31, 0.62], [8, 0.51, 0.9]])
  })
  it('carries the derived analytics block on rising and falling indexed entries when present', async () => {
    query.mockResolvedValueOnce(analytics)
    const result = await readX402DirectoryAnalytics({})
    if (result.kind !== 'ok') throw new Error('expected ok')
    expect(result.rising[0]?.analytics).toEqual({ payerDepth: 2.5, depthBand: 'repeat', lastActivatedAt: 900, lastCalledBand: 'fresh', callDelta: 400, payerDelta: 3, momentumBand: 'rising' })
    expect(result.falling[0]?.analytics).toBeUndefined()
  })
  it('passes unavailable reasons through and reports transport failures', async () => {
    query.mockResolvedValueOnce({ kind: 'unavailable', reason: 'analytics_building' })
    expect(await readX402DirectoryAnalytics({})).toEqual({ kind: 'unavailable', reason: 'analytics_building' })
    query.mockRejectedValueOnce(new Error('offline'))
    expect(await readX402DirectoryAnalytics({ network: 'base' })).toEqual({ kind: 'unavailable', reason: 'source_unavailable' })
  })
})

it('accepts momentum sorting through the shared index schema and forwards it to the native index', async () => {
  expect(x402DirectoryCatalogueInputSchema.safeParse({ sort: 'momentum' }).success).toBe(true)
  query.mockResolvedValueOnce({ kind: 'ok', coverage: {}, searchMethod: 'native_index', page: [], continueCursor: 'next', isDone: true })
  expect(await readX402DirectoryCatalogue({ sort: 'momentum' })).toMatchObject({ kind: 'ok', source: 'index', isDone: true })
  expect(query).toHaveBeenCalledWith('x402DirectoryIndex:browse', { sort: 'momentum', paginationOpts: { numItems: 24, cursor: null, maximumRowsRead: 512 } })
})
