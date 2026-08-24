import { afterEach, describe, expect, it, vi } from 'vitest'

import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { handleMarketOperationCompareRequest } from '@/routes/api.v1.market-operations.compare'
import { handleMarketOperationInspectPlanRequest } from '@/routes/api.v1.market-operations.inspect-plan'
import { handleMarketOperationDetailRequest } from '@/routes/api.v1.market-operations.detail'
import { handleMarketOperationSearchRequest } from '@/routes/api.v1.market-operations.search'
import {
  handleApiRegistryRequest,
  Route as RegistryRoute,
} from '@/routes/api.v1.registry'

const searchResult = {
  kind: 'no_candidates' as const,
  schemaVersion: 'registry-operations:v1' as const,
  query: 'reference lookup',
  appliedFilters: {},
  matchedCount: 0,
  ranking: [],
  navigation: [],
}

const detailResult = {
  kind: 'not_found' as const,
  schemaVersion: 'registry-operations:v1' as const,
  operationRef: 'operation:v1:' + 'f'.repeat(64),
  navigation: [],
}
const compareResult = {
  kind: 'ok' as const,
  schemaVersion: 'registry-operations:v1' as const,
  operations: [],
  facts: [{
    field: 'dataUse' as const,
    values: [{
      operationRef: `operation:v1:${'a'.repeat(64)}`,
      value: [{
        effectId: 'query_release',
        inputPointer: '/query',
        classification: 'public' as const,
        phase: 'execution' as const,
        recipient: 'selected_binding' as const,
        purposes: ['lookup_reference'],
      }],
      source: 'contract' as const,
    }],
  }],
  navigation: [],
}

const inspectPlanResult = {
  kind: 'unavailable' as const,
  schemaVersion: 'registry-operations:v1' as const,
  reason: 'operation_not_found' as const,
  navigation: [],
}

vi.mock('@/modules/capability-supply/operation-source', () => ({
  readCapabilityOperationSearch: vi.fn(async () => searchResult),
  readCapabilityOperationDetail: vi.fn(async () => detailResult),
  readCapabilityOperationCompare: vi.fn(async () => compareResult),
  readCapabilityOperationInspectPlan: vi.fn(async () => inspectPlanResult),
}))

describe('public market operation routes', () => {
  afterEach(() => {
    setHttpRateLimitAdmissionForTests(undefined)
    setPublicSourceTransportForTests(undefined)
    vi.clearAllMocks()
  })

  it('runs anonymous bounded search through the registry action and preserves correlation', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const response = await handleMarketOperationSearchRequest(new Request('https://ae.test/api/v1/market-operations/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ae-request-id': 'route-test' },
      body: JSON.stringify({ query: 'reference lookup', limit: 1 }),
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-ae-request-id')).toBe('route-test')
    await expect(response.json()).resolves.toEqual(searchResult)
  })

  it('rejects malformed detail input as RFC9457 problem details', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const response = await handleMarketOperationDetailRequest(new Request('https://ae.test/api/v1/market-operations/detail', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operationRef: 'historical-or-malformed' }),
    }))

    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    await expect(response.json()).resolves.toMatchObject({ kind: 'INVALID_ARGUMENT', code: 'invalid_body' })
  })
  it('runs anonymous compare through the canonical POST path with exact refs', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const refs = [
      `operation:v1:${'a'.repeat(64)}`,
      `operation:v1:${'b'.repeat(64)}`,
    ]
    const response = await handleMarketOperationCompareRequest(new Request('https://ae.test/api/v1/market-operations/compare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operationRefs: refs }),
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(compareResult)
  })

  it('runs anonymous inspect-plan through the canonical POST path', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const response = await handleMarketOperationInspectPlanRequest(new Request('https://ae.test/api/v1/market-operations/inspect-plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operationRefs: [`operation:v1:${'c'.repeat(64)}`] }),
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(inspectPlanResult)
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
