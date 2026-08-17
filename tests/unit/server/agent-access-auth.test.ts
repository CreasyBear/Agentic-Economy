import { describe, expect, it } from 'vitest'

import { authenticateAgentAccess } from '@/lib/server/agent-access-auth'
import { CUSTOMER_REQUEST_AGENT_SCOPE } from '@/modules/agent-access/contract'

describe('customer Request agent authentication', () => {
  it('creates a stable per-key principal from a scoped Clerk API key', async () => {
    const verifyKeyState = async () => ({
      id: 'ak_123', subject: 'user_123', revoked: false, expired: false, scopes: ['customer_requests:create'],
    })
    await expect(authenticateAgentAccess({
      requiredScope: CUSTOMER_REQUEST_AGENT_SCOPE,
      authenticate: async () => ({
        isAuthenticated: true, tokenType: 'api_key', id: 'ak_123', subject: 'user_123', userId: 'user_123', orgId: null,
        scopes: ['customer_requests:create'],
      }),
      verifyKeyState,
    })).resolves.toEqual({ kind: 'authenticated', principal: {
      principalId: 'clerk_api_key:ak_123', ownerId: 'user_123', credentialId: 'ak_123',
      applicationRef: 'agentic-economy', environment: 'sandbox',
      scopes: ['customer_requests:create'], authorityMode: 'inspect_only',
    } })
  })

  it('keeps API-key ownership on the Clerk user when an organization claim is present', async () => {
    await expect(authenticateAgentAccess({
      requiredScope: CUSTOMER_REQUEST_AGENT_SCOPE,
      authenticate: async () => ({
        isAuthenticated: true,
        tokenType: 'api_key',
        id: 'ak_org_scoped',
        subject: 'user_org_owner',
        userId: 'user_org_owner',
        orgId: 'org_123',
        scopes: ['customer_requests:create'],
      }),
      verifyKeyState: async () => ({
        id: 'ak_org_scoped',
        subject: 'user_org_owner',
        revoked: false,
        expired: false,
        scopes: ['customer_requests:create'],
      }),
    })).resolves.toMatchObject({
      kind: 'authenticated',
      principal: {
        principalId: 'clerk_api_key:ak_org_scoped',
        ownerId: 'user_org_owner',
      },
    })
  })

  it('refuses organization-scoped keys when ownership is user-bound', async () => {
    await expect(authenticateAgentAccess({
      requiredScope: CUSTOMER_REQUEST_AGENT_SCOPE,
      authenticate: async () => ({
        isAuthenticated: true,
        tokenType: 'api_key',
        id: 'ak_org',
        subject: 'org_123',
        userId: null,
        orgId: 'org_123',
        scopes: ['customer_requests:create'],
      }),
    })).resolves.toEqual({
      kind: 'refused',
      status: 403,
      reason: 'scope_required',
    })
  })

  it('fails closed when current key state is revoked, expired, mismatched, or unavailable', async () => {
    const authenticate = async () => ({
      isAuthenticated: true, tokenType: 'api_key' as const, id: 'ak_123', subject: 'user_123',
      userId: 'user_123', orgId: null, scopes: ['customer_requests:create'],
    })
    for (const current of [
      { id: 'ak_123', subject: 'user_123', revoked: true, expired: false, scopes: ['customer_requests:create'] },
      { id: 'ak_123', subject: 'user_123', revoked: false, expired: true, scopes: ['customer_requests:create'] },
      { id: 'ak_other', subject: 'user_123', revoked: false, expired: false, scopes: ['customer_requests:create'] },
      { id: 'ak_123', subject: 'user_other', revoked: false, expired: false, scopes: ['customer_requests:create'] },
    ]) {
      await expect(authenticateAgentAccess({ requiredScope: CUSTOMER_REQUEST_AGENT_SCOPE, authenticate, verifyKeyState: async () => current }))
        .resolves.toEqual({ kind: 'refused', status: 401, reason: 'authentication_required' })
    }
    await expect(authenticateAgentAccess({ requiredScope: CUSTOMER_REQUEST_AGENT_SCOPE, authenticate, verifyKeyState: async () => { throw new Error('unavailable') } }))
      .resolves.toEqual({ kind: 'refused', status: 401, reason: 'authentication_required' })
  })

  it('fails closed when the authentication provider is unavailable', async () => {
    await expect(authenticateAgentAccess({
      authenticate: async () => {
        throw new Error('authentication provider unavailable')
      },
    })).resolves.toEqual({
      kind: 'refused',
      status: 401,
      reason: 'authentication_required',
    })
  })

  it('refuses missing, wrong-type and unscoped credentials', async () => {
    await expect(authenticateAgentAccess({ authenticate: async () => ({
      isAuthenticated: false, tokenType: null, id: null, subject: null, scopes: null,
    }) })).resolves.toMatchObject({ kind: 'refused', status: 401 })
    await expect(authenticateAgentAccess({ authenticate: async () => ({
      isAuthenticated: true, tokenType: 'api_key', id: 'ak_123', subject: 'user_123', scopes: [],
    }) })).resolves.toEqual({ kind: 'refused', status: 403, reason: 'scope_required' })
  })
  it('maps legacy create-only keys to inspect and refuses mode widening', async () => {
    const authenticate = async () => ({
      isAuthenticated: true, tokenType: 'api_key' as const, id: 'ak_123', subject: 'user_123',
      userId: 'user_123', orgId: null, scopes: ['customer_requests:create'],
    })
    await expect(authenticateAgentAccess({ requiredScope: CUSTOMER_REQUEST_AGENT_SCOPE, authenticate, requiredMode: 'approve_each' }))
      .resolves.toEqual({ kind: 'refused', status: 403, reason: 'scope_required' })
    await expect(authenticateAgentAccess({ requiredScope: CUSTOMER_REQUEST_AGENT_SCOPE, authenticate }))
      .resolves.toMatchObject({ kind: 'authenticated', principal: { authorityMode: 'inspect_only' } })
  })
})
