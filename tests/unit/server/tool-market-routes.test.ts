import { getFunctionName } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { handleMarketToolCompareRequest } from '@/routes/api.v1.market-tools.compare'
import { handleMarketToolDescribeRequest } from '@/routes/api.v1.market-tools.describe'
import { handleMarketToolListRequest } from '@/routes/api.v1.market-tools.list'
import { handleMarketToolSearchRequest } from '@/routes/api.v1.market-tools.search'
import {
  handleApiRegistryRequest,
  Route as RegistryRoute,
} from '@/routes/api.v1.registry'
import { encodeOpaqueCursor } from '@/modules/registry/opaque-cursor'

const searchResult = {
  kind: 'no_candidates' as const,
  schemaVersion: 'registry-tools:v3' as const,
  query: 'reference lookup',
  appliedFilters: {},
  matchedCount: 0,
  ranking: [],
  navigation: [],
}

const detailResult = {
  kind: 'not_found' as const,
  schemaVersion: 'registry-tools:v3' as const,
  toolRef: 'operation:v1:' + 'f'.repeat(64),
  navigation: [],
}
const compareResult = {
  kind: 'unavailable' as const,
  schemaVersion: 'registry-tools:v3' as const,
  reason: 'tool_not_found' as const,
  navigation: [],
}

vi.mock('@/modules/capability-supply/tool-source', () => ({
  readCapabilityToolSearch: vi.fn(async () => searchResult),
  readCapabilityToolDetail: vi.fn(async () => detailResult),
  readCapabilityToolCompare: vi.fn(async () => compareResult),
}))

describe('public market Tool routes', () => {
  afterEach(() => {
    setHttpRateLimitAdmissionForTests(undefined)
    setPublicSourceTransportForTests(undefined)
    vi.clearAllMocks()
  })

  it('runs anonymous bounded search through the registry action and preserves correlation', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const response = await handleMarketToolSearchRequest(new Request('https://ae.test/api/v1/market-tools/search', {
      method: 'POST',
      headers: { 'content-type': 'Application/JSON;charset=UTF-8', 'x-ae-request-id': 'route-test' },
      body: JSON.stringify({ query: 'reference lookup', limit: 1 }),
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-ae-request-id')).toBe('route-test')
    await expect(response.json()).resolves.toEqual({
      kind: 'no_candidates',
      schemaVersion: 'registry-tools:v3',
      query: 'reference lookup',
      count: 0,
      items: [],
      note: 'No Tools match this search.',
      pagination: { limit: 10, hasMore: false },
      // No Convex transport is stubbed for this route in this suite, so the
      // supply-projection freshness lookup degrades to 'absent' rather than
      // failing the search itself (review issue 4A / C16).
      freshness: { source: 'supply_projection', state: 'absent', staleAfterMs: 3 * 60 * 60 * 1000 },
    })
  })

  it('reports supply_projection freshness from the latest reconcile completion for list and search', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const completedAt = Date.now() - 5 * 60 * 1000
    const query = vi.fn(async (ref: unknown) => {
      const name = getFunctionName(ref as never)
      if (name === 'capabilitySupplyProjection:latestReconcileBusinessSupplyProjectionsCompletion') return completedAt
      throw new Error(`unexpected query ${name}`)
    })
    setPublicSourceTransportForTests({ query, mutation: vi.fn(), action: vi.fn() } as never)

    const listResponse = await handleMarketToolListRequest(new Request('https://ae.test/api/v1/market-tools/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 1 }),
    }))
    const listBody = await listResponse.json()
    expect(listBody.freshness).toEqual({
      source: 'supply_projection',
      state: 'fresh',
      completedAt,
      staleAfterMs: 3 * 60 * 60 * 1000,
    })

    const searchResponse = await handleMarketToolSearchRequest(new Request('https://ae.test/api/v1/market-tools/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'reference lookup', limit: 1 }),
    }))
    const searchBody = await searchResponse.json()
    expect(searchBody.freshness).toEqual({
      source: 'supply_projection',
      state: 'fresh',
      completedAt,
      staleAfterMs: 3 * 60 * 60 * 1000,
    })
  })

  it('rejects malformed describe input as RFC9457 problem details', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const response = await handleMarketToolDescribeRequest(new Request('https://ae.test/api/v1/market-tools/describe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ toolRef: 'historical-or-malformed' }),
    }))

    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    await expect(response.json()).resolves.toMatchObject({ kind: 'INVALID_ARGUMENT', code: 'invalid_body' })
  })

  it.each([
    ['list', handleMarketToolListRequest],
    ['search', handleMarketToolSearchRequest],
    ['describe', handleMarketToolDescribeRequest],
    ['compare', handleMarketToolCompareRequest],
  ])('returns local input errors for %s even when remote admission is unavailable', async (route, handler) => {
    const admit = vi.fn(async () => { throw new Error('rate limit source unavailable') })
    setHttpRateLimitAdmissionForTests(admit)
    const endpoint = `https://ae.test/api/v1/market-tools/${route}`

    for (const request of [
      new Request(endpoint, { method: 'POST', body: '{}' }),
      new Request(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;note=application/json' },
        body: '{}',
      }),
      new Request(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/jsonp' },
        body: '{}',
      }),
    ]) {
      const unsupported = await handler(request)
      expect(unsupported.status).toBe(415)
      await expect(unsupported.json()).resolves.toMatchObject({
        kind: 'UNSUPPORTED_MEDIA_TYPE',
        code: 'invalid_content_type',
      })
    }

    const malformed = await handler(new Request(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    }))
    expect(malformed.status).toBe(400)
    await expect(malformed.json()).resolves.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_json',
    })
    expect(admit).not.toHaveBeenCalled()
  })
  it('runs anonymous compare through the canonical POST path with exact refs', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const refs = [
      `operation:v1:${'a'.repeat(64)}`,
      `operation:v1:${'b'.repeat(64)}`,
    ]
    const response = await handleMarketToolCompareRequest(new Request('https://ae.test/api/v1/market-tools/compare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ toolRefs: refs }),
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      kind: 'unavailable',
      schemaVersion: 'registry-tools:v3',
      reason: 'tool_not_found',
    })
  })
})

