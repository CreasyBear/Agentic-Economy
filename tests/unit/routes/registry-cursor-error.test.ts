import { afterEach, describe, expect, it, vi } from 'vitest'

import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { handleApiRegistryRequest } from '@/routes/api.v1.registry'

describe('GET /api/v1/registry cursor handling', () => {
  afterEach(() => {
    setHttpRateLimitAdmissionForTests(undefined)
    setPublicSourceTransportForTests(undefined)
    vi.clearAllMocks()
  })

  it('returns 400 invalid_cursor instead of 503 when the Convex query rejects the cursor', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const query = vi.fn(async () => {
      throw new Error('InvalidCursor: the cursor is invalid or expired')
    })
    setPublicSourceTransportForTests({
      query,
      mutation: vi.fn(async () => ({ ok: true })),
      action: vi.fn(),
    } as never)

    const response = await handleApiRegistryRequest(
      new Request('http://ae.test/api/v1/registry?query=weather&cursor=not-a-real-cursor'),
    )

    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    const body = await response.json()
    expect(body).toMatchObject({
      status: 400,
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_cursor',
      detail: 'The supplied pagination cursor is invalid or expired.',
    })
  })

  it('still returns 503 registry_unavailable for a genuine backend failure', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const query = vi.fn(async () => {
      throw new Error('boom: backend is down')
    })
    setPublicSourceTransportForTests({
      query,
      mutation: vi.fn(async () => ({ ok: true })),
      action: vi.fn(),
    } as never)

    const response = await handleApiRegistryRequest(
      new Request('http://ae.test/api/v1/registry?query=weather'),
    )

    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toMatchObject({ status: 503, kind: 'UNAVAILABLE', code: 'registry_unavailable' })
  })
})
