import { describe, expect, it } from 'vitest'

import { authenticateAgentAccess } from '@/lib/server/agent-access-auth'
import {
  CUSTOMER_REQUEST_AGENT_SCOPE,
  CUSTOMER_REQUEST_APPROVE_EACH_SCOPE,
  CUSTOMER_REQUEST_INSPECT_ONLY_SCOPE,
  MARKET_OPERATIONS_INVOKE_SCOPE,
} from '@/modules/agent-access/contract'

const liveScopes = [MARKET_OPERATIONS_INVOKE_SCOPE, CUSTOMER_REQUEST_INSPECT_ONLY_SCOPE]

describe('agent access authentication', () => {
  it('creates a stable per-key principal from a scoped Clerk API key', async () => {
    const verifyKeyState = async () => ({
      id: 'ak_123', subject: 'user_123', revoked: false, expired: false, scopes: liveScopes,
    })
    await expect(authenticateAgentAccess({
      requiredScope: MARKET_OPERATIONS_INVOKE_SCOPE,
      authenticate: async () => ({
        isAuthenticated: true, tokenType: 'api_key', id: 'ak_123', subject: 'user_123', userId: 'user_123', orgId: null,
        scopes: liveScopes,
      }),
      verifyKeyState,
    })).resolves.toEqual({ kind: 'authenticated', principal: {
      principalId: 'clerk_api_key:ak_123', ownerId: 'user_123', credentialId: 'ak_123',
      applicationRef: 'agentic-economy', environment: 'sandbox',
      scopes: [CUSTOMER_REQUEST_INSPECT_ONLY_SCOPE, MARKET_OPERATIONS_INVOKE_SCOPE], authorityMode: 'inspect_only',
    } })
  })

  it('keeps API-key ownership on the Clerk user when an organization claim is present', async () => {
    await expect(authenticateAgentAccess({
      requiredScope: MARKET_OPERATIONS_INVOKE_SCOPE,
      authenticate: async () => ({
        isAuthenticated: true,
        tokenType: 'api_key',
        id: 'ak_org_scoped',
        subject: 'user_org_owner',
        userId: 'user_org_owner',
        orgId: 'org_123',
        scopes: liveScopes,
      }),
      verifyKeyState: async () => ({
        id: 'ak_org_scoped',
        subject: 'user_org_owner',
        revoked: false,
        expired: false,
        scopes: liveScopes,
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
      requiredScope: MARKET_OPERATIONS_INVOKE_SCOPE,
      authenticate: async () => ({
        isAuthenticated: true,
        tokenType: 'api_key',
        id: 'ak_org',
        subject: 'org_123',
        userId: null,
        orgId: 'org_123',
        scopes: liveScopes,
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
      userId: 'user_123', orgId: null, scopes: liveScopes,
    })
    for (const current of [
      { id: 'ak_123', subject: 'user_123', revoked: true, expired: false, scopes: liveScopes },
      { id: 'ak_123', subject: 'user_123', revoked: false, expired: true, scopes: liveScopes },
      { id: 'ak_other', subject: 'user_123', revoked: false, expired: false, scopes: liveScopes },
      { id: 'ak_123', subject: 'user_other', revoked: false, expired: false, scopes: liveScopes },
    ]) {
      await expect(authenticateAgentAccess({ requiredScope: MARKET_OPERATIONS_INVOKE_SCOPE, authenticate, verifyKeyState: async () => current }))
        .resolves.toEqual({ kind: 'refused', status: 401, reason: 'authentication_required' })
    }
    await expect(authenticateAgentAccess({ requiredScope: MARKET_OPERATIONS_INVOKE_SCOPE, authenticate, verifyKeyState: async () => { throw new Error('unavailable') } }))
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

  it('maps legacy create-bearing invoke keys without a mode to inspect_only', async () => {
    const authenticate = async () => ({
      isAuthenticated: true, tokenType: 'api_key' as const, id: 'ak_123', subject: 'user_123',
      userId: 'user_123', orgId: null, scopes: [MARKET_OPERATIONS_INVOKE_SCOPE, CUSTOMER_REQUEST_AGENT_SCOPE],
    })
    await expect(authenticateAgentAccess({ requiredScope: MARKET_OPERATIONS_INVOKE_SCOPE, authenticate, requiredMode: 'approve_each' }))
      .resolves.toEqual({ kind: 'refused', status: 403, reason: 'scope_required' })
    await expect(authenticateAgentAccess({ requiredScope: MARKET_OPERATIONS_INVOKE_SCOPE, authenticate }))
      .resolves.toMatchObject({ kind: 'authenticated', principal: { authorityMode: 'inspect_only' } })
  })

  it('refuses create-only keys at the market invoke door', async () => {
    await expect(authenticateAgentAccess({
      requiredScope: MARKET_OPERATIONS_INVOKE_SCOPE,
      authenticate: async () => ({
        isAuthenticated: true, tokenType: 'api_key', id: 'ak_123', subject: 'user_123',
        userId: 'user_123', orgId: null, scopes: [CUSTOMER_REQUEST_AGENT_SCOPE],
      }),
    })).resolves.toEqual({ kind: 'refused', status: 403, reason: 'scope_required' })
  })

  it('refuses undefined authority mode instead of falling through to inspect_only', async () => {
    await expect(authenticateAgentAccess({
      requiredScope: MARKET_OPERATIONS_INVOKE_SCOPE,
      authenticate: async () => ({
        isAuthenticated: true, tokenType: 'api_key', id: 'ak_123', subject: 'user_123',
        userId: 'user_123', orgId: null,
        scopes: [MARKET_OPERATIONS_INVOKE_SCOPE, CUSTOMER_REQUEST_INSPECT_ONLY_SCOPE, CUSTOMER_REQUEST_APPROVE_EACH_SCOPE],
      }),
    })).resolves.toEqual({ kind: 'refused', status: 403, reason: 'scope_required' })
  })
})
