import { describe, expect, it } from 'vitest'

import { handleAgentCustomerRequestReleaseGet } from '@/lib/server/customer-request-release-readback-api'

const productionEnvironment = {
  VERCEL: '1',
  VERCEL_ENV: 'production',
  VERCEL_TARGET_ENV: 'production',
  VERCEL_DEPLOYMENT_ID: 'dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3',
  VERCEL_URL: 'agentic-economy-abc123.vercel.app',
  VERCEL_PROJECT_PRODUCTION_URL: 'agentic-economy-phi.vercel.app',
  VERCEL_GIT_PROVIDER: 'github',
  VERCEL_GIT_REPO_OWNER: 'CreasyBear',
  VERCEL_GIT_REPO_SLUG: 'Agentic-Economy',
  VERCEL_GIT_COMMIT_SHA: '50fa5ed886dbf5eddbfc1397704b12fc52469abe',
} as const

describe('Customer Request release readback API', () => {
  it('requires the same scoped API-key identity as the agent Request entrypoint', async () => {
    const unauthenticated = await handleAgentCustomerRequestReleaseGet({
      authenticate: async () => ({ isAuthenticated: false, tokenType: null, id: null, subject: null, scopes: null }),
      env: productionEnvironment,
    })
    expect(unauthenticated.status).toBe(401)
    expect(unauthenticated.headers.get('Cache-Control')).toBe('no-store')
    expect(unauthenticated.headers.get('Vary')).toBe('Authorization')
    expect(unauthenticated.headers.get('WWW-Authenticate')).toContain('Bearer resource_metadata=')
    await expect(unauthenticated.json()).resolves.toEqual({
      type: 'about:blank', title: 'Unauthenticated', status: 401,
      kind: 'UNAUTHENTICATED', code: 'authentication_required', detail: 'authentication_required',
    })

    const unscoped = await handleAgentCustomerRequestReleaseGet({
      authenticate: async () => ({
        isAuthenticated: true, tokenType: 'api_key', id: 'ak_123', subject: 'user_123', scopes: [],
      }),
      env: productionEnvironment,
    })
    expect(unscoped.status).toBe(403)
    expect(unscoped.headers.get('Vary')).toBe('Authorization')
    expect(unscoped.headers.get('WWW-Authenticate')).toContain('Bearer resource_metadata=')
    await expect(unscoped.json()).resolves.toEqual({
      type: 'about:blank', title: 'Permission denied', status: 403,
      kind: 'PERMISSION_DENIED', code: 'scope_required', detail: 'scope_required',
    })
  })

  it('returns no-store release evidence to a scoped agent', async () => {
    const response = await handleAgentCustomerRequestReleaseGet({
      authenticate: async () => ({
        isAuthenticated: true,
        tokenType: 'api_key',
        id: 'ak_123',
        subject: 'user_123',
        scopes: ['customer_requests:create'],
      }),
      env: productionEnvironment,
      observedAt: () => Date.parse('2026-07-14T04:05:06.000Z'),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toMatchObject({
      kind: 'release_readback',
      source: { revision: productionEnvironment.VERCEL_GIT_COMMIT_SHA },
      requestEntrypoint: { path: '/api/v1/requests' },
    })
  })

  it('returns 503 instead of manufacturing evidence outside authoritative production metadata', async () => {
    const response = await handleAgentCustomerRequestReleaseGet({
      authenticate: async () => ({
        isAuthenticated: true,
        tokenType: 'api_key',
        id: 'ak_123',
        subject: 'user_123',
        scopes: ['customer_requests:create'],
      }),
      env: { ...productionEnvironment, VERCEL_GIT_COMMIT_SHA: undefined, AE_RELEASE_SOURCE_REVISION: productionEnvironment.VERCEL_GIT_COMMIT_SHA },
    })
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      type: 'about:blank', title: 'Unavailable', status: 503,
      kind: 'UNAVAILABLE', code: 'authoritative_release_identity_unavailable',
      detail: 'Authoritative release identity unavailable.',
    })
  })
})
