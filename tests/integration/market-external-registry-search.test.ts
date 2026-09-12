import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { internal } from '../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { IndexedSource } from '../../convex/lib/x402DirectoryIndex/contracts'
import { convexTestWithMarketComponents, type ConvexFixtureBackend } from '../helpers/convex-fixtures'
import { setPublicSourceTransportForTests, type ConvexSourceTransport } from '@/lib/server/convex-source'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { handleApiRegistryRequest } from '@/routes/api.v1.registry'

// This suite used to exercise `marketExternalRegistry:search` directly. C2+C3
// repoints the public `/api/v1/registry` route at `x402DirectoryIndex:browse`
// instead (decision D2, the shared opaque-cursor contract), so these cases now
// drive the route itself against a real Convex test backend. The unrelated
// `tests/integration/registry-api.test.ts` file covers a different "registry"
// (the durable business/offering catalog, not this external tool directory),
// so it does not already cover any of this behaviour.

function source(index: number, overrides: Partial<IndexedSource['entry']> = {}): IndexedSource {
  const resource = `https://provider.test/tools/${index}`
  const raw = { resource, type: 'http', description: `Research tool ${index}`, ...(overrides.title === undefined ? {} : { title: overrides.title }) }
  return { resource, sourceJson: JSON.stringify(raw), sourceDigest: canonicalDigest(raw), entry: {
    resource, title: `Research tool ${index}`, description: 'Search public research', protocol: 'http', provider: 'provider.test', metadataJson: '',
    category: 'Research', tags: ['search'],
    // Directory-eligible by default (payersOrder>=2 + a declared output shape):
    // this suite exercises pagination/route mechanics, not eligibility, and
    // browse() now defaults to eligible-only.
    activity: { calls30d: index, payers30d: 2 }, output: { fields: [], schemaJson: '{}' },
    provenance: { directory: 'Coinbase Bazaar', metadata: 'provider_declared', updatedAt: new Date(1700000000000 + index).toISOString() },
    prices: [{ network: 'base', scheme: 'exact', amount: '1000000', decimalAmount: '1', symbol: 'USDC' }], ...overrides,
  } }
}

async function setup() {
  const backend = convexTestWithMarketComponents()
  await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
  const workload = await backend.query(internal.workloadCron.admit, { name: 'refresh Agentic Economy API registry' })
  const transport: ConvexSourceTransport = {
    query: backend.query as ConvexSourceTransport['query'],
    mutation: backend.mutation as ConvexSourceTransport['mutation'],
    action: backend.action as ConvexSourceTransport['action'],
  }
  setPublicSourceTransportForTests(transport)
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

function registryUrl(params: Readonly<{ query?: string; limit?: number; cursor?: string }> = {}): URL {
  const url = new URL('https://ae.test/api/v1/registry')
  if (params.query !== undefined) url.searchParams.set('query', params.query)
  if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit))
  if (params.cursor !== undefined) url.searchParams.set('cursor', params.cursor)
  return url
}

async function getRegistry(params: Readonly<{ query?: string; limit?: number; cursor?: string }> = {}) {
  return handleApiRegistryRequest(new Request(registryUrl(params)))
}

