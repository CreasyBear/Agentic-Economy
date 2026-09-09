import { afterEach, describe, expect, it, vi } from 'vitest'

import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { handleDurableSearchBusinessesRequest } from '@/routes/api.businesses.search'

describe('GET /api/businesses/search unsupported parameter guard', () => {
  afterEach(() => {
    setHttpRateLimitAdmissionForTests(undefined)
    setPublicSourceTransportForTests(undefined)
    vi.clearAllMocks()
  })

  it('rejects the unsupported "query" parameter with 400 instead of silently ignoring it', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const query = vi.fn()
    setPublicSourceTransportForTests({
      query,
      mutation: vi.fn(async () => ({ ok: true })),
      action: vi.fn(),
    } as never)

    const response = await handleDurableSearchBusinessesRequest(
      new Request('http://ae.test/api/businesses/search?query=sandbox'),
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body).toMatchObject({
      status: 400,
      kind: 'FAILED_PRECONDITION',
      code: 'unsupported_query_parameter',
    })
    expect(body.detail).toContain("'q'")
    expect(body.detail).toContain('query')
    expect(body.unsupported).toEqual(['query'])
    // The underlying search must never run against a discarded query term.
    expect(query).not.toHaveBeenCalled()
  })

  it('accepts the documented "q" parameter and the rest of the supported search params', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const query = vi.fn(async () => ({
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v2',
      query: 'sandbox',
      items: [],
      pagination: { limit: 20, total: 0, hasMore: false },
    }))
    setPublicSourceTransportForTests({
      query,
      mutation: vi.fn(async () => ({ ok: true })),
      action: vi.fn(),
    } as never)

    const response = await handleDurableSearchBusinessesRequest(
      new Request('http://ae.test/api/businesses/search?q=sandbox&limit=5&cursor=abc&mode=near_me&location=Perth&has_price=true'),
    )

    expect(response.status).toBe(200)
    expect(query).toHaveBeenCalledTimes(1)
  })
})
