import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../convex/_generated/api'
import { ANALYTICS_VERSION } from '../../convex/lib/market/directoryIndex/analytics'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { Infer } from 'convex/values'
import { pageValue } from '../../convex/lib/market/directoryIndex/contracts'
import { searchCompactReturns } from '../../convex/lib/market/directoryIndex/browse'
import { prepareIndexedDirectoryPage } from '../../convex/x402DirectoryIndexSource'
import type { IndexedSource } from '../../convex/lib/market/directoryIndex/contracts'
import { convexTestWithMarketComponents, type ConvexFixtureBackend } from '../helpers/convex-fixtures'

function source(index: number, overrides: Partial<IndexedSource['entry']> = {}): IndexedSource {
  const resource = `https://provider.test/tools/${index}`
  const raw = { resource, type: 'http', description: `Research tool ${index}`, ...(overrides.title === undefined ? {} : { title: overrides.title }) }
  return { resource, sourceJson: JSON.stringify(raw), sourceDigest: canonicalDigest(raw), entry: {
    resource, title: `Research tool ${index}`, description: 'Search public research', protocol: 'http', provider: 'provider.test', metadataJson: '',
    category: 'Research', tags: ['search'],
    // Directory-eligible by default (payersOrder>=2 + a declared output shape):
    // most tests below exercise pagination/cursor/title-projection mechanics,
    // not eligibility, and browse() now defaults to eligible-only. Tests that
    // specifically exercise adoption/price bands override activity/output.
    activity: { calls30d: index, payers30d: 2 }, output: { fields: [], schemaJson: '{}' },
    provenance: { directory: 'Coinbase Bazaar', metadata: 'provider_declared', updatedAt: new Date(1700000000000 + index).toISOString() },
    prices: [{ network: 'base', scheme: 'exact', amount: '1000000', decimalAmount: '1', symbol: 'USDC' }], ...overrides,
  } }
}
async function setup() {
  const backend = convexTestWithMarketComponents()
  await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
  const workload = await backend.query(internal.workloadCron.admit, { name: 'refresh Agentic Economy API registry' })
  return { backend, workload }
}
async function seedRefresh(backend: ConvexFixtureBackend, generation: string) {
  await backend.run(async ctx => {
    await ctx.db.insert('marketExternalRegistryGenerations', { generation, source: 'coinbase', status: 'refreshing', startedAt: 1, ingestedCount: 0, nextOffset: 0 })
    const state = await ctx.db.query('marketExternalRegistryState').withIndex('by_key', q => q.eq('key', 'coinbase')).unique()
    if (state === null) await ctx.db.insert('marketExternalRegistryState', { key: 'coinbase', lastAttemptAt: 1, refreshGeneration: generation, lastAttemptStatus: 'refreshing' })
    else await ctx.db.patch(state._id, { refreshGeneration: generation, lastAttemptStatus: 'refreshing' })
  })
}

