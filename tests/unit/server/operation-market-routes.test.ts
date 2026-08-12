import { afterEach, describe, expect, it, vi } from 'vitest'

import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { handleMarketOperationCompareRequest } from '@/routes/api.v1.market-operations.compare'
import { handleMarketOperationInspectPlanRequest } from '@/routes/api.v1.market-operations.inspect-plan'
import { handleMarketOperationDetailRequest } from '@/routes/api.v1.market-operations.detail'
import { handleMarketOperationSearchRequest } from '@/routes/api.v1.market-operations.search'

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
  kind: 'unavailable' as const,
  schemaVersion: 'registry-operations:v1' as const,
  reason: 'operation_not_found' as const,
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
