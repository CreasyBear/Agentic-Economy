import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { query, upstream } = vi.hoisted(() => ({ query: vi.fn(), upstream: vi.fn() }))
vi.mock('@/lib/server/convex-source', () => ({ sourceQuery: (name: string) => name, callPublicSourceQuery: query }))
vi.mock('@/modules/market/x402-directory.server', () => ({ readX402Directory: upstream }))
import { readX402DirectoryAnalytics, readX402DirectoryCatalogue, readX402DirectoryCatalogueOverview, readX402DirectoryCatalogueResource } from '@/modules/market/x402-directory-index.server'
import { x402DirectoryCatalogueInputSchema } from '@/modules/market/x402-directory-catalogue'
import { decodeOpaqueCursor, encodeOpaqueCursor } from '@/modules/registry/opaque-cursor'

beforeEach(() => { query.mockReset(); upstream.mockReset() })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe('indexed catalogue server boundary', () => {
  it('keeps indexed query order when OpenRouter is blocked', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', '')
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
    const fetchImpl = vi.fn(async () => { throw new Error('openrouter blocked') })
    vi.stubGlobal('fetch', fetchImpl)
    const entries = ['Weather forecasts', 'Image background removal'].map((description, index) => ({
      resource: `https://example.com/${index}`, title: description, description,
      protocol: 'http', provider: 'example.com', prices: [], metadataJson: '{}',
    }))
    const coverage = { indexedTotal: 4000, generation: 'gen-1' }
    query.mockResolvedValue({ kind: 'ok', coverage, searchMethod: 'native_full_text', page: entries.map(entry => ({ entry })), continueCursor: 'next', isDone: false })
    const result = await readX402DirectoryCatalogue({ query: 'transparent images', network: 'base', maxUsdPrice: 0.1 })
    expect(result).toMatchObject({ kind: 'ok', source: 'index', coverage, searchMethod: 'native_full_text', isDone: false, page: {
      items: entries.map(entry => ({ ...entry, metadataJson: '' })), appliedFilters: { network: 'base', maxUsdPrice: 0.1 },
    } })
    expect(query).toHaveBeenCalledWith('x402DirectoryIndex:browse', {
      query: 'transparent images', network: 'base', maxUsdPrice: 0.1,
      paginationOpts: { numItems: 24, cursor: null, maximumRowsRead: 512 },
    })
    if (result.kind !== 'ok') throw new Error('expected catalogue')
    expect(decodeOpaqueCursor(result.indexCursor ?? '', { kind: 'x402-directory', scope: 'gen-1' })).toBe('next')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(upstream).not.toHaveBeenCalled()
  })
  it('validates source-only inputs and rejects incompatible search sorting', async () => {
    for (const input of [{ provider: 'https://example.com' }, { indexCursor: '' }, { query: 'image', sort: 'popular' }, { directoryCategory: '' }, { indexCursor: 'cursor', offset: 20 }, { executable: 'anything' }]) {
      expect(x402DirectoryCatalogueInputSchema.safeParse(input).success).toBe(false)
    }
    expect(await readX402DirectoryCatalogue({ maxUsdPrice: -1 })).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(query).not.toHaveBeenCalled()
  })
  it('preserves native pagination and keeps unfiltered coverage distinct from result counts', async () => {
    const entry = { resource: 'https://example.com/tool', title: 'Tool', provider: 'example.com',
      description: 'A published tool', protocol: 'http', prices: [], metadataJson: '{}' }
    const coverage = { indexedTotal: 4000, generation: 'gen-1' }
    query.mockImplementation(async (name: string) => {
      if (name === 'x402DirectoryIndex:status') return { kind: 'ready', coverage: { generation: 'gen-1', completedAt: 1 } }
      return { kind: 'ok', coverage, searchMethod: 'native_index', page: [{ entry }], continueCursor: 'next', isDone: false, pageStatus: 'SplitRecommended', splitCursor: 'split' }
    })
    const result = await readX402DirectoryCatalogue({
      directoryCategory: 'CREATIVE',
      provider: 'EXAMPLE.com',
      indexCursor: encodeOpaqueCursor({ kind: 'x402-directory', scope: 'gen-1', cursor: 'previous' }),
    })
    expect(query).toHaveBeenCalledWith('x402DirectoryIndex:browse', { category: 'creative', provider: 'example.com', paginationOpts: { numItems: 24, cursor: 'previous', maximumRowsRead: 512 } })
    expect(result).toMatchObject({ kind: 'ok', source: 'index', coverage, page: { items: [{ ...entry, metadataJson: '' }] }, isDone: false, splitCursor: 'split' })
    if (result.kind === 'ok') {
      expect(result.page.total).toBeUndefined()
      expect(result.indexCursor).toBe(encodeOpaqueCursor({ kind: 'x402-directory', scope: 'gen-1', cursor: 'next' }))
      expect(decodeOpaqueCursor(result.indexCursor ?? '', { kind: 'x402-directory', scope: 'gen-1' })).toBe('next')
    }
    expect(upstream).not.toHaveBeenCalled()
  })
  it('accepts a directory continuation whose envelope is longer than 512 characters', async () => {
    const scope = 'coinbase-1789987469211-986ab911-c7d4-41b2-93ea-b1c1033c1ce9'
    const inner = 'a'.repeat(500)
    const indexCursor = encodeOpaqueCursor({ kind: 'x402-directory', scope, cursor: inner })
    expect(indexCursor.length).toBeGreaterThan(512)
    query.mockImplementation(async (name: string) => {
      if (name === 'x402DirectoryIndex:status') return { kind: 'ready', coverage: { generation: scope, completedAt: 1 } }
      return { kind: 'ok', coverage: { indexedTotal: 4000, generation: scope }, searchMethod: 'native_index', page: [], continueCursor: 'next', isDone: false }
    })
    const result = await readX402DirectoryCatalogue({ indexCursor })
    expect(result.kind).toBe('ok')
    expect(query).toHaveBeenCalledWith('x402DirectoryIndex:browse', expect.objectContaining({
      paginationOpts: { numItems: 24, cursor: inner, maximumRowsRead: 512 },
    }))
  })
  it('does not forward a raw index cursor to the engine', async () => {
    query.mockImplementation(async (name: string) => {
      if (name === 'x402DirectoryIndex:status') return { kind: 'ready', coverage: { generation: 'gen-1', completedAt: 1 } }
      return { kind: 'ok', coverage: { indexedTotal: 4000, generation: 'gen-1' }, searchMethod: 'native_index', page: [], continueCursor: 'next', isDone: false }
    })
    const result = await readX402DirectoryCatalogue({ indexCursor: 'previous' })
    expect(result).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(query.mock.calls.some((call) => {
      const args = call[1] as { paginationOpts?: { cursor?: string | null } } | undefined
      return args?.paginationOpts?.cursor === 'previous'
    })).toBe(false)
  })
  it('reports an absent generation without calling Coinbase', async () => {
    query.mockResolvedValue({ kind: 'unavailable', reason: 'index_unavailable' })
    const fetchImpl = vi.fn(async () => { throw new Error('coinbase blocked') })
    vi.stubGlobal('fetch', fetchImpl)
    expect(await readX402DirectoryCatalogue({ offset: 20 })).toEqual({ kind: 'unavailable', reason: 'index_unavailable' })
    expect(upstream).not.toHaveBeenCalled()
    for (const input of [{ directoryCategory: 'creative' }, { indexCursor: 'cursor' }, { sort: 'popular' as const }]) {
      expect(await readX402DirectoryCatalogue(input)).toEqual({ kind: 'unavailable', reason: 'index_unavailable' })
    }
    expect(fetchImpl).not.toHaveBeenCalled()
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
  it('estimates full resource detail in AUD and leaves misses and invalid rates unchanged', async () => {
    const rate = { source: 'coinbase', base: 'USDC', quote: 'AUD', rate: '1.239', fetchedAt: Date.now() }
    const entry = {
      resource: 'https://example.com/exact', title: 'Weather', description: 'Forecasts', protocol: 'http', method: 'GET',
      provider: 'example.com', metadataJson: '{"raw":true}', tags: ['weather'],
      input: { type: 'object', schemaJson: '{"type":"object","properties":{"q":{"type":"string"}}}', exampleJson: '{"q":"sydney"}', fields: [{ name: 'q', path: 'q', location: 'queryParams', source: 'schema' }] },
      output: { type: 'object', schemaJson: '{"type":"object"}', exampleJson: '{"temp":21}', fields: [{ name: 'temp', path: 'temp', location: 'output', source: 'example' }] },
      prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '1 USDC', decimalAmount: '1.000000', symbol: 'USDC' }],
    }
    const found = {
      kind: 'found' as const, coverage: { indexedTotal: 4000, generation: 'gen-1' },
      item: { entry, category: 'weather', categorySource: 'provider_declared' as const, observedAt: 1, sourceDigest: 'digest', toolRef: `operation:v1:${'ab'.repeat(32)}`, choice: { access: 'external_listing' as const } },
    }
    const upstreamDetail = { kind: 'found_upstream' as const, item: { entry: { ...entry, prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '0.001 USDC', decimalAmount: '0.001000', symbol: 'USDC' }] } } }
    query.mockImplementation(async (name: string) => name === 'referenceRateRefresh:current' ? rate : found)
    expect(await readX402DirectoryCatalogueResource({ resource: entry.resource })).toEqual({ ...found, item: { ...found.item, entry: { ...entry, audEstimate: 'A$1.24' } } })
    expect(query).toHaveBeenCalledWith('x402DirectoryIndex:resource', { resource: entry.resource })
    expect(query).toHaveBeenCalledWith('referenceRateRefresh:current', {})
    query.mockImplementation(async (name: string) => name === 'referenceRateRefresh:current' ? rate : upstreamDetail)
    expect(await readX402DirectoryCatalogueResource({ resource: entry.resource })).toEqual({
      ...upstreamDetail, item: { entry: { ...upstreamDetail.item.entry, audEstimate: 'A$0.01' } },
    })
    query.mockImplementation(async (name: string) => name === 'referenceRateRefresh:current' ? null : found)
    expect(await readX402DirectoryCatalogueResource({ resource: entry.resource })).toEqual(found)
    query.mockImplementation(async (name: string) => name === 'referenceRateRefresh:current' ? { ...rate, fetchedAt: 0 } : found)
    expect(await readX402DirectoryCatalogueResource({ resource: entry.resource })).toEqual(found)
    query.mockResolvedValue({ kind: 'not_found' })
    expect(await readX402DirectoryCatalogueResource({ resource: entry.resource })).toEqual({ kind: 'not_found' })
    query.mockRejectedValue(new Error('offline'))
    expect(await readX402DirectoryCatalogueResource({ resource: entry.resource })).toEqual({ kind: 'unavailable', reason: 'source_unavailable' })
    expect(upstream).not.toHaveBeenCalled()
  })
  it('reads a query-only collection as compact cards', async () => {
    query.mockImplementation(async (name: string) => {
      if (name === 'referenceRateRefresh:current') return null
      return {
        kind: 'ok', coverage: { generation: 'gen-1', completedAt: 1 }, isDone: false, continueCursor: 'scope|next',
        page: [{
          id: 'registry:abc', source: 'coinbase', resource: 'https://example.com/tool', slug: 'tool',
          title: 'Weather', summary: 'Forecasts', provider: 'example.com',
          minimumUsdPrice: '0.01', calls30d: 4, payers30d: 2,
          choice: { access: 'ae_callable', toolRef: 'operation:v1:' + 'ab'.repeat(32) },
        }],
      }
    })
    const result = await readX402DirectoryCatalogue({ query: 'weather' })
    expect(query).toHaveBeenCalledWith('x402DirectoryIndex:searchCompact', {
      query: 'weather', paginationOpts: { numItems: 12, cursor: null },
    })
    expect(query).not.toHaveBeenCalledWith('x402DirectoryIndex:browse', expect.anything())
    if (result.kind !== 'ok') throw new Error('expected compact catalogue')
    expect(result.page.items[0]).toMatchObject({
      resource: 'https://example.com/tool', title: 'Weather', description: 'Forecasts', slug: 'tool',
      metadataJson: '', activity: { calls30d: 4, payers30d: 2 },
      choice: { access: 'ae_callable' }, prices: [{ symbol: 'USDC', decimalAmount: '0.01' }],
    })
    expect(result.page.items[0]).not.toHaveProperty('input')
    expect(JSON.stringify(result)).not.toContain('schemaJson')
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

it('accepts repeat sorting through the shared index schema and forwards it to the native index', async () => {
  expect(x402DirectoryCatalogueInputSchema.safeParse({ sort: 'repeat' }).success).toBe(true)
  query.mockResolvedValueOnce({ kind: 'ok', coverage: {}, searchMethod: 'native_index', page: [], continueCursor: 'next', isDone: true })
  expect(await readX402DirectoryCatalogue({ sort: 'repeat' })).toMatchObject({ kind: 'ok', source: 'index', isDone: true })
  expect(query).toHaveBeenCalledWith('x402DirectoryIndex:browse', { sort: 'repeat', paginationOpts: { numItems: 24, cursor: null, maximumRowsRead: 512 } })
})
