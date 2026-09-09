import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
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

describe('marketExternalRegistry.search over the Coinbase directory', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const search = (backend: ConvexFixtureBackend, args: any = {}) => backend.query(api.marketExternalRegistry.search, { query: '', access: 'all', limit: 20, cursor: null, ...args })

  it('is unavailable before any Coinbase generation exists', async () => {
    const { backend } = await setup()
    expect(await search(backend, {})).toMatchObject({ kind: 'unavailable' })
  })

  it('is unavailable while the Coinbase generation is still refreshing', async () => {
    const { backend, workload } = await setup()
    await seedRefresh(backend, 'coinbase-search-refreshing')
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation: 'coinbase-search-refreshing', offset: 0, reportedTotal: 2, observedAt: 2, workload, items: [source(1), source(2)] })
    expect(await search(backend, {})).toMatchObject({ kind: 'unavailable' })
  })

  it('[REGRESSION] browses and searches the complete Coinbase generation', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-search-complete'
    await seedRefresh(backend, generation)
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 2, observedAt: 2, workload, items: [source(1), source(2)] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 2, observedAt: 3, workload, items: [] })

    // browse: result.kind === 'ok' and page has length 2 and every row's endpointUrl refers to 'https://provider.test/tools/'
    const browseResult = await search(backend, {})
    expect(browseResult.kind).toBe('ok')
    if (browseResult.kind !== 'ok') throw new Error('unexpected unavailable page')
    expect(browseResult.page).toHaveLength(2)
    browseResult.page.forEach((row: any) => {
      expect(row.endpointUrl).toMatch(/https:\/\/provider\.test\/tools\//)
    })

    // query 'Research tool 2': kind ok and page length >= 1 and some row names/summaries contain 'Research tool 2'
    const queryResult = await search(backend, { query: 'Research tool 2' })
    expect(queryResult.kind).toBe('ok')
    if (queryResult.kind !== 'ok') throw new Error('unexpected unavailable for query')
    expect(queryResult.page.length).toBeGreaterThanOrEqual(1)
    const hasMatchingRow = queryResult.page.some((row: any) => {
      return (row.name && row.name.includes('Research tool 2')) || (row.summary && row.summary.includes('Research tool 2'))
    })
    expect(hasMatchingRow).toBe(true)

    // access 'x402': kind ok, page length 2
    const x402Result = await search(backend, { access: 'x402' })
    expect(x402Result.kind).toBe('ok')
    if (x402Result.kind !== 'ok') throw new Error('unexpected unavailable for x402 access')
    expect(x402Result.page).toHaveLength(2)

    // access 'provider_account': kind ok, page length 0
    const providerResult = await search(backend, { access: 'provider_account' })
    expect(providerResult.kind).toBe('ok')
    if (providerResult.kind !== 'ok') throw new Error('unexpected unavailable for provider_account access')
    expect(providerResult.page).toHaveLength(0)
  })

  it('rejects invalid limits and over-long queries', async () => {
    const { backend } = await setup()
    await expect(search(backend, { limit: 0 })).rejects.toThrow()
    await expect(search(backend, { query: 'x'.repeat(201) })).rejects.toThrow()
  })
})
