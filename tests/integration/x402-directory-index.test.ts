import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { Infer } from 'convex/values'
import { pageValue } from '../../convex/lib/x402DirectoryIndex/contracts'
import type { IndexedSource } from '../../convex/lib/x402DirectoryIndex/contracts'
import { convexTestWithMarketComponents, type ConvexFixtureBackend } from '../helpers/convex-fixtures'

function source(index: number, overrides: Partial<IndexedSource['entry']> = {}): IndexedSource {
  const resource = `https://provider.test/tools/${index}`
  const raw = { resource, type: 'http', description: `Research tool ${index}`, ...(overrides.title === undefined ? {} : { title: overrides.title }) }
  return { resource, sourceJson: JSON.stringify(raw), sourceDigest: canonicalDigest(raw), entry: {
    resource, title: `Research tool ${index}`, description: 'Search public research', protocol: 'http', provider: 'provider.test', metadataJson: '',
    category: 'Research', tags: ['search'], activity: { calls30d: index }, provenance: { directory: 'Coinbase Bazaar', metadata: 'provider_declared', updatedAt: new Date(1700000000000 + index).toISOString() },
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
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('indexes beyond 1,000 resources, publishes only after terminal page, paginates all results and resolves an exact late resource', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-complete'
    await seedRefresh(backend, generation)
    for (let offset = 0; offset < 1001; offset += 100) {
      await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset, reportedTotal: 1001, observedAt: offset + 2, workload, items: Array.from({ length: Math.min(100, 1001 - offset) }, (_, i) => source(offset + i)) })
    }
    expect(await backend.query(api.x402DirectoryIndex.status, {})).toMatchObject({ kind: 'unavailable', refreshState: 'refreshing' })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 1100, reportedTotal: 1001, observedAt: 1200, workload, items: [] })
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
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 101, observedAt: 2, workload, items: [source(1)] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 2, observedAt: 3, workload, items: [source(1, { title: 'Updated research' }), source(2)] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 200, reportedTotal: 2, observedAt: 4, workload, items: [] })
    expect(await backend.query(api.x402DirectoryIndex.status, {})).toMatchObject({ kind: 'ready', coverage: { indexedTotal: 2, sourceChangedDuringScan: true, duplicateObservations: 1 } })
    await seedRefresh(backend, 'coinbase-failed')
    await expect(backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation: 'coinbase-failed', offset: 0, reportedTotal: 100, observedAt: 5, workload, items: [] })).rejects.toThrow('directory_source_ended_early')
    await backend.mutation(internal.x402DirectoryIndexStore.fail, { generation: 'coinbase-failed', reason: 'source failed', workload })
    expect(await backend.query(api.x402DirectoryIndex.status, {})).toMatchObject({ kind: 'ready', refreshState: 'failed', coverage: { generation, indexedTotal: 2 } })
    expect(await backend.query(api.x402DirectoryIndex.resource, { resource: source(1).resource })).toMatchObject({ kind: 'found', item: { entry: { title: 'Updated research' } } })
  })

  it('reprojects stale display titles from retained source metadata without rewriting the snapshot or starting another scan', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-retained-title'
    await seedRefresh(backend, generation)
    const original = source(1, { title: 'StableEnrich', serviceName: 'StableEnrich' })
    const raw = { resource: original.resource, serviceName: 'StableEnrich', description: 'Exa Search. Search the web for current evidence.' }
    const observed = { ...original, sourceJson: JSON.stringify(raw), sourceDigest: canonicalDigest(raw) }
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 1, observedAt: 2, workload, items: [observed] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 1, observedAt: 3, workload, items: [] })
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
    const first = { generation, offset: 0, reportedTotal: 2, observedAt: 2, workload, items: [source(1)], startItem: 0, totalItems: 2 }
    expect(await backend.mutation(internal.x402DirectoryIndexStore.applyPage, first)).toMatchObject({ nextOffset: 0, indexedTotal: 1 })
    expect(await backend.mutation(internal.x402DirectoryIndexStore.applyPage, first)).toMatchObject({ nextOffset: 0, indexedTotal: 1 })
    expect(await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { ...first, items: [source(2)], startItem: 1 })).toMatchObject({ nextOffset: 100, indexedTotal: 2 })
    expect(await backend.mutation(internal.x402DirectoryIndexStore.applyPage, first)).toMatchObject({ nextOffset: 100, indexedTotal: 2 })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 2, observedAt: 3, workload, items: [] })
    expect(await backend.query(api.x402DirectoryIndex.status, {})).toMatchObject({ coverage: { indexedTotal: 2, duplicateObservations: 0, pagesFetched: 2 } })
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
    await expect(backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 1, observedAt: 2, workload, items: [source(1)] })).rejects.toThrow()
    expect(await backend.query(internal.x402DirectoryIndexStore.checkpoint, { generation })).toMatchObject({ indexedTotal: 0, nextOffset: 0 })
    expect(await backend.run(ctx => ctx.db.query('marketExternalRegistryEntries').collect())).toEqual([])
  })

  it('combines exact provider, category, network and price filters on the same payment option', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-filters'
    await seedRefresh(backend, generation)
    const items = [source(1, { prices: [{ network: 'base', scheme: 'exact', amount: '2000000', decimalAmount: '2', symbol: 'USDC' }, { network: 'eip155:1', scheme: 'exact', amount: '100', decimalAmount: '0.0001', symbol: 'USDC' }] }), source(2)]
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 2, observedAt: 2, workload, items })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 2, observedAt: 3, workload, items: [] })
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
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 4, observedAt: 2, workload, items })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 4, observedAt: 3, workload, items: [] })
    const analytics = await backend.query(api.x402DirectoryIndex.analytics, {})
    expect(analytics).toMatchObject({ kind: 'ok', totalTools: 4, price: { totalTools: 4, knownPriceTools: 3, unknownPriceTools: 1, quantiles: { minimum: '0.01', median: '0.03', maximum: '1' } } })
    if (analytics.kind !== 'ok') throw new Error('analytics unavailable')
    expect(analytics.adoption.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(4)
    expect(analytics.metadata.find(item => item.key === 'hasOutputExample')?.count).toBe(1)
    expect(analytics.price.bands.find(item => item.key === '0_01_to_0_03')?.count).toBe(1)
    expect(await backend.query(api.x402DirectoryIndex.analytics, { network: 'base' })).toMatchObject({ kind: 'ok', totalTools: 4, price: { scope: 'network', totalTools: 3, unknownPriceTools: 0 } })
    const browse = (filters: Record<string, unknown>) => backend.query(api.x402DirectoryIndex.browse, { ...filters, paginationOpts: { cursor: null, numItems: 12 } })
    const adoption = await browse({ sort: 'adoption' })
    expect(adoption.kind === 'ok' && adoption.page.map(item => item.entry.resource)).toEqual([source(2).resource, source(1).resource, source(3).resource, source(4).resource])
    const price = await browse({ sort: 'price_asc' })
    expect(price.kind === 'ok' && price.page.map(item => item.entry.resource)).toEqual([source(2).resource, source(4).resource, source(1).resource, source(3).resource])
    expect(await browse({ priceBand: '0_01_to_0_03' })).toMatchObject({ kind: 'ok', page: [{ entry: { resource: source(2).resource } }] })
    expect(await browse({ adoptionBand: 'missing' })).toMatchObject({ kind: 'ok', page: [{ entry: { resource: source(4).resource } }] })
    expect(await browse({ minPayers30d: 1, maxPayers30d: 1, curatedOnly: true, bundleSlugs: ['research-workflow'], tags: ['search'] })).toMatchObject({ kind: 'ok', page: [{ entry: { resource: source(1).resource } }] })
    expect(await browse({ minUsdPrice: 2, maxUsdPrice: 1 })).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(await browse({ minPayers30d: 2, maxPayers30d: 1 })).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(await browse({ hasOutputExample: true })).toMatchObject({ kind: 'ok', page: [{ entry: { resource: source(2).resource } }] })
    expect(await backend.query(api.x402DirectoryIndex.facets, { kind: 'bundle', paginationOpts: { cursor: null, numItems: 24 } })).toMatchObject({ kind: 'ok', page: [{ key: 'research-workflow', count: 1 }] })
  })

  it('backfills retained observations atomically and idempotently without changing source evidence', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-backfill'
    await seedRefresh(backend, generation)
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 1, observedAt: 2, workload, items: [source(1, { activity: { payers30d: 10 } })] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 1, observedAt: 3, workload, items: [] })
    const before = await backend.run(async ctx => {
      const row = await ctx.db.query('marketExternalRegistryGenerations').withIndex('by_generation', q => q.eq('generation', generation)).unique()
      await ctx.db.patch(row!._id, { analyticsVersion: undefined, analyticsStatus: undefined })
      return await ctx.db.query('marketExternalRegistryEntries').collect()
    })
    expect(await backend.query(api.x402DirectoryIndex.analytics, {})).toEqual({ kind: 'unavailable', reason: 'analytics_building' })
    expect(await backend.mutation(internal.x402DirectoryIndexBackfill.batch, { generation, workload })).toEqual({ kind: 'ready', processed: 1 })
    expect(await backend.mutation(internal.x402DirectoryIndexBackfill.batch, { generation, workload })).toEqual({ kind: 'ready', processed: 1 })
    expect(await backend.run(ctx => ctx.db.query('marketExternalRegistryEntries').collect())).toEqual(before)
    expect(await backend.query(api.x402DirectoryIndex.analytics, {})).toMatchObject({ kind: 'ok', totalTools: 1, adoption: expect.arrayContaining([{ key: '10_49', label: '10–49 payers', count: 1 }]) })
  })

})
