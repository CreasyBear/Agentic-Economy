import { describe, expect, it } from 'vitest'

import { authenticateCustomerRequestAgent } from '@/lib/server/customer-request-agent-auth'

describe('customer Request agent authentication', () => {
  it('creates a stable per-key principal from a scoped Clerk API key', async () => {
    await expect(authenticateCustomerRequestAgent({ authenticate: async () => ({
      isAuthenticated: true, tokenType: 'api_key', id: 'ak_123', subject: 'user_123', userId: 'user_123', orgId: null,
      scopes: ['customer_requests:create'],
    }) })).resolves.toEqual({ kind: 'authenticated', principal: {
      principalId: 'clerk_api_key:ak_123', ownerId: 'user_123', credentialId: 'ak_123', scopes: ['customer_requests:create'],
    } })
  })

  it('refuses missing, wrong-type and unscoped credentials', async () => {
    await expect(authenticateCustomerRequestAgent({ authenticate: async () => ({
      isAuthenticated: false, tokenType: null, id: null, subject: null, scopes: null,
    }) })).resolves.toMatchObject({ kind: 'refused', status: 401 })
    await expect(authenticateCustomerRequestAgent({ authenticate: async () => ({
      isAuthenticated: true, tokenType: 'api_key', id: 'ak_123', subject: 'user_123', scopes: [],
    }) })).resolves.toEqual({ kind: 'refused', status: 403, reason: 'scope_required' })
  })
})
