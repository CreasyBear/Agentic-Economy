import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { handleAgentAccountActionPost, handleAgentAccountGet } from '@/lib/server/agent-account-api'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'

beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development'))
afterEach(() => vi.unstubAllEnvs())

const authenticate = async (scopes: readonly string[] = ['market_tools:call']) => ({
  isAuthenticated: true as const,
  tokenType: 'api_key' as const,
  id: 'key_current',
  subject: 'user_owner',
  scopes,
  claims: { aeEnvironment: 'sandbox' },
})

describe('agent account HTTP adapter', () => {
  it.each(['?currency=AUD', '?currency=AUD&currency=USD'])('rejects unsupported or repeated account query parameters: %s', async query => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const verify = vi.fn(async () => await authenticate())
    const result = await handleAgentAccountGet(new Request(`https://ae.example/api/v1/account${query}`), { authenticate: verify })
    expect(result.status).toBe(400)
    await expect(result.json()).resolves.toMatchObject({ kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter' })
    expect(verify).not.toHaveBeenCalled()
  })

  it('returns a correlated unavailable response when service admission is not configured', async () => {
    setHttpRateLimitAdmissionForTests(undefined)
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', undefined)
    const verifyCredential = vi.fn(async () => await authenticate())
    const response = await handleAgentAccountGet(new Request('https://ae.example/api/v1/account', {
      headers: { 'x-ae-request-id': 'corr_account_admission_unavailable' },
    }), { authenticate: verifyCredential })

    expect(response.status).toBe(503)
    expect(response.headers.get('x-ae-request-id')).toBe('corr_account_admission_unavailable')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('retry-after')).toBe('5')
    expect(response.headers.get('www-authenticate')).toBeNull()
    await expect(response.json()).resolves.toMatchObject({
      status: 503, kind: 'UNAVAILABLE', code: 'source_unavailable', retryable: true,
    })
    expect(verifyCredential).not.toHaveBeenCalled()
  })

  it('rate-limits current-account reads before dispatch when admission is denied', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: false, retryAfter: 5_000 }))
    const response = await handleAgentAccountGet(
      new Request('https://ae.example/api/v1/account', {
        headers: { Authorization: 'Bearer hidden-secret' },
      }),
      { authenticate },
    )

    expect(response.status).toBe(429)
  })

  it('projects canonical principal and account identity through the shared action', async () => {
    const resources: string[] = []
    const response = await handleAgentAccountGet(
      new Request('https://ae.example/api/v1/account', {
        headers: { Authorization: 'Bearer hidden-secret' },
      }),
      {
        authenticate,
        resolvePrincipal: async (projection, requiredScopes, consequenceResource) => {
          expect(requiredScopes).toEqual(['market_tools:call'])
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
      scopes: ['market_tools:call'],
      authorityMode: 'read_only',
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
    const resourceMetadata = response.headers.get('www-authenticate')?.match(/resource_metadata="([^"]+)"/u)?.[1]
    expect(resourceMetadata).toBeTruthy()
    const body = await response.json()
    expect(body).toMatchObject({
      kind: 'UNAUTHENTICATED',
      code: 'authentication_required',
      requestId: response.headers.get('x-ae-request-id'),
      next: [],
      ownerHandoff: { actor: 'account_owner', reason: 'connect_required', destination: `${new URL(resourceMetadata!).origin}/agent-access` },
    })
    expect(body.detail).toContain('ae connect')
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

  it('returns retryable UNAVAILABLE when principal resolution fails, not an authentication refusal', async () => {
    const response = await handleAgentAccountGet(
      new Request('https://ae.example/api/v1/account'),
      {
        authenticate,
        resolvePrincipal: async () => { throw new Error('principal store offline') },
      },
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('5')
    expect(response.headers.get('www-authenticate')).toBeNull()
    await expect(response.json()).resolves.toMatchObject({
      status: 503, kind: 'UNAVAILABLE', code: 'source_unavailable', retryable: true,
    })
  })

  it('lets a Provider credential inspect its own identity without granting buyer money access', async () => {
    const response = await handleAgentAccountGet(
      new Request('https://ae.example/api/v1/account', {
        headers: { Authorization: 'Bearer hidden-provider-secret' },
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
      authorityMode: 'spending_policy',
    })
  })

  it('dispatches exact balance reads and preserves owner-only funding as a continuation', async () => {
    const balance = vi.fn().mockResolvedValue({
      kind: 'available',
      principalRef: 'prn_00000000000040008000000000000043',
      accountRef: 'acc_00000000000040008000000000000043',
      balance: { currency: 'AUD', units: '25000000', exponent: 6 },
      accountState: 'active',
      version: 3,
      updatedAt: 1_700_000_000_000,
      funding: { kind: 'agent_funding_handoff', next: { action: 'funding.handoff.config', args: {}, authority: 'agent_key' }, },
    })
    const response = await handleAgentAccountActionPost(
      new Request('https://ae.example/api/v1/account/balance', {
        method: 'POST',
        headers: { Authorization: 'Bearer hidden-secret' },
        body: JSON.stringify({ currency: 'AUD' }),
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
      balance: { currency: 'AUD', units: '25000000', exponent: 6 },
      funding: { kind: 'agent_funding_handoff', next: { action: 'funding.handoff.config', args: {}, authority: 'agent_key' }, },
    })
    expect(balance).toHaveBeenCalledWith(expect.objectContaining({ input: { currency: 'AUD' } }))
  })

  it('refuses Provider-only credentials from buyer balance reads', async () => {
    const balance = vi.fn()
    const response = await handleAgentAccountActionPost(
      new Request('https://ae.example/api/v1/account/balance', {
        method: 'POST',
        body: JSON.stringify({ currency: 'AUD' }),
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
