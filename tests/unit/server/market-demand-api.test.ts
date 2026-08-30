import { describe, expect, it, vi } from 'vitest'

import { handleMarketRequestPost } from '@/lib/server/market-demand-api'

const authenticate = async (scopes: readonly string[] = ['market_operations:invoke']) => ({
  isAuthenticated: true as const,
  tokenType: 'api_key' as const,
  id: 'key_current',
  subject: 'user_owner',
  scopes,
})

const principal = {
  principalId: 'prn_00000000000040008000000000000071',
  ownerId: 'acc_00000000000040008000000000000071',
}

describe('private market demand HTTP adapter', () => {
  it('dispatches an authenticated idempotent request without leaking bearer material', async () => {
    const create = vi.fn().mockResolvedValue({
      kind: 'recorded',
      requestRef: `market-request:v1:${'a'.repeat(64)}`,
      query: 'translate a handwritten invoice',
      createdAt: 1_700_000_000_000,
    })
    const response = await handleMarketRequestPost(
      new Request('https://ae.example/api/v1/market-requests', {
        method: 'POST',
        headers: { Authorization: 'Bearer hidden-secret' },
        body: JSON.stringify({
          query: 'translate a handwritten invoice',
          idempotencyKey: 'missing-job:one',
        }),
      }),
      'create',
      {
        authenticate,
        resolvePrincipal: async (projection, requiredScopes, consequenceResource) => {
          expect(requiredScopes).toEqual(['market_operations:invoke'])
          expect(consequenceResource).toBe('surface:http:market-request-create')
          return { ...projection, ...principal }
        },
        marketDemandService: { create, list: vi.fn(), status: vi.fn() },
      },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-ae-request-id')).toBeTruthy()
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      input: {
        query: 'translate a handwritten invoice',
        idempotencyKey: 'missing-job:one',
      },
      principal: expect.objectContaining(principal),
    }))
    const body = await response.json()
    expect(body).toMatchObject({ kind: 'recorded', query: 'translate a handwritten invoice' })
    expect(JSON.stringify(body)).not.toContain('hidden-secret')
    expect(JSON.stringify(body)).not.toContain('missing-job:one')
  })

  it('fails before the service when buyer scope is absent', async () => {
    const create = vi.fn()
    const response = await handleMarketRequestPost(
      new Request('https://ae.example/api/v1/market-requests', {
        method: 'POST',
        body: JSON.stringify({ query: 'missing job', idempotencyKey: 'one' }),
      }),
      'create',
      {
        authenticate: async () => await authenticate(['market_supply:manage']),
        marketDemandService: { create, list: vi.fn(), status: vi.fn() },
      },
    )

    expect(response.status).toBe(403)
    expect(create).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      kind: 'PERMISSION_DENIED',
      code: 'scope_required',
    })
  })

  it('rejects oversized, malformed, and schema-invalid bodies without persistence', async () => {
    const create = vi.fn()
    const service = { create, list: vi.fn(), status: vi.fn() }
    const malformed = await handleMarketRequestPost(
      new Request('https://ae.example/api/v1/market-requests', {
        method: 'POST', headers: { Authorization: 'Bearer test' }, body: '{',
      }),
      'create',
      {
        authenticate,
        resolvePrincipal: async (projection) => ({ ...projection, ...principal }),
        marketDemandService: service,
      },
    )
    expect(malformed.status).toBe(400)

    const invalid = await handleMarketRequestPost(
      new Request('https://ae.example/api/v1/market-requests', {
        method: 'POST',
        headers: { Authorization: 'Bearer test' },
        body: JSON.stringify({ query: '', idempotencyKey: 'one' }),
      }),
      'create',
      {
        authenticate,
        resolvePrincipal: async (projection) => ({ ...projection, ...principal }),
        marketDemandService: service,
      },
    )
    expect(invalid.status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })
})
