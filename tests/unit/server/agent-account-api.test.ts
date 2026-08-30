import { describe, expect, it, vi } from 'vitest'

import { handleAgentAccountActionPost, handleAgentAccountGet } from '@/lib/server/agent-account-api'

const authenticate = async (scopes: readonly string[] = ['market_operations:invoke']) => ({
  isAuthenticated: true as const,
  tokenType: 'api_key' as const,
  id: 'key_current',
  subject: 'user_owner',
  scopes,
})

describe('agent account HTTP adapter', () => {
  it('projects canonical principal and account identity through the shared action', async () => {
    const resources: string[] = []
    const response = await handleAgentAccountGet(
      new Request('https://ae.example/api/v1/account', {
        headers: { Authorization: 'Bearer hidden-secret' },
      }),
      {
        authenticate,
        resolvePrincipal: async (projection, requiredScopes, consequenceResource) => {
          expect(requiredScopes).toEqual(['market_operations:invoke'])
          resources.push(consequenceResource)
          return {
            ...projection,
            principalId: 'prn_00000000000040008000000000000043',
            ownerId: 'acc_00000000000040008000000000000043',
          }
        },
      },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-ae-request-id')).toBeTruthy()
    expect(resources).toEqual(['surface:http:account-self'])
    const body = await response.json()
    expect(body).toEqual({
      kind: 'authenticated',
      principalRef: 'prn_00000000000040008000000000000043',
      accountRef: 'acc_00000000000040008000000000000043',
      credentialId: 'key_current',
      applicationRef: 'agentic-economy',
      environment: 'sandbox',
      scopes: ['market_operations:invoke'],
      authorityMode: 'inspect_only',
    })
    expect(JSON.stringify(body)).not.toContain('hidden-secret')
  })

  it('returns a canonical bearer challenge when no current agent exists', async () => {
    const response = await handleAgentAccountGet(
      new Request('https://ae.example/api/v1/account'),
      {
        authenticate: async () => ({
          isAuthenticated: false,
          tokenType: null,
          id: null,
          subject: null,
          scopes: null,
        }),
      },
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    expect(response.headers.get('www-authenticate')).toContain('Bearer')
    await expect(response.json()).resolves.toMatchObject({
      kind: 'UNAUTHENTICATED',
      code: 'authentication_required',
    })
  })

  it('refuses a credential without the account inspection scope', async () => {
    const response = await handleAgentAccountGet(
      new Request('https://ae.example/api/v1/account'),
      { authenticate: async () => await authenticate([]) },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      kind: 'PERMISSION_DENIED',
      code: 'scope_required',
    })
  })

  it('lets a supplier credential inspect its own identity without granting buyer money access', async () => {
    const response = await handleAgentAccountGet(
      new Request('https://ae.example/api/v1/account', {
        headers: { Authorization: 'Bearer hidden-supplier-secret' },
      }),
      {
        authenticate: async () => await authenticate(['market_supply:manage']),
        resolvePrincipal: async (projection, requiredScopes) => {
          expect(requiredScopes).toEqual(['market_supply:manage'])
          return {
            ...projection,
            principalId: 'prn_00000000000040008000000000000045',
            ownerId: 'acc_00000000000040008000000000000045',
          }
        },
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      kind: 'authenticated',
      scopes: ['market_supply:manage'],
      authorityMode: 'bounded_mandate',
    })
  })

  it('dispatches exact balance reads and preserves owner-only funding as a continuation', async () => {
    const balance = vi.fn().mockResolvedValue({
      kind: 'available',
      principalRef: 'prn_00000000000040008000000000000043',
      accountRef: 'acc_00000000000040008000000000000043',
      balance: { currency: 'USD', units: '2500', exponent: 2 },
      recoveryDue: { currency: 'USD', units: '0', exponent: 2 },
      accountState: 'active',
      version: 3,
      updatedAt: 1_700_000_000_000,
      funding: { kind: 'owner_browser_required', path: '/owner/credit', anchor: 'fund' },
    })
    const response = await handleAgentAccountActionPost(
      new Request('https://ae.example/api/v1/account/balance', {
        method: 'POST',
        headers: { Authorization: 'Bearer hidden-secret' },
        body: JSON.stringify({ currency: 'USD' }),
      }),
      'balance',
      {
        authenticate,
        resolvePrincipal: async (projection) => ({
          ...projection,
          principalId: 'prn_00000000000040008000000000000043',
          ownerId: 'acc_00000000000040008000000000000043',
        }),
        accountManagementService: { balance, activity: vi.fn() },
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      kind: 'available',
      balance: { currency: 'USD', units: '2500', exponent: 2 },
      funding: { kind: 'owner_browser_required', path: '/owner/credit', anchor: 'fund' },
    })
    expect(balance).toHaveBeenCalledWith(expect.objectContaining({ input: { currency: 'USD' } }))
  })

  it('refuses supplier-only credentials from buyer balance reads', async () => {
    const balance = vi.fn()
    const response = await handleAgentAccountActionPost(
      new Request('https://ae.example/api/v1/account/balance', {
        method: 'POST',
        body: JSON.stringify({ currency: 'USD' }),
      }),
      'balance',
      {
        authenticate: async () => await authenticate(['market_supply:manage']),
        accountManagementService: { balance, activity: vi.fn() },
      },
    )

    expect(response.status).toBe(403)
    expect(balance).not.toHaveBeenCalled()
  })
})
