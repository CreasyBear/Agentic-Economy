import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStorage } from 'nitro/storage'
import { REFERENCE_RATE_MAX_AGE_MS } from '@/modules/money/public'
const { query, upstream } = vi.hoisted(() => ({ query: vi.fn(), upstream: vi.fn() }))
vi.mock('@/lib/server/convex-source', () => ({ sourceQuery: (name: string) => name, callPublicSourceQuery: query }))
vi.mock('@/modules/market/x402-directory.server', () => ({ readX402Directory: upstream }))
import { readX402DirectoryAnalytics, readX402DirectoryCatalogue, readX402DirectoryCatalogueOverview, readX402DirectoryCatalogueResource } from '@/modules/market/x402-directory-index.server'
import { x402DirectoryCatalogueInputSchema } from '@/modules/market/x402-directory-catalogue'
import { decodeOpaqueCursor, encodeOpaqueCursor } from '@/modules/registry/opaque-cursor'

beforeEach(() => { query.mockReset(); upstream.mockReset(); vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production'); vi.stubEnv('CONVEX_URL', ''); vi.stubEnv('VITE_CONVEX_URL', '') })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe('indexed catalogue server boundary', () => {
  it('stops a cancelled continuation before browse or reference-rate work', async () => {
    const controller = new AbortController()
    query.mockImplementation(async () => {
      controller.abort(new DOMException('Account read cancelled', 'AbortError'))
      return { kind: 'ready', coverage: { generation: 'gen-1', completedAt: 1 } }
    })
    await expect(readX402DirectoryCatalogue({
      indexCursor: encodeOpaqueCursor({ kind: 'x402-directory', scope: 'gen-1', cursor: 'next' }),
    }, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(query).toHaveBeenCalledExactlyOnceWith('x402DirectoryIndex:status', {}, { signal: controller.signal })
    expect(upstream).not.toHaveBeenCalled()
  })

  it('does not turn a cancelled card query into source_unavailable or start its rate lookup', async () => {
    const controller = new AbortController()
    query.mockImplementation(async () => {
      controller.abort(new DOMException('Route read cancelled', 'AbortError'))
      return { kind: 'ok', page: [{ id: 'card', source: 'coinbase', resource: 'https://example.com/tool',
        title: 'Tool', summary: '', provider: 'example.com', network: 'eip155:8453', minimumUsdPrice: '1' }], isDone: true }
    })
    await expect(readX402DirectoryCatalogue({ query: 'weather' }, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(query).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith('x402DirectoryIndex:searchCompact', expect.objectContaining({ query: 'weather', network: 'eip155:8453' }), { signal: controller.signal })
  })

  it.each([undefined, 'preview'])('refuses an undeclared money environment %s before querying', async (deployment) => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', deployment)
    expect(await readX402DirectoryCatalogue({})).toEqual({ kind: 'unavailable', reason: 'source_unavailable' })
    expect(await readX402DirectoryCatalogueResource({ resource: 'https://example.com/tool' })).toEqual({ kind: 'unavailable', reason: 'source_unavailable' })
    expect(query).not.toHaveBeenCalled()
    expect(upstream).not.toHaveBeenCalled()
  })
  it.each([['production', 'eip155:8453', 'base-sepolia'], ['development', 'eip155:84532', 'base']])('pins %s compact results to its network', async (deployment, network, opposite) => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', deployment)
    expect(await readX402DirectoryCatalogue({ network: opposite })).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(query).not.toHaveBeenCalled()
    query.mockResolvedValue({ kind: 'ok', coverage: { generation: 'g', completedAt: 1 }, isDone: true, continueCursor: '', page: [
      { id: 'good', source: 'coinbase', resource: 'https://example.com/good', title: 'Good', summary: '', provider: 'example.com', network, minimumUsdPrice: '1' },
      { id: 'bad', source: 'coinbase', resource: 'https://example.com/bad', title: 'Bad', summary: '', provider: 'example.com', network: opposite, minimumUsdPrice: '1' },
    ] })
    const result = await readX402DirectoryCatalogue({ query: 'weather' })
    expect(query).toHaveBeenCalledWith('x402DirectoryIndex:searchCompact', expect.objectContaining({ network }))
    expect(result).toMatchObject({ kind: 'ok', page: { items: [{ resource: 'https://example.com/good', prices: [{ network }] }] } })
  })

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
      items: entries.map(entry => ({ ...entry, metadataJson: '' })), appliedFilters: { network: 'eip155:8453', maxUsdPrice: 0.1 },
    } })
    expect(query).toHaveBeenCalledWith('x402DirectoryIndex:browse', {
      query: 'transparent images', network: 'eip155:8453', maxUsdPrice: 0.1,
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
    expect(query).toHaveBeenCalledWith('x402DirectoryIndex:browse', { category: 'creative', provider: 'example.com', network: 'eip155:8453', paginationOpts: { numItems: 24, cursor: 'previous', maximumRowsRead: 512 } })
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
      item: { entry, category: 'weather', categorySource: 'provider_declared' as const, observedAt: 1, sourceDigest: 'digest', toolRef: `operation:v1:${'ab'.repeat(32)}`, choice: { access: 'unavailable' as const } },
    }
    const upstreamDetail = { kind: 'found_upstream' as const, item: { entry: { ...entry, prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '0.001 USDC', decimalAmount: '0.001000', symbol: 'USDC' }] } } }
    query.mockImplementation(async (name: string) => name === 'referenceRateRefresh:current' ? rate : found)
    expect(await readX402DirectoryCatalogueResource({ resource: entry.resource })).toEqual({ ...found, item: { ...found.item, entry: { ...entry, audEstimate: 'A$1.24' } } })
    expect(query).toHaveBeenCalledWith('x402DirectoryIndex:resource', { resource: entry.resource })
    expect(query).toHaveBeenCalledWith('referenceRateRefresh:current', {})
    query.mockImplementation(async (name: string) => name === 'referenceRateRefresh:current' ? rate : upstreamDetail)
    expect(await readX402DirectoryCatalogueResource({ resource: entry.resource })).toEqual({
      ...upstreamDetail, item: { entry: { ...upstreamDetail.item.entry, audEstimate: 'A$0.0013' } },
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
          title: 'Weather', summary: 'Forecasts', provider: 'example.com', network: 'eip155:8453',
          minimumUsdPrice: '0.01', calls30d: 4, payers30d: 2,
          choice: { access: 'ae_callable', toolRef: 'operation:v1:' + 'ab'.repeat(32) },
        }],
      }
    })
    const result = await readX402DirectoryCatalogue({ query: 'weather' })
    expect(query).toHaveBeenCalledWith('x402DirectoryIndex:searchCompact', {
      query: 'weather', network: 'eip155:8453', paginationOpts: { numItems: 12, cursor: null },
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
  it('normalises a hostname prefix and forwards it without broadening to Tool search', async () => {
    const { readX402DirectoryProviders } = await import('@/modules/market/x402-directory-index.server')
    const page = { kind: 'ok', page: [{ key: 'api.example.com', label: 'api.example.com', count: 142 }], continueCursor: 'next', isDone: false }
    query.mockResolvedValue(page)
    expect(await readX402DirectoryProviders({ providerPrefix: ' API.', providerCursor: 'scoped-next' })).toEqual(page)
    expect(query).toHaveBeenCalledWith('x402DirectoryIndex:facets', { kind: 'provider', providerPrefix: 'api.', paginationOpts: { numItems: 24, cursor: 'scoped-next' } })
    query.mockClear()
    expect(await readX402DirectoryProviders({ providerPrefix: 'https://example.com' })).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(query).not.toHaveBeenCalled()
    expect(upstream).not.toHaveBeenCalled()
  })
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
  expect(query).toHaveBeenCalledWith('x402DirectoryIndex:browse', { ...filters, network: 'eip155:8453', paginationOpts: { numItems: 24, cursor: null, maximumRowsRead: 512 } });
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
  expect(query).toHaveBeenCalledWith('x402DirectoryIndex:browse', { sort: 'repeat', network: 'eip155:8453', paginationOpts: { numItems: 24, cursor: null, maximumRowsRead: 512 } })
})