describe('complete external directory index', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production') })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

  it('indexes beyond 1,000 resources, publishes only after terminal page, paginates all results and resolves an exact late resource', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-complete'
    await seedRefresh(backend, generation)
    for (let offset = 0; offset < 1001; offset += 100) {
      await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset, reportedTotal: 1001, observedAt: offset + 2, runStartedAt: 1, workload, items: Array.from({ length: Math.min(100, 1001 - offset) }, (_, i) => source(offset + i)) })
    }
    expect(await backend.query(api.x402DirectoryIndex.status, {})).toMatchObject({ kind: 'unavailable', refreshState: 'refreshing' })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 1100, reportedTotal: 1001, observedAt: 1200, runStartedAt: 1, workload, items: [] })
    let cursor: string | null = null
    const resources = new Set<string>()
    for (;;) {
      const page: Infer<typeof pageValue> = await backend.query(api.x402DirectoryIndex.browse, { paginationOpts: { numItems: 50, cursor } })
      expect(page.kind).toBe('ok')
      if (page.kind !== 'ok') throw new Error('unexpected unavailable page')
      page.page.forEach(item => resources.add(item.entry.resource))
      if (page.isDone) break
      cursor = page.continueCursor
    }
    expect(resources.size).toBe(1001)
    expect(await backend.query(api.x402DirectoryIndex.resource, { resource: source(1000).resource })).toMatchObject({ kind: 'found', item: { entry: { title: 'Research tool 1000' } } })
    expect(await backend.query(internal.x402DirectoryIndex.selectedSource, { resource: source(1000).resource })).toMatchObject({ kind: 'found', sourceJson: source(1000).sourceJson })
    const overview = await backend.query(api.x402DirectoryIndex.overview, {})
    expect(overview).toMatchObject({ kind: 'ok', coverage: { indexedTotal: 1001, completeness: 'completed_observed_scan', sourceChangedDuringScan: false }, categories: [{ key: 'research', count: 1001 }], providers: [{ key: 'provider.test', count: 1001 }] })
    expect(await backend.run(ctx => ctx.db.query('capabilityPublications').collect())).toEqual([])
  }, 120000)

  it('reconciles observed source drift and duplicates into the completed generation', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-drift'
    await seedRefresh(backend, generation)
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 101, observedAt: 2, runStartedAt: 1, workload, items: [source(1)] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 2, observedAt: 3, runStartedAt: 1, workload, items: [source(1, { title: 'Updated research' }), source(2)] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 200, reportedTotal: 2, observedAt: 4, runStartedAt: 1, workload, items: [] })
    expect(await backend.query(api.x402DirectoryIndex.status, {})).toMatchObject({ kind: 'ready', coverage: { indexedTotal: 2, sourceChangedDuringScan: true, duplicateObservations: 1 } })
    await seedRefresh(backend, 'coinbase-failed')
    await expect(backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation: 'coinbase-failed', offset: 0, reportedTotal: 100, observedAt: 5, runStartedAt: 1, workload, items: [] })).rejects.toThrow('directory_source_ended_early')
    await backend.mutation(internal.x402DirectoryIndexStore.fail, { generation: 'coinbase-failed', reason: 'source failed', workload })
    expect(await backend.query(api.x402DirectoryIndex.status, {})).toMatchObject({ kind: 'ready', refreshState: 'failed', coverage: { generation, indexedTotal: 2 } })
    expect(await backend.query(api.x402DirectoryIndex.resource, { resource: source(1).resource })).toMatchObject({ kind: 'found', item: { entry: { title: 'Updated research' } } })
  })

  it('keeps recency membership unique when activity changes before an identity rewrite', async () => {
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'))
    const { backend, workload } = await setup()
    const generation = 'coinbase-recency-rewrite'
    await seedRefresh(backend, generation)
    const fresh = new Date(Date.now() - 60_000).toISOString()
    const stale = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
    const observed = (title: string, lastCalledAt: string) => {
      const category = title === 'Revised research' ? 'Engineering' : 'Research'
      const item = source(1, { title, category, activity: { calls30d: 4, payers30d: 2, lastCalledAt } })
      const raw = { resource: item.resource, title, category, lastCalledAt }
      return { ...item, sourceJson: JSON.stringify(raw), sourceDigest: canonicalDigest(raw) }
    }
    const items = [observed('Research', fresh), observed('Research', stale), observed('Revised research', stale), observed('Research', fresh)]
    for (const [index, item] of items.entries()) {
      await backend.mutation(internal.x402DirectoryIndexStore.applyPage, {
        generation, offset: index * 100, reportedTotal: 4, observedAt: Date.now() + index,
        runStartedAt: 1, workload, items: [item],
      })
    }
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, {
      generation, offset: 400, reportedTotal: 4, observedAt: Date.now() + 4,
      runStartedAt: 1, workload, items: [],
    })
    const report = await backend.query(api.x402DirectoryIndex.analytics, {})
    expect(report.kind).toBe('ok')
    if (report.kind === 'ok') expect(Object.fromEntries(report.recency.map(({ key, count }) => [key, count]))).toMatchObject({ fresh: 1, stale: 0 })
  })

  it('reprojects stale display titles from retained source metadata without rewriting the snapshot or starting another scan', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-retained-title'
    await seedRefresh(backend, generation)
    const original = source(1, { title: 'StableEnrich', serviceName: 'StableEnrich' })
    const raw = { resource: original.resource, serviceName: 'StableEnrich', description: 'Exa Search. Search the web for current evidence.' }
    const observed = { ...original, sourceJson: JSON.stringify(raw), sourceDigest: canonicalDigest(raw) }
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 1, observedAt: 2, runStartedAt: 1, workload, items: [observed] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 1, observedAt: 3, runStartedAt: 1, workload, items: [] })
    const detail = await backend.query(api.x402DirectoryIndex.resource, { resource: original.resource })
    expect(detail).toMatchObject({ kind: 'found', item: { entry: { title: 'Exa Search.', serviceName: 'StableEnrich', metadataJson: observed.sourceJson }, sourceDigest: observed.sourceDigest } })
    const page = await backend.query(api.x402DirectoryIndex.browse, { paginationOpts: { numItems: 12, cursor: null } })
    expect(page).toMatchObject({ kind: 'ok', page: [{ entry: { title: 'Exa Search.' } }] })
    expect(await backend.query(internal.x402DirectoryIndex.selectedSource, { resource: original.resource })).toMatchObject({ kind: 'found', sourceJson: observed.sourceJson })
    const stored = await backend.run(ctx => ctx.db.query('marketExternalRegistryEntries').collect())
    expect(stored).toHaveLength(1)
    expect(JSON.parse(stored[0]!.directoryEntryJson!).title).toBe('StableEnrich')
    expect(stored[0]!.sourceDigest).toBe(observed.sourceDigest)
    expect(await backend.query(api.x402DirectoryIndex.status, {})).toMatchObject({ kind: 'ready', refreshState: 'complete', coverage: { generation, indexedTotal: 1 } })
  })

  it('retries committed sub-batches without double-counting and advances the page only after the final batch', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-batches'
    await seedRefresh(backend, generation)
    const first = { generation, offset: 0, reportedTotal: 2, observedAt: 2, runStartedAt: 1, workload, items: [source(1)], startItem: 0, totalItems: 2 }
    expect(await backend.mutation(internal.x402DirectoryIndexStore.applyPage, first)).toMatchObject({ nextOffset: 0, indexedTotal: 1 })
    expect(await backend.mutation(internal.x402DirectoryIndexStore.applyPage, first)).toMatchObject({ nextOffset: 0, indexedTotal: 1 })
    expect(await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { ...first, items: [source(2)], startItem: 1 })).toMatchObject({ nextOffset: 100, indexedTotal: 2 })
    expect(await backend.mutation(internal.x402DirectoryIndexStore.applyPage, first)).toMatchObject({ nextOffset: 100, indexedTotal: 2 })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 2, observedAt: 3, runStartedAt: 1, workload, items: [] })
    expect(await backend.query(api.x402DirectoryIndex.status, {})).toMatchObject({ coverage: { indexedTotal: 2, duplicateObservations: 0, pagesFetched: 2 } })
  })

  it('skips malformed discovery rows without stalling later pages or advertising them as callable', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-malformed-row'
    await seedRefresh(backend, generation)
    const first = prepareIndexedDirectoryPage([{ resource: '', accepts: [{ scheme: 'exact', amount: '1' }] }, { resource: source(1).resource, description: 'Public research' }])
    expect(first).toMatchObject({ skippedInvalidItems: 1, items: [{ resource: source(1).resource }] })
    const invalidPayment = prepareIndexedDirectoryPage([{
      resource: 'https://invalid-provider.test/tools/payment',
      accepts: Array.from({ length: 129 }, (_, index) => ({ network: `eip155:${index + 100}`, scheme: 'exact', amount: '1' })),
    }])
    expect(invalidPayment).toMatchObject({ items: [], skippedInvalidItems: 1 })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 201, observedAt: 2, runStartedAt: 1, workload, ...first })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 201, observedAt: 3, runStartedAt: 1, workload, ...invalidPayment })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 200, reportedTotal: 201, observedAt: 4, runStartedAt: 1, workload, items: [source(2)] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 300, reportedTotal: 201, observedAt: 5, runStartedAt: 1, workload, items: [] })
    expect(await backend.query(api.x402DirectoryIndex.status, {})).toMatchObject({ kind: 'ready', coverage: { indexedTotal: 2, sourceChangedDuringScan: true } })
    expect(await backend.query(api.x402DirectoryIndex.resource, { resource: source(2).resource })).toMatchObject({ kind: 'found' })
    expect(await backend.query(api.x402DirectoryIndex.resource, { resource: '' })).toMatchObject({ kind: 'unavailable' })
  })

  it('denies a revoked workload before persisting the next source batch', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-revoked'
    await seedRefresh(backend, generation)
    await backend.run(async ctx => {
      const principal = await ctx.db.query('principals').filter(q => q.eq(q.field('principalRef'), workload.actorPrincipalRef)).unique()
      if (principal === null) throw new Error('missing fixture principal')
      await ctx.db.patch(principal._id, { lifecycle: 'suspended' })
    })
    await expect(backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 1, observedAt: 2, runStartedAt: 1, workload, items: [source(1)] })).rejects.toThrow()
    expect(await backend.query(internal.x402DirectoryIndexStore.checkpoint, { generation })).toMatchObject({ indexedTotal: 0, nextOffset: 0 })
    expect(await backend.run(ctx => ctx.db.query('marketExternalRegistryEntries').collect())).toEqual([])
  })

  it('combines exact provider, category, network and price filters on the same payment option', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-filters'
    await seedRefresh(backend, generation)
    const items = [source(1, { prices: [{ network: 'base', scheme: 'exact', amount: '2000000', decimalAmount: '2', symbol: 'USDC' }, { network: 'eip155:1', scheme: 'exact', amount: '100', decimalAmount: '0.0001', symbol: 'USDC' }] }), source(2)]
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 2, observedAt: 2, runStartedAt: 1, workload, items })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 2, observedAt: 3, runStartedAt: 1, workload, items: [] })
    const page = await backend.query(api.x402DirectoryIndex.browse, { query: 'research', category: 'research', provider: 'provider.test', network: 'eip155:8453', maxUsdPrice: 1, paginationOpts: { numItems: 20, cursor: null } })
    expect(page).toMatchObject({ kind: 'ok', searchMethod: 'native_full_text', page: [{ entry: { resource: source(2).resource } }] })
    expect(await backend.query(internal.x402DirectoryIndex.selectedSource, { resource: source(1).resource, network: 'base', maxUsdPrice: 1 })).toEqual({ kind: 'unavailable', reason: 'resource_filters_mismatch' })
    expect(await backend.query(api.x402DirectoryIndex.browse, { query: 'research', sort: 'popular', paginationOpts: { numItems: 20, cursor: null } })).toEqual({ kind: 'unavailable', reason: 'query_sort_unsupported' })
  })
  it('aggregates complete adoption and exact-price distributions and preserves exact explorer drilldowns', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-analytics'
    await seedRefresh(backend, generation)
    const items = [
      source(1, { activity: { payers30d: 1, calls30d: 50000 }, curated: true, bundleSlugs: ['research-workflow'], output: { fields: [], exampleJson: '{}' } }),
      source(2, { activity: { payers30d: 50, calls30d: 80 }, prices: [{ network: 'base', scheme: 'exact', amount: '10000', decimalAmount: '0.01', symbol: 'USDC' }], input: { fields: [], schemaJson: '{}' }, output: { fields: [], exampleJson: '{"result":true}' } }),
      source(3, { activity: { payers30d: 0 }, prices: [{ network: 'solana', scheme: 'upto', amount: '1', decimalAmount: '0.001', symbol: 'USDC' }] }),
      source(4, { activity: {}, prices: [{ network: 'base', scheme: 'exact', amount: '30000', decimalAmount: '0.03', symbol: 'USDC' }] }),
    ]
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 4, observedAt: 2, runStartedAt: 1, workload, items })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 4, observedAt: 3, runStartedAt: 1, workload, items: [] })
    const analytics = await backend.query(api.x402DirectoryIndex.analytics, {})
    expect(analytics).toMatchObject({ kind: 'ok', totalTools: 4, price: { totalTools: 4, knownPriceTools: 4, unknownPriceTools: 0, quantiles: { minimum: '0.001', median: '0.01', maximum: '1' } } })
    if (analytics.kind !== 'ok') throw new Error('analytics unavailable')
    expect(analytics.adoption.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(4)
    expect(analytics.metadata.find(item => item.key === 'hasOutputExample')?.count).toBe(1)
    expect(analytics.price.bands.find(item => item.key === '0_01_to_0_03')?.count).toBe(1)
    // Price facet memberships are only ever written for the aggregate '*' row
    // (cost fix: dropped per-network price_band/price fan-out), so the reader
    // always reports the whole-generation aggregate for price, regardless of
    // the requested network - it never silently returns zero.
    expect(await backend.query(api.x402DirectoryIndex.analytics, { network: 'base' })).toMatchObject({ kind: 'ok', totalTools: 4, price: { scope: 'whole_generation', totalTools: 4, knownPriceTools: 4, unknownPriceTools: 0, quantiles: { minimum: '0.001', median: '0.01', maximum: '1' } } })
    const browse = (filters: Record<string, unknown>) => backend.query(api.x402DirectoryIndex.browse, { ...filters, paginationOpts: { cursor: null, numItems: 12 } })
    const adoption = await browse({ sort: 'adoption', provider: 'provider.test' })
    expect(adoption.kind === 'ok' && adoption.page.map(item => item.entry.resource)).toEqual([source(2).resource, source(1).resource, source(4).resource])
    const price = await browse({ sort: 'price_asc', provider: 'provider.test' })
    expect(price.kind === 'ok' && price.page.map(item => item.entry.resource)).toEqual([source(2).resource, source(4).resource, source(1).resource])
    expect(await browse({ priceBand: '0_01_to_0_03' })).toMatchObject({ kind: 'ok', page: [{ entry: { resource: source(2).resource } }] })
    expect(await browse({ adoptionBand: 'missing', provider: 'provider.test' })).toMatchObject({ kind: 'ok', page: [{ entry: { resource: source(4).resource } }] })
    expect(await browse({ minPayers30d: 1, maxPayers30d: 1, curatedOnly: true, bundleSlugs: ['research-workflow'], tags: ['search'], provider: 'provider.test' })).toMatchObject({ kind: 'ok', page: [{ entry: { resource: source(1).resource } }] })
    expect(await browse({ minUsdPrice: 2, maxUsdPrice: 1 })).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(await browse({ minPayers30d: 2, maxPayers30d: 1 })).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(await browse({ hasOutputExample: true })).toMatchObject({ kind: 'ok', page: [{ entry: { resource: source(2).resource } }] })
    expect(await backend.query(api.x402DirectoryIndex.facets, { kind: 'bundle', paginationOpts: { cursor: null, numItems: 24 } })).toMatchObject({ kind: 'ok', page: [{ key: 'research-workflow', count: 1 }] })
  })

  it('excludes unpriced entries from default eligible browse', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-unpriced'
    await seedRefresh(backend, generation)
    const priced = source(1)
    const unpriced = source(2, { activity: { payers30d: 20, calls30d: 40 }, prices: [] })
    const items = [priced, unpriced]
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: items.length, observedAt: 2, runStartedAt: 1, workload, items })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: items.length, observedAt: 3, runStartedAt: 1, workload, items: [] })
    const page = await backend.query(api.x402DirectoryIndex.browse, { paginationOpts: { cursor: null, numItems: 12 } })
    if (page.kind !== 'ok') throw new Error('Directory browse unavailable')
    expect(page.page.map(item => item.entry.resource)).toEqual([priced.resource])
  })

  it('fills repeat pages by filtering the payer floor before pagination', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-repeat'
    await seedRefresh(backend, generation)
    const lowPayerRows = Array.from({ length: 12 }, (_, index) => source(index, { activity: { payers30d: 2, calls30d: 50000 } }))
    const repeatRows = Array.from({ length: 12 }, (_, index) => source(index + 12, { activity: { payers30d: 5, calls30d: 25 } }))
    const items = [...lowPayerRows, ...repeatRows]
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: items.length, observedAt: 2, runStartedAt: 1, workload, items })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: items.length, observedAt: 3, runStartedAt: 1, workload, items: [] })
    const result = await backend.query(api.x402DirectoryIndex.browse, {
      sort: 'repeat', paginationOpts: { cursor: null, numItems: 12 },
    })
    if (result.kind !== 'ok') throw new Error('Repeat browse unavailable')
    expect(result.page).toHaveLength(12)
    expect(result.page.every(item => (item.entry.activity?.payers30d ?? -1) >= 5)).toBe(true)
  })

  it('backfills retained observations atomically and idempotently without changing source evidence', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-backfill'
    await seedRefresh(backend, generation)
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 1, observedAt: 2, runStartedAt: 1, workload, items: [source(1, { activity: { payers30d: 10 } })] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 1, observedAt: 3, runStartedAt: 1, workload, items: [] })
    await backend.run(async ctx => {
      const generationRow = await ctx.db.query('marketExternalRegistryGenerations').withIndex('by_generation', q => q.eq('generation', generation)).unique()
      if (generationRow === null) throw new Error('Generation fixture unavailable')
      const previousPage = await ctx.db.query('marketExternalRegistryEntries')
        .withIndex('by_generation_and_documentId', q => q.eq('generation', generation)).paginate({ numItems: 1, cursor: null })
      await ctx.db.patch(generationRow._id, {
        analyticsVersion: ANALYTICS_VERSION - 1, analyticsStatus: 'building',
        analyticsCursor: previousPage.continueCursor, analyticsProcessed: 1,
      })
    })
    const before = await backend.run(ctx => ctx.db.query('marketExternalRegistryEntries').collect())
    expect(await backend.query(api.x402DirectoryIndex.analytics, {})).toEqual({ kind: 'unavailable', reason: 'analytics_building' })
    expect(await backend.query(api.x402DirectoryIndex.browse, { priceBand: '1_to_10', paginationOpts: { cursor: null, numItems: 12 } })).toMatchObject({ kind: 'ok', page: [{ entry: { resource: source(1).resource } }] })
    expect(await backend.query(api.x402DirectoryIndex.searchCompact, { query: 'research', priceBand: '1_to_10', paginationOpts: { cursor: null, numItems: 12 } })).toMatchObject({ kind: 'ok', page: [{ id: expect.any(String) }] })
    expect(await backend.mutation(internal.x402DirectoryIndexBackfill.batch, { generation, workload })).toEqual({ kind: 'ready', processed: 1 })
    expect(await backend.mutation(internal.x402DirectoryIndexBackfill.batch, { generation, workload })).toEqual({ kind: 'ready', processed: 1 })
    const projection = await backend.run(ctx => ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_network_and_resource', q => q.eq('generation', generation).eq('network', '*').eq('resource', source(1).resource)).unique())
    expect(projection?.minimumUsdPrice).toBeUndefined()
    expect(projection?.eligible).toBe(false)
    expect(projection?.priceOrder).toBe(Number.MAX_VALUE)
    expect(await backend.run(ctx => ctx.db.query('marketExternalRegistryEntries').collect())).toEqual(before)
    expect(await backend.query(api.x402DirectoryIndex.analytics, {})).toMatchObject({ kind: 'ok', totalTools: 1, adoption: expect.arrayContaining([{ key: '10_49', label: '10–49 payers', count: 1 }]) })
  })

  it('returns compact class-filtered cursor pages while keeping source JSON behind exact document ID detail', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-compact'
    await seedRefresh(backend, generation)
    const unknown = source(26, { tags: [] })
    delete unknown.entry.category
    const retained = { resource: unknown.resource, description: 'Research tool 26', fullSchema: 'x'.repeat(8000) }
    const geo = source(27, { tags: [], method: 'GET', input: {
      fields: [{ name: 'latitude', path: 'latitude', location: 'queryParams', source: 'schema' }],
    } })
    delete geo.entry.category
    const items = [...Array.from({ length: 26 }, (_, index) => source(index, {
      category: index === 25 ? 'image generation' : 'web search',
      tags: index === 25 ? ['generate', 'image'] : ['search', 'web'],
    })), { ...unknown, sourceJson: JSON.stringify(retained), sourceDigest: canonicalDigest(retained) }, geo]
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 28, observedAt: 2, runStartedAt: 1, workload, items })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 28, observedAt: 3, runStartedAt: 1, workload, items: [] })
    let cursor: string | null = null
    let firstCursor: string | undefined
    const ids = new Set<string>()
    let unclassifiedId: string | undefined
    for (let pageIndex = 0; pageIndex < 3; pageIndex += 1) {
      const result: Infer<typeof searchCompactReturns> = await backend.query(api.x402DirectoryIndex.searchCompact, { query: 'research', actionClass: 'retrieve', objectClass: 'web', paginationOpts: { cursor, numItems: 12 } })
      if (result.kind !== 'ok') throw new Error('compact index unavailable')
      for (const row of result.page) {
        expect(row).toMatchObject({ source: 'coinbase', completedAt: 3 })
        if (row.actionClass === 'unclassified' && row.objectClass === 'unclassified') unclassifiedId = row.id
        expect(JSON.stringify(row)).not.toContain('sourceJson')
        expect(JSON.stringify(row)).not.toContain('metadataJson')
        expect(row.resource).toMatch(/^https:\/\/provider\.test\/tools\/\d+$/u)
        expect(JSON.stringify(row)).not.toContain('fullSchema')
        ids.add(row.id)
      }
      expect(result.coverage).toMatchObject({ generation, completedAt: 3 })
      expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(16 * 1024)
      if (pageIndex === 0) firstCursor = result.continueCursor
      if (result.isDone) break
      cursor = result.continueCursor
    }
    expect(ids.size).toBe(26)
    const classified = await backend.query(api.x402DirectoryIndex.searchCompact, { query: 'research', actionClass: 'create', objectClass: 'image', paginationOpts: { cursor: null, numItems: 8 } })
    expect(unclassifiedId).toBeDefined()
    expect(await backend.query(api.x402DirectoryIndex.searchCompact, { query: '', paginationOpts: { cursor: null, numItems: 12 } }))
      .toMatchObject({ kind: 'ok', isDone: false, page: expect.arrayContaining([expect.objectContaining({ id: expect.stringMatching(/^registry:/u) })]) })
    expect(classified).toMatchObject({ kind: 'ok', page: expect.arrayContaining([
      expect.objectContaining({ actionClass: 'create', objectClass: 'image' }),
      expect.objectContaining({ actionClass: 'unclassified', objectClass: 'unclassified' }),
    ]) })
    expect(await backend.query(api.x402DirectoryIndex.searchCompact, { query: 'research', actionClass: 'retrieve', objectClass: 'location', paginationOpts: { cursor: null, numItems: 8 } }))
      .toMatchObject({ kind: 'ok', page: expect.arrayContaining([expect.objectContaining({ actionClass: 'retrieve', objectClass: 'location' })]) })
    const rawId = ids.values().next().value
    if (rawId === undefined) throw new Error('missing compact ID')
    const detail = await backend.query(api.x402DirectoryIndex.detailById, { id: rawId })
    expect(detail).toMatchObject({ kind: 'found', item: { entry: { metadataJson: expect.stringContaining('resource') } } })
    if (unclassifiedId === undefined) throw new Error('missing unclassified listing')
    expect(await backend.query(api.x402DirectoryIndex.detailById, { id: unclassifiedId }))
      .toMatchObject({ kind: 'found', item: { entry: { metadataJson: JSON.stringify(retained) } } })
    expect(await backend.query(api.x402DirectoryIndex.detailById, { id: 'registry:missing' })).toEqual({ kind: 'not_found' })
    expect(await backend.query(api.x402DirectoryIndex.searchCompact, { query: 'x'.repeat(201), paginationOpts: { cursor: null, numItems: 8 } })).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    if (firstCursor === undefined) throw new Error('missing pagination cursor')
    expect(await backend.query(api.x402DirectoryIndex.searchCompact, { query: 'research', objectClass: 'image', paginationOpts: { cursor: firstCursor, numItems: 8 } }))
      .toEqual({ kind: 'unavailable', reason: 'cursor_invalid' })
    await backend.run(async ctx => {
      const record = await ctx.db.query('marketExternalRegistryGenerations').withIndex('by_generation', q => q.eq('generation', generation)).unique()
      if (record === null) throw new Error('missing directory generation')
      await ctx.db.patch(record._id, { completedAt: 4 })
    })
    expect(await backend.query(api.x402DirectoryIndex.searchCompact, { query: 'research', actionClass: 'retrieve', objectClass: 'web', paginationOpts: { cursor: firstCursor, numItems: 12 } }))
      .toEqual({ kind: 'unavailable', reason: 'cursor_invalid' })
  })

  it('classifies previously indexed unchanged rows during the existing refresh', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-reclassify'
    await seedRefresh(backend, generation)
    const item = source(1, { category: 'document parsing', tags: ['parse', 'pdf'] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 1, observedAt: 2, runStartedAt: 1, workload, items: [item] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 1, observedAt: 3, runStartedAt: 1, workload, items: [] })
    await backend.run(async ctx => {
      const row = await ctx.db.query('marketDirectorySearchEntries').withIndex('by_generation_and_network_and_resource', q => q.eq('generation', generation).eq('network', '*').eq('resource', item.resource)).unique()
      if (row === null) throw new Error('missing projected row')
      await ctx.db.patch(row._id, { actionClass: undefined, objectClass: undefined })
      const entry = await ctx.db.get(row.entryId)
      if (entry === null) throw new Error('missing source row')
      await ctx.db.patch(entry._id, { actionClass: undefined, objectClass: undefined })
    })
    await backend.run(async ctx => {
      const state = await ctx.db.query('marketExternalRegistryState').withIndex('by_key', q => q.eq('key', 'coinbase')).unique()
      const active = await ctx.db.query('marketExternalRegistryGenerations').withIndex('by_generation', q => q.eq('generation', generation)).unique()
      if (state === null || active === null) throw new Error('missing index state')
      await ctx.db.patch(state._id, { refreshGeneration: generation, lastAttemptStatus: 'refreshing', runStartedAt: 4 })
      await ctx.db.patch(active._id, { status: 'refreshing', nextOffset: 0, pageItemCursor: undefined })
    })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 1, observedAt: 4, runStartedAt: 4, workload, items: [item] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 1, observedAt: 5, runStartedAt: 4, workload, items: [] })
    expect(await backend.query(api.x402DirectoryIndex.searchCompact, { query: 'research', actionClass: 'transform', objectClass: 'document', paginationOpts: { cursor: null, numItems: 8 } }))
      .toMatchObject({ kind: 'ok', page: [{ actionClass: 'transform', objectClass: 'document' }] })
  })

  it.each([
    ['production', 'base', 'base-sepolia', false],
    ['production', 'base', 'base-sepolia', true],
    ['development', 'base-sepolia', 'base', false],
    ['development', 'base-sepolia', 'base', true],
  ] as const)('fences %s directory reads to its payment network with mixed price order %s', async (deployment, target, opposite, reverseMixed) => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', deployment)
    const { backend, workload } = await setup()
    const generation = `directory-environment-${deployment}-${reverseMixed}`
    await seedRefresh(backend, generation)
    const price = (network: string, amount: string) => ({ network, scheme: 'exact', amount, decimalAmount: amount === '1000000' ? '1' : '0.001', symbol: 'USDC' })
    const targetOnly = source(801, { prices: [price(target, '1000000')] })
    const oppositeOnly = source(802, { prices: [price(opposite, '1000')] })
    const mixedPrices = [price(target, '1000000'), price(opposite, '1000')]
    const mixed = source(803, { prices: reverseMixed ? [...mixedPrices].reverse() : mixedPrices })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, {
      generation, offset: 0, reportedTotal: 3, observedAt: 2, runStartedAt: 1, workload,
      items: [oppositeOnly, mixed, targetOnly],
    })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, {
      generation, offset: 100, reportedTotal: 3, observedAt: 3, runStartedAt: 1, workload, items: [],
    })
    const rows = await backend.run(ctx => ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_network_and_resource', q => q.eq('generation', generation).eq('network', target === 'base' ? 'eip155:8453' : 'eip155:84532'))
      .collect())
    const mixedRow = rows.find(row => row.resource === mixed.resource)
    const oppositeRow = await backend.run(ctx => ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_network_and_resource', q => q.eq('generation', generation).eq('network', opposite === 'base' ? 'eip155:8453' : 'eip155:84532').eq('resource', oppositeOnly.resource))
      .unique())
    if (mixedRow === undefined || oppositeRow === null || mixedRow.slug === undefined || oppositeRow.slug === undefined
      || mixedRow.providerKey === undefined || oppositeRow.providerKey === undefined
      || mixedRow.documentId === undefined || oppositeRow.documentId === undefined) throw new Error('directory environment fixture missing')
    const browse = await backend.query(api.x402DirectoryIndex.browse, { paginationOpts: { cursor: null, numItems: 12 } })
    expect(browse.kind).toBe('ok')
    if (browse.kind === 'ok') {
      expect(browse.page.map(row => row.entry.resource).sort()).toEqual([targetOnly.resource, mixed.resource].sort())
      expect(browse.page.find(row => row.entry.resource === mixed.resource)?.entry.prices)
        .toEqual([expect.objectContaining({ network: target })])
    }
    const compact = await backend.query(api.x402DirectoryIndex.searchCompact, { query: 'research', paginationOpts: { cursor: null, numItems: 12 } })
    expect(compact.kind).toBe('ok')
    if (compact.kind === 'ok') expect(compact.page.map(row => row.resource).sort()).toEqual([targetOnly.resource, mixed.resource].sort())
    expect(await backend.query(api.x402DirectoryIndex.resource, { resource: oppositeOnly.resource })).toEqual({ kind: 'not_found' })
    expect(await backend.query(api.x402DirectoryIndex.resource, { resource: mixed.resource }))
      .toMatchObject({ kind: 'found', item: { entry: { prices: [expect.objectContaining({ network: target })] } } })
    expect(await backend.query(api.x402DirectoryIndex.detailById, { id: oppositeRow.documentId })).toEqual({ kind: 'not_found' })
    expect(await backend.query(api.x402DirectoryIndex.detailById, { id: mixedRow.documentId }))
      .toMatchObject({ kind: 'found', item: { entry: { prices: [expect.objectContaining({ network: target })] } } })
    expect(await backend.query(api.x402DirectoryIndex.bySlug, { providerKey: oppositeRow.providerKey, slug: oppositeRow.slug }))
      .toEqual({ kind: 'not_found' })
    expect(await backend.query(api.x402DirectoryIndex.bySlug, { providerKey: mixedRow.providerKey, slug: mixedRow.slug }))
      .toMatchObject({ kind: 'found', item: { entry: { prices: [expect.objectContaining({ network: target })] } } })
    expect((await backend.query(internal.x402DirectoryIndex.firstEligiblePage, { generation })).sort())
      .toEqual([targetOnly.resource, mixed.resource].sort())
    expect(await backend.query(internal.x402DirectoryIndex.selectedSource, { resource: oppositeOnly.resource }))
      .toEqual({ kind: 'not_found' })
    expect(await backend.query(internal.x402DirectoryIndex.selectedSource, { resource: mixed.resource }))
      .toMatchObject({ kind: 'found', sourceJson: mixed.sourceJson, entry: { prices: [expect.objectContaining({ network: target })] } })
    expect(await backend.query(api.x402DirectoryIndex.browse, { network: opposite, paginationOpts: { cursor: null, numItems: 12 } }))
      .toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(await backend.query(api.x402DirectoryIndex.searchCompact, { query: 'research', network: opposite, paginationOpts: { cursor: null, numItems: 12 } }))
      .toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(await backend.query(internal.x402DirectoryIndex.selectedSource, { resource: mixed.resource, network: opposite }))
      .toEqual({ kind: 'unavailable', reason: 'resource_filters_mismatch' })
    const stored = await backend.run(ctx => ctx.db.query('marketExternalRegistryEntries')
      .withIndex('by_generation_and_documentId', q => q.eq('generation', generation).eq('documentId', mixedRow.documentId!)).unique())
    expect(stored?.directorySourceJson).toBe(mixed.sourceJson)
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', undefined)
    expect(await backend.query(api.x402DirectoryIndex.browse, { paginationOpts: { cursor: null, numItems: 12 } }))
      .toEqual({ kind: 'unavailable', reason: 'source_unavailable' })
    expect(await backend.query(api.x402DirectoryIndex.searchCompact, { query: 'research', paginationOpts: { cursor: null, numItems: 12 } }))
      .toEqual({ kind: 'unavailable', reason: 'source_unavailable' })
    expect(await backend.query(internal.x402DirectoryIndex.firstEligiblePage, { generation })).toEqual([])
  })

})