describe('public external registry route', () => {
  afterEach(() => {
    setHttpRateLimitAdmissionForTests(undefined)
    setPublicSourceTransportForTests(undefined)
    vi.clearAllMocks()
  })

  const registryEntry = (index: number) => ({
    entry: {
      resource: `https://provider.test/tools/${index}`,
      title: `Companies search ${index}`,
      description: 'Search company data.',
      protocol: 'http',
      provider: 'Treg provider',
      metadataJson: '{}',
      prices: [],
    },
    category: 'data',
    categorySource: 'provider_declared' as const,
    observedAt: index,
    sourceDigest: `digest-${index}`,
  })

  it('runs bounded GET and HEAD reads through the public Convex query', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const directoryCompletedAt = Date.now() - 5 * 60 * 1000
    const query = vi.fn(async (ref: unknown) => {
      if (getFunctionName(ref as never) === 'x402DirectoryIndex:status') {
        return {
          kind: 'ready' as const,
          coverage: { generation: 'mixed-generation', completedAt: directoryCompletedAt },
          refreshState: 'complete' as const,
        }
      }
      return {
        kind: 'ok' as const,
        coverage: { source: 'coinbase' as const, generation: 'mixed-generation', indexedTotal: 1, reportedTotal: 1, reportedTotalAtStart: 1, sourceChangedDuringScan: false, duplicateObservations: 0, pagesFetched: 1, startedAt: 1, completedAt: 1, completeness: 'completed_observed_scan' as const },
        searchMethod: 'native_full_text' as const,
        page: [registryEntry(1)],
        isDone: true,
        continueCursor: '',
      }
    })
    setPublicSourceTransportForTests({
      query,
      mutation: vi.fn(),
      action: vi.fn(),
    } as never)

    const get = await handleApiRegistryRequest(new Request(
      'https://ae.test/api/v1/registry?query=companies&limit=12',
      { headers: { 'x-ae-request-id': 'registry-route-test' } },
    ))
    expect(get.status).toBe(200)
    expect(get.headers.get('x-ae-request-id')).toBe('registry-route-test')
    expect(get.headers.get('cache-control')).toBe(
      'public, max-age=60, stale-while-revalidate=240',
    )
    const body = await get.json()
    expect(body).toMatchObject({
      schemaVersion: 'api-registry:v3',
      query: 'companies',
      kind: 'ok',
      pagination: { limit: 12, hasMore: false },
    })
    expect(body.freshness).toEqual({
      source: 'x402_directory',
      state: 'fresh',
      completedAt: directoryCompletedAt,
      staleAfterMs: 36 * 60 * 60 * 1000,
    })
    // Verify response does not contain internal fields
    expect(body).not.toHaveProperty('access')
    expect(body).not.toHaveProperty('isDone')
    expect(body).not.toHaveProperty('continueCursor')
    expect(body).not.toHaveProperty('splitCursor')
    expect(body).not.toHaveProperty('pageStatus')
    expect(query).toHaveBeenCalledWith(
      expect.anything(),
      { query: 'companies', paginationOpts: { cursor: null, numItems: 12 } },
    )

    const head = await handleApiRegistryRequest(
      new Request('https://ae.test/api/v1/registry', { method: 'HEAD' }),
      true,
    )
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  it('reports a maximum limit of 24 as at most 12 native rows with hasMore true', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const page = Array.from({ length: 12 }, (_, index) => registryEntry(index))
    const query = vi.fn(async () => ({
      kind: 'ok' as const,
      coverage: { source: 'coinbase' as const, generation: 'g1', indexedTotal: 40, reportedTotal: 40, reportedTotalAtStart: 40, sourceChangedDuringScan: false, duplicateObservations: 0, pagesFetched: 1, startedAt: 1, completedAt: 1, completeness: 'completed_observed_scan' as const },
      searchMethod: 'native_index' as const,
      page,
      isDone: false,
      continueCursor: 'opaque-cursor-1',
    }))
    setPublicSourceTransportForTests({ query, mutation: vi.fn(), action: vi.fn() } as never)

    const response = await handleApiRegistryRequest(
      new Request('https://ae.test/api/v1/registry?limit=24'),
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.page).toHaveLength(12)
    expect(body.pagination).toEqual({
      limit: 24,
      // The registry route wraps the engine's raw `continueCursor` in the
      // opaque, generation-bound envelope (AIP-158) before returning it.
      nextCursor: encodeOpaqueCursor({ kind: 'registry', scope: 'g1', cursor: 'opaque-cursor-1' }),
      hasMore: true,
    })
    expect(query).toHaveBeenCalledWith(
      expect.anything(),
      { query: '', paginationOpts: { cursor: null, numItems: 24 } },
    )
  })

  it.each([
    ['query_invalid', 400, 'INVALID_ARGUMENT', 'invalid_query_parameter'],
    ['query_sort_unsupported', 400, 'INVALID_ARGUMENT', 'invalid_query_parameter'],
    ['index_unavailable', 503, 'UNAVAILABLE', 'registry_unavailable'],
    ['analytics_building', 503, 'UNAVAILABLE', 'registry_unavailable'],
  ])('maps browse unavailable reason %s to %i %s/%s', async (reason, status, kind, code) => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const query = vi.fn(async () => ({ kind: 'unavailable' as const, reason }))
    setPublicSourceTransportForTests({ query, mutation: vi.fn(), action: vi.fn() } as never)

    const response = await handleApiRegistryRequest(
      new Request('https://ae.test/api/v1/registry'),
    )
    expect(response.status).toBe(status)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    if (status === 503) expect(response.headers.get('retry-after')).toBe('30')
    await expect(response.json()).resolves.toMatchObject({ kind, code })
  })

  it('rejects access query parameter as invalid_query_parameter', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const query = vi.fn(async () => ({ kind: 'unavailable' as const, reason: 'index_unavailable' }))
    setPublicSourceTransportForTests({
      query,
      mutation: vi.fn(),
      action: vi.fn(),
    } as never)

    const withAccess = await handleApiRegistryRequest(
      new Request('https://ae.test/api/v1/registry?access=provider_account'),
    )
    expect(withAccess.status).toBe(400)
    expect(withAccess.headers.get('content-type')).toContain('application/problem+json')
    await expect(withAccess.json()).resolves.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_query_parameter',
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('returns bounded validation and method refusal', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const query = vi.fn(async () => ({ kind: 'unavailable' as const, reason: 'index_unavailable' }))
    setPublicSourceTransportForTests({
      query,
      mutation: vi.fn(),
      action: vi.fn(),
    } as never)

    const malformed = await handleApiRegistryRequest(
      new Request('https://ae.test/api/v1/registry?limit=51'),
    )
    expect(malformed.status).toBe(400)
    expect(malformed.headers.get('content-type')).toContain('application/problem+json')
    await expect(malformed.json()).resolves.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_query_parameter',
    })
    expect(query).not.toHaveBeenCalled()

    const handlers = RegistryRoute.options.server?.handlers
    const post = typeof handlers === 'object' && handlers !== null && 'POST' in handlers
      ? handlers.POST
      : undefined
    if (typeof post !== 'function') throw new Error('POST handler missing')
    const refused = await post({ request: new Request('https://ae.test/api/v1/registry', {
      method: 'POST',
    }) } as never)
    if (!(refused instanceof Response)) throw new Error('POST response missing')
    expect(refused.status).toBe(405)
    expect(refused.headers.get('allow')).toBe('GET, HEAD')

    const unavailable = await handleApiRegistryRequest(
      new Request('https://ae.test/api/v1/registry'),
    )
    expect(unavailable.status).toBe(503)
    await expect(unavailable.json()).resolves.toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'registry_unavailable',
    })
  })
})