describe('bounded public directory display snapshots', () => {
  const displayUrl = 'https://directory-cache-test.convex.cloud'
  const displayNow = 1_800_000_000_000
  const rate = { source: 'coinbase', base: 'USDC', quote: 'AUD', rate: '1.239', fetchedAt: displayNow }
  const priced = { resource: 'https://example.com/tool', title: 'Weather', description: 'Forecasts', protocol: 'http',
    provider: 'example.com', metadataJson: '{}', prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '1 USDC', decimalAmount: '1', symbol: 'USDC' }] }
  const page = { kind: 'ok', coverage: { indexedTotal: 1, generation: 'gen-1' }, searchMethod: 'native_index',
    page: [{ entry: priced, choice: { access: 'ae_callable', toolRef: `operation:v1:${'ab'.repeat(32)}` } }], continueCursor: 'next', isDone: false }
  beforeEach(async () => {
    await useStorage().clear()
    vi.stubEnv('CONVEX_URL', displayUrl)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(displayNow)
    query.mockImplementation(async (name: string) => name === 'referenceRateRefresh:current' ? rate : page)
  })
  afterEach(async () => { await useStorage().clear(); vi.useRealTimers(); vi.restoreAllMocks() })
  const callsTo = (name: string) => query.mock.calls.filter(call => call[0] === name)

  it('reuses and coalesces first-page display reads while recomputing AUD from a raw observation', async () => {
    const results = await Promise.all([readX402DirectoryCatalogue({}), readX402DirectoryCatalogue({})])
    expect(results[0]).toEqual(results[1])
    expect(results[0]).toMatchObject({ page: { items: [{ audEstimate: 'A$1.24', choice: { access: 'ae_callable' } }] } })
    expect(await readX402DirectoryCatalogue({})).toEqual(results[0])
    expect(callsTo('x402DirectoryIndex:browse')).toHaveLength(1)
    expect(callsTo('referenceRateRefresh:current')).toHaveLength(1)
  })

  it('partitions finite browse presets by sort, deployment and payment network', async () => {
    await readX402DirectoryCatalogue({ sort: 'repeat' })
    await readX402DirectoryCatalogue({ sort: 'repeat' })
    expect(callsTo('x402DirectoryIndex:browse')).toHaveLength(1)
    await readX402DirectoryCatalogue({ sort: 'adoption' })
    expect(callsTo('x402DirectoryIndex:browse')).toHaveLength(2)
    vi.stubEnv('CONVEX_URL', 'https://another-display-test.convex.cloud')
    await readX402DirectoryCatalogue({ sort: 'repeat' })
    expect(callsTo('x402DirectoryIndex:browse')).toHaveLength(3)
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    await readX402DirectoryCatalogue({ sort: 'repeat' })
    expect(callsTo('x402DirectoryIndex:browse')).toHaveLength(4)
    expect(callsTo('x402DirectoryIndex:browse').at(-1)?.[1]).toMatchObject({ network: 'eip155:84532' })
  })

  it('does not accumulate catalogue snapshots under arbitrary filter or query keys', async () => {
    for (let maxUsdPrice = 1; maxUsdPrice <= 8; maxUsdPrice += 1) {
      await readX402DirectoryCatalogue({ maxUsdPrice })
    }
    await readX402DirectoryCatalogue({ maxUsdPrice: 1 })
    expect(callsTo('x402DirectoryIndex:browse')).toHaveLength(9)
    expect(await useStorage().getKeys()).toHaveLength(1)
    query.mockImplementation(async (name: string) => name === 'referenceRateRefresh:current' ? rate : {
      kind: 'ok', coverage: { generation: 'gen-1', completedAt: displayNow }, continueCursor: '', isDone: true,
      page: [{ id: 'card', source: 'coinbase', resource: priced.resource, title: priced.title, summary: priced.description,
        provider: priced.provider, network: 'eip155:8453', minimumUsdPrice: '1' }],
    })
    await readX402DirectoryCatalogue({ query: 'weather' })
    await readX402DirectoryCatalogue({ query: 'weather' })
    await readX402DirectoryCatalogue({ query: 'images' })
    expect(callsTo('x402DirectoryIndex:searchCompact')).toHaveLength(3)
    expect(await useStorage().getKeys()).toHaveLength(1)
  })

  it('waits for a fresh foreground resolution after thirty seconds', async () => {
    await readX402DirectoryCatalogue({})
    vi.setSystemTime(displayNow + 30_001)
    const refresh = Promise.withResolvers<typeof page>()
    query.mockImplementation(async (name: string) => name === 'referenceRateRefresh:current' ? rate : refresh.promise)
    let finished = false
    const waiting = readX402DirectoryCatalogue({}).then(value => { finished = true; return value })
    await vi.waitFor(() => expect(callsTo('x402DirectoryIndex:browse')).toHaveLength(2))
    expect(finished).toBe(false)
    refresh.resolve({ ...page, coverage: { indexedTotal: 1, generation: 'gen-2' } })
    expect(await waiting).toMatchObject({ coverage: { generation: 'gen-2' } })
  })

  it('keeps every continuation and its generation check live', async () => {
    query.mockImplementation(async (name: string) => name === 'x402DirectoryIndex:status'
      ? { kind: 'ready', coverage: { generation: 'gen-1', completedAt: displayNow } }
      : name === 'referenceRateRefresh:current' ? rate : page)
    const input = { indexCursor: encodeOpaqueCursor({ kind: 'x402-directory', scope: 'gen-1', cursor: 'previous' }) }
    await readX402DirectoryCatalogue(input)
    await readX402DirectoryCatalogue(input)
    expect(callsTo('x402DirectoryIndex:status')).toHaveLength(2)
    expect(callsTo('x402DirectoryIndex:browse')).toHaveLength(2)
    query.mockImplementation(async () => ({ kind: 'ready', coverage: { generation: 'gen-2', completedAt: displayNow } }))
    expect(await readX402DirectoryCatalogue(input)).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(callsTo('x402DirectoryIndex:browse')).toHaveLength(2)
  })

  it('never retains unavailable responses or rejected reads', async () => {
    query.mockResolvedValueOnce({ kind: 'unavailable', reason: 'index_unavailable' }).mockRejectedValueOnce(new Error('offline'))
    expect(await readX402DirectoryCatalogue({})).toEqual({ kind: 'unavailable', reason: 'index_unavailable' })
    expect(await readX402DirectoryCatalogue({})).toEqual({ kind: 'unavailable', reason: 'source_unavailable' })
    expect(await readX402DirectoryCatalogue({})).toMatchObject({ kind: 'ok' })
    expect(callsTo('x402DirectoryIndex:browse')).toHaveLength(3)
  })

  it('drops an AUD estimate immediately when the cached observation reaches its own expiry', async () => {
    const expiringRate = { ...rate, fetchedAt: displayNow - REFERENCE_RATE_MAX_AGE_MS + 1_000 }
    query.mockImplementation(async (name: string) => name === 'referenceRateRefresh:current' ? expiringRate : page)
    expect(await readX402DirectoryCatalogue({})).toMatchObject({ page: { items: [{ audEstimate: 'A$1.24' }] } })
    vi.setSystemTime(displayNow + 1_000)
    const result = await readX402DirectoryCatalogue({})
    if (result.kind !== 'ok') throw new Error('Expected catalogue')
    expect(result.page.items[0]).not.toHaveProperty('audEstimate')
    expect(callsTo('x402DirectoryIndex:browse')).toHaveLength(1)
    expect(callsTo('referenceRateRefresh:current')).toHaveLength(2)
    expect(await readX402DirectoryCatalogue({})).toMatchObject({ kind: 'ok' })
    expect(callsTo('referenceRateRefresh:current')).toHaveLength(3)
  })

  it('does not retain a missing display FX observation', async () => {
    let observation: typeof rate | null = null
    query.mockImplementation(async (name: string) => name === 'referenceRateRefresh:current' ? observation : page)
    const first = await readX402DirectoryCatalogue({})
    if (first.kind !== 'ok') throw new Error('Expected catalogue')
    expect(first.page.items[0]).not.toHaveProperty('audEstimate')
    observation = rate
    expect(await readX402DirectoryCatalogue({})).toMatchObject({ page: { items: [{ audEstimate: 'A$1.24' }] } })
    expect(callsTo('x402DirectoryIndex:browse')).toHaveLength(1)
    expect(callsTo('referenceRateRefresh:current')).toHaveLength(2)
  })

  it('cancels one reader promptly without aborting a concurrent shared resolver', async () => {
    const resolver = Promise.withResolvers<typeof page>()
    query.mockImplementation(async (name: string) => name === 'referenceRateRefresh:current' ? rate : resolver.promise)
    const controller = new AbortController()
    const first = readX402DirectoryCatalogue({}, { signal: controller.signal })
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    const second = readX402DirectoryCatalogue({})
    await vi.waitFor(() => expect(callsTo('x402DirectoryIndex:browse')).toHaveLength(1))
    controller.abort(new DOMException('Reader cancelled', 'AbortError'))
    await rejected
    const sharedOptions = callsTo('x402DirectoryIndex:browse')[0]?.[2] as { signal: AbortSignal }
    expect(sharedOptions.signal.aborted).toBe(false)
    expect(callsTo('referenceRateRefresh:current')).toHaveLength(0)
    resolver.resolve(page)
    expect(await second).toMatchObject({ kind: 'ok' })
    expect(await readX402DirectoryCatalogue({})).toMatchObject({ kind: 'ok' })
    expect(callsTo('x402DirectoryIndex:browse')).toHaveLength(1)
  })

  it('keeps injected transport and environment reads independent and cancellable', async () => {
    const options = { env: { CONVEX_URL: displayUrl }, fetch: vi.fn(), signal: new AbortController().signal }
    await readX402DirectoryCatalogue({}, options)
    await readX402DirectoryCatalogue({}, options)
    expect(callsTo('x402DirectoryIndex:browse')).toHaveLength(2)
    expect(callsTo('referenceRateRefresh:current')).toHaveLength(2)
    expect(callsTo('x402DirectoryIndex:browse')[0]?.[2]).toBe(options)
  })

  it('stores projected overview facts with no popular Tool rows and does not retain failures', async () => {
    const overview = { kind: 'ok', coverage: { generation: 'gen-1' }, categories: [], providers: [], networks: [],
      popular: [{ entry: priced }], recentlyUpdated: [{ entry: priced }] }
    query.mockResolvedValue(overview)
    const result = await readX402DirectoryCatalogueOverview()
    expect(result).toMatchObject({ kind: 'ok', popular: [], recentlyUpdated: [] })
    expect(await readX402DirectoryCatalogueOverview()).toEqual(result)
    expect(callsTo('x402DirectoryIndex:overview')).toHaveLength(1)
    vi.setSystemTime(displayNow + 30_001)
    query.mockResolvedValueOnce({ kind: 'unavailable', reason: 'index_unavailable' }).mockResolvedValueOnce(overview)
    expect(await readX402DirectoryCatalogueOverview()).toEqual({ kind: 'unavailable', reason: 'index_unavailable' })
    expect(await readX402DirectoryCatalogueOverview()).toMatchObject({ kind: 'ok' })
    expect(callsTo('x402DirectoryIndex:overview')).toHaveLength(3)
  })
})
