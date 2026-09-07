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

const searchResult = {
  kind: 'no_candidates' as const,
  schemaVersion: 'registry-tools:v1' as const,
  query: 'reference lookup',
  appliedFilters: {},
  matchedCount: 0,
  ranking: [],
  navigation: [],
}

const detailResult = {
  kind: 'not_found' as const,
  schemaVersion: 'registry-tools:v1' as const,
  toolRef: 'operation:v1:' + 'f'.repeat(64),
  navigation: [],
}
const compareResult = {
  kind: 'unavailable' as const,
  schemaVersion: 'registry-tools:v1' as const,
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
      headers: { 'content-type': 'application/json', 'x-ae-request-id': 'route-test' },
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
      note: 'No operational Tools matched this search.',
      pagination: { limit: 10, hasMore: false },
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

    const unsupported = await handler(new Request(endpoint, { method: 'POST', body: '{}' }))
    expect(unsupported.status).toBe(415)
    await expect(unsupported.json()).resolves.toMatchObject({
      kind: 'UNSUPPORTED_MEDIA_TYPE',
      code: 'invalid_content_type',
    })

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
      schemaVersion: 'registry-tools:v2',
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

  it('runs bounded GET and HEAD reads through the public Convex query', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const query = vi.fn(async () => ({
      kind: 'ok' as const,
      generation: 'mixed-generation',
      coverage: { entries: 2, completedAt: 1 },
      page: [{
        documentId: `registry:${'a'.repeat(64)}`,
        sourceUrl: 'https://treg.to/catalog/endpoints/companies.search',
        name: 'Companies search',
        summary: 'Search company data.',
        provider: 'Treg provider',
        category: 'Data',
        tags: ['data'],
        networks: [],
        access: 'provider_account' as const,
        authority: 'registry_metadata_only' as const,
      }],
      isDone: true,
      continueCursor: '',
    }))
    setPublicSourceTransportForTests({
      query,
      mutation: vi.fn(),
      action: vi.fn(),
    } as never)

    const get = await handleApiRegistryRequest(new Request(
      'https://ae.test/api/v1/registry?query=companies&access=provider_account&limit=12',
      { headers: { 'x-ae-request-id': 'registry-route-test' } },
    ))
    expect(get.status).toBe(200)
    expect(get.headers.get('x-ae-request-id')).toBe('registry-route-test')
    expect(get.headers.get('cache-control')).toBe(
      'public, max-age=60, stale-while-revalidate=240',
    )
    await expect(get.json()).resolves.toMatchObject({
      schemaVersion: 'api-registry:v1',
      query: 'companies',
      access: 'provider_account',
      kind: 'ok',
    })
    expect(query).toHaveBeenCalledWith(
      expect.anything(),
      { query: 'companies', access: 'provider_account', limit: 12, cursor: null },
    )

    const head = await handleApiRegistryRequest(
      new Request('https://ae.test/api/v1/registry', { method: 'HEAD' }),
      true,
    )
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  it('returns bounded validation, method refusal, and unavailable projection', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const query = vi.fn(async () => ({ kind: 'unavailable' as const }))
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
      code: 'invalid_registry_query',
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
    expect(unavailable.status).toBe(200)
    await expect(unavailable.json()).resolves.toMatchObject({
      schemaVersion: 'api-registry:v1',
      kind: 'unavailable',
    })
  })
})
