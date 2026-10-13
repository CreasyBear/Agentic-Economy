import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { IndexedSource } from '../../convex/lib/market/directoryIndex/contracts'
import { convexTestWithMarketComponents, type ConvexFixtureBackend } from '../helpers/convex-fixtures'
import { setPublicSourceTransportForTests, type ConvexSourceTransport } from '@/lib/server/convex-source'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { handleApiRegistryRequest } from '@/routes/api.v1.registry'
import { handleApiRegistryDetailRequest } from '@/routes/api.v1.registry.detail'
import { handleMcpRequest } from '@/lib/server/mcp-api'
import { readMcpBody } from '../helpers/mcp-response'

// Drive compact list and exact detail against the real indexed generation.
// The durable business/offering registry is a separate API.

function source(index: number, overrides: Partial<IndexedSource['entry']> = {}): IndexedSource {
  const resource = `https://provider.test/tools/${index}`
  const raw = { resource, type: 'http', description: `Research tool ${index}`, ...(overrides.title === undefined ? {} : { title: overrides.title }) }
  return { resource, sourceJson: JSON.stringify(raw), sourceDigest: canonicalDigest(raw), admission: { kind: 'quotable' as const }, entry: {
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

describe('GET /api/v1/registry backed by the compact x402 directory index', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
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

  it('[REGRESSION] searches compact Coinbase rows and inspects source schema only by exact ID', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-search-complete'
    await seedRefresh(backend, generation)
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 2, observedAt: 2, runStartedAt: 1, workload, items: [source(1), source(2)] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 2, observedAt: 3, runStartedAt: 1, workload, items: [] })

    const browseResponse = await getRegistry()
    expect(browseResponse.status).toBe(200)
    const browseBody = await browseResponse.json()
    expect(browseBody.schemaVersion).toBe('api-registry:v4')
    expect(browseBody.kind).toBe('ok')
    expect(browseBody.page).toHaveLength(2)
    for (const row of browseBody.page) {
      expect(row.id).toMatch(/^registry:[a-f0-9]{64}$/u)
      expect(row.access).toBe('ae_callable')
      expect(row.toolRef).toBe(row.id)
      expect(row.detailRef).toBe(`/api/v1/registry/detail?id=${encodeURIComponent(row.id)}`)
      expect(row).not.toHaveProperty('entry')
    }
    expect(browseBody.pagination).toEqual({ limit: 8, hasMore: false })
    const toolRef = browseBody.page[0].toolRef as string
    const nativeResponse = await handleMcpRequest(new Request('https://ae.test/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
        name: 'ae_registry_tools_describe', arguments: { toolRef },
      } }),
    }))
    const nativeDetail = await readMcpBody(nativeResponse)
    expect(nativeDetail.result?.isError).not.toBe(true)
    expect(nativeDetail.result?.structuredContent).toMatchObject({ result: {
      kind: 'external', schemaVersion: 'registry-tools:v3', tool: {
        id: toolRef, toolRef, source: 'coinbase', access: 'ae_callable',
        readiness: 'unverified', provider: 'provider.test',
        output: { fields: [], schemaJson: '{}' },
      },
    } })
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
    expect(JSON.stringify(browseBody)).not.toMatch(/metadataJson|schemaJson|sourceJson/u)
    expect(browseBody).not.toHaveProperty('isDone')
    expect(browseBody).not.toHaveProperty('continueCursor')
    const rich = await backend.query(api.x402DirectoryIndex.browse, { query: '', paginationOpts: { cursor: null, numItems: 8 } })
    if (rich.kind !== 'ok') throw new Error('Rich fixture unavailable')
    const richBytes = new TextEncoder().encode(JSON.stringify({
      schemaVersion: 'api-registry:v3', query: '', kind: rich.kind, coverage: rich.coverage,
      searchMethod: rich.searchMethod, page: rich.page,
      pagination: { limit: 8, hasMore: false }, freshness: browseBody.freshness,
    })).byteLength
    const compactBytes = new TextEncoder().encode(JSON.stringify(browseBody)).byteLength
    expect(compactBytes).toBeLessThan(richBytes)
    expect(compactBytes).toBeLessThanOrEqual(16 * 1024)
    const detail = await handleApiRegistryDetailRequest(new Request(`https://ae.test${browseBody.page[0].detailRef}`))
    expect(detail.status).toBe(200)
    const inspected = await detail.json()
    expect(inspected.access).toBe('ae_callable')
    expect(inspected.item.choice).toMatchObject({ access: 'ae_callable', toolRef: browseBody.page[0].id })
    expect(inspected).not.toHaveProperty('warning')
    expect(inspected.item.entry.metadataJson).toContain('provider.test/tools/')
    expect(inspected.item.entry.output.schemaJson).toBe('{}')
    const searchResponse = await getRegistry({ query: 'Research tool 2' })
    expect(searchResponse.status).toBe(200)
    const searchBody = await searchResponse.json()
    expect(searchBody.kind).toBe('ok')
    expect(searchBody.page.length).toBeGreaterThanOrEqual(1)
    expect(searchBody.page.some((row: { id: string }) => row.id === browseBody.page.find((row: { title: string }) => row.title === 'Research tool 2')?.id)).toBe(true)
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

  it('caps limit at 12 and keeps page continuations generation-bound until exhausted', async () => {
    const { backend, workload } = await setup()
    const generation = 'coinbase-search-paged'
    await seedRefresh(backend, generation)
    const items = Array.from({ length: 13 }, (_, index) => source(index + 1))
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 13, observedAt: 2, runStartedAt: 1, workload, items })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 13, observedAt: 3, runStartedAt: 1, workload, items: [] })

    const first = await getRegistry({ limit: 12 })
    expect(first.status).toBe(200)
    const firstBody = await first.json()
    expect(firstBody.page.length).toBeLessThanOrEqual(12)
    expect(firstBody.pagination.limit).toBe(12)
    expect(firstBody.pagination.hasMore).toBe(true)
    expect(typeof firstBody.pagination.nextCursor).toBe('string')

    const second = await getRegistry({ limit: 12, cursor: firstBody.pagination.nextCursor })
    expect(second.status).toBe(200)
    const secondBody = await second.json()
    expect(firstBody.page.length + secondBody.page.length).toBe(13)
    expect(secondBody.pagination.hasMore).toBe(false)
  })
})