describe('GET /api/v1/registry backed by the x402 directory browse index', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
  })
  afterEach(() => {
    vi.useRealTimers()
    setHttpRateLimitAdmissionForTests(undefined)
    setPublicSourceTransportForTests(undefined)
  })

  it('is unavailable (503 registry_unavailable) before any Coinbase generation exists', async () => {
    await setup()
    const response = await getRegistry()
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('30')
    await expect(response.json()).resolves.toMatchObject({ kind: 'UNAVAILABLE', code: 'registry_unavailable' })
  })

  it('is unavailable (503 registry_unavailable) while the Coinbase generation is still refreshing', async () => {
    const { backend, workload } = await setup()
    await seedRefresh(backend, 'coinbase-search-refreshing')
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation: 'coinbase-search-refreshing', offset: 0, reportedTotal: 2, observedAt: 2, runStartedAt: 1, workload, items: [source(1), source(2)] })

    const response = await getRegistry()
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ kind: 'UNAVAILABLE', code: 'registry_unavailable' })
  })

  it('[REGRESSION] browses and searches the complete Coinbase generation through the route', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-search-complete'
    await seedRefresh(backend, generation)
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 2, observedAt: 2, runStartedAt: 1, workload, items: [source(1), source(2)] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 2, observedAt: 3, runStartedAt: 1, workload, items: [] })

    const browseResponse = await getRegistry()
    expect(browseResponse.status).toBe(200)
    const browseBody = await browseResponse.json()
    expect(browseBody.schemaVersion).toBe('api-registry:v3')
    expect(browseBody.kind).toBe('ok')
    expect(browseBody.page).toHaveLength(2)
    for (const row of browseBody.page) expect(row.entry.resource).toMatch(/^https:\/\/provider\.test\/tools\//)
    expect(browseBody.pagination).toEqual({ limit: 24, hasMore: false })
    // Freshness reports the x402 directory source (review issue 4A / C16); the
    // fixture's tiny `observedAt` reads as ancient next to real wall-clock time,
    // so the derived state is 'stale' rather than 'fresh' - the source and the
    // real completion timestamp are what this asserts.
    expect(browseBody.freshness).toEqual({
      source: 'x402_directory',
      state: 'stale',
      completedAt: 3,
      staleAfterMs: 36 * 60 * 60 * 1000,
    })
    // Verify response does not contain internal fields
    expect(browseBody).not.toHaveProperty('access')
    expect(browseBody).not.toHaveProperty('isDone')
    expect(browseBody).not.toHaveProperty('continueCursor')
    expect(browseBody).not.toHaveProperty('splitCursor')
    expect(browseBody).not.toHaveProperty('pageStatus')

    const searchResponse = await getRegistry({ query: 'Research tool 2' })
    expect(searchResponse.status).toBe(200)
    const searchBody = await searchResponse.json()
    expect(searchBody.kind).toBe('ok')
    expect(searchBody.page.length).toBeGreaterThanOrEqual(1)
    expect(searchBody.page.some((row: { entry: { resource: string } }) => row.entry.resource === 'https://provider.test/tools/2')).toBe(true)
  })

  it('rejects invalid limits and over-long queries before reaching the index', async () => {
    await setup()

    const overLong = await getRegistry({ query: 'x'.repeat(201) })
    expect(overLong.status).toBe(400)
    await expect(overLong.json()).resolves.toMatchObject({ kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter' })

    const badLimit = await getRegistry({ limit: 0 })
    expect(badLimit.status).toBe(400)
    await expect(badLimit.json()).resolves.toMatchObject({ kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter' })
  })

  it('rejects access query parameter as invalid_query_parameter', async () => {
    await setup()

    const url = new URL('https://ae.test/api/v1/registry')
    url.searchParams.set('access', 'provider_account')
    const response = await handleApiRegistryRequest(new Request(url))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter' })
  })

  it('caps a limit=24 request to at most 12 native rows and reports hasMore until exhausted', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-search-paged'
    await seedRefresh(backend, generation)
    const items = Array.from({ length: 13 }, (_, index) => source(index + 1))
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 13, observedAt: 2, runStartedAt: 1, workload, items })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 13, observedAt: 3, runStartedAt: 1, workload, items: [] })

    const first = await getRegistry({ limit: 24 })
    expect(first.status).toBe(200)
    const firstBody = await first.json()
    expect(firstBody.page.length).toBeLessThanOrEqual(12)
    expect(firstBody.pagination.limit).toBe(24)
    expect(firstBody.pagination.hasMore).toBe(true)
    expect(typeof firstBody.pagination.nextCursor).toBe('string')

    const second = await getRegistry({ limit: 24, cursor: firstBody.pagination.nextCursor })
    expect(second.status).toBe(200)
    const secondBody = await second.json()
    expect(firstBody.page.length + secondBody.page.length).toBe(13)
    expect(secondBody.pagination.hasMore).toBe(false)
  })
})
