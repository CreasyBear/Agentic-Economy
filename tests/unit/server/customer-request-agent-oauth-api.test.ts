import { describe, expect, it } from 'vitest'

import {
  handleDeviceAuthorizationPost,
  handleOAuthAuthorizeGet,
  handleOAuthConsentPost,
  handleOAuthRegisterPost,
  handleOAuthTokenPost,
} from '@/lib/server/customer-request-agent-oauth-api'
import {
  hashOAuthValue,
  type CustomerRequestAgentOAuthClient,
  type CustomerRequestAgentOAuthGrant,
  type CustomerRequestAgentOAuthStore,
} from '@/modules/customer-request/oauth-state'

function storeFixture(): CustomerRequestAgentOAuthStore & { grants: Map<string, CustomerRequestAgentOAuthGrant>; clients: Map<string, CustomerRequestAgentOAuthClient> } {
  const grants = new Map<string, CustomerRequestAgentOAuthGrant>()
  const clients = new Map<string, CustomerRequestAgentOAuthClient>()
  return {
    grants,
    clients,
    async insertGrant(grant) { grants.set(grant.grantRef, grant) },
    async getGrantByHash(kind, hash) {
      for (const grant of grants.values()) {
        const value = kind === 'device' ? grant.deviceCodeHash : kind === 'user' ? grant.userCodeHash : grant.authorizationCodeHash
        if (value === hash) return grant
      }
      return null
    },
    async getGrantByRef(grantRef) { return grants.get(grantRef) ?? null },
    async updateGrant(grantRef, expectedStatus, patch) {
      const current = grants.get(grantRef)
      if (current === undefined || current.status !== expectedStatus) return null
      const updated = { ...current, ...patch }
      grants.set(grantRef, updated)
      return updated
    },
    async insertClient(client) { clients.set(client.clientId, client) },
    async getClient(clientId) { return clients.get(clientId) ?? null },
  }
}

const formRequest = (url: string, values: Record<string, string>): Request => new Request(url, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(values),
})

describe('Customer Request OAuth HTTP adapter', () => {
  it('issues bounded device state, slows polling, and delivers once after approval', async () => {
    const store = storeFixture()
    await store.insertClient({ clientId: 'client-local', clientName: 'Local assistant', redirectUris: ['http://localhost/callback'], grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000 })
    const options = { store, now: () => 1_000, issueKey: async () => ({ keyId: 'ak_local' }), getSecret: async () => ({ secret: 'secret-local' }) }
    const issued = await handleDeviceAuthorizationPost(formRequest('http://localhost/oauth/device_authorization', {
      client_id: 'client-local', scope: 'customer_requests:create customer_requests:approve_each',
    }), options)
    expect(issued.status).toBe(200)
    const body = await issued.json() as { device_code: string; user_code: string }
    expect(body).not.toHaveProperty('secret')
    const pending = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: 'client-local', device_code: body.device_code,
    }), options)
    expect(await pending.json()).toEqual({ error: 'authorization_pending' })
    const slow = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: 'client-local', device_code: body.device_code,
    }), options)
    expect(await slow.json()).toEqual({ error: 'slow_down' })
    const grant = await store.getGrantByHash('device', await hashOAuthValue(body.device_code))
    if (grant === null) throw new Error('grant missing')
    await store.updateGrant(grant.grantRef, 'pending', { status: 'approved', keyId: 'ak_local', ownerId: 'user_local' })
    const delivered = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: 'client-local', device_code: body.device_code,
    }), options)
    expect(await delivered.json()).toMatchObject({ access_token: 'secret-local', token_type: 'Bearer', scope: 'customer_requests:create customer_requests:approve_each', expires_in: 604800 })
    const replay = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: 'client-local', device_code: body.device_code,
    }), options)
    expect(await replay.json()).toEqual({ error: 'invalid_grant' })
  })

  it('rejects wildcard registration and keeps secrets out of browser consent', async () => {
    const store = storeFixture()
    const rejected = await handleOAuthRegisterPost(new Request('http://localhost/oauth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'bad', redirect_uris: ['https://example.com/*'], grant_types: ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'none' }),
    }), { store })
    expect(rejected.status).toBe(400)
    expect(store.clients.size).toBe(0)

    await store.insertClient({ clientId: 'client-auth', clientName: 'MCP local', redirectUris: ['http://localhost/callback'], grantTypes: ['authorization_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000 })
    const consent = await handleOAuthAuthorizeGet(new Request('http://localhost/oauth/authorize?client_id=client-auth&redirect_uri=http%3A%2F%2Flocalhost%2Fcallback&response_type=code&state=s&scope=customer_requests%3Acreate%20customer_requests%3Aapprove_each&code_challenge=abc&code_challenge_method=S256'), { store, now: () => 1_000, authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }) })
    const consentHtml = await consent.text()
    expect(consentHtml).toContain('data-ae-consent')
    expect(consentHtml).toContain('data-authority-mode="approve_each"')
    expect(consentHtml).toContain('<p data-ae-scope>Technical permission: customer_requests:approve_each</p>')
    expect(consentHtml).toContain('You approve each request before it moves forward.')
    expect(consentHtml).toContain('<details>')
    expect(consentHtml).not.toContain('Requested mode:')
    expect(consentHtml).not.toContain('Customer Request scope:')
    expect(consentHtml).not.toContain('secret')
  })

  it('binds device consent to the signed-in owner and returns no key secret', async () => {
    const store = storeFixture()
    const userCode = 'ABCD-EFGH'
    await store.insertGrant({ grantRef: 'device:1', flow: 'device_code', clientId: 'client-local', requestedScopes: ['customer_requests:create', 'customer_requests:inspect_only'], deviceCodeHash: 'd', userCodeHash: await hashOAuthValue(userCode), status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Local assistant' })
    const response = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { user_code: userCode, decision: 'approve' }), {
      store, now: () => 1_000, authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }), issueKey: async () => ({ keyId: 'ak_local' }),
    })
    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain('ak_local')
    expect(store.grants.get('device:1')?.status).toBe('approved')
  })
})
