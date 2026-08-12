import { describe, expect, it, vi } from 'vitest'
import { AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST } from '@/modules/agent-access/contract'

import {
  handleDeviceAuthorizationPost,
  handleOAuthAuthorizeGet,
  handleOAuthConsentPost,
  handleOAuthRegisterPost,
  handleOAuthTokenPost,
} from '@/lib/server/agent-access-oauth-api'
import {
  hashOAuthValue,
  type AgentAccessOAuthClient,
  type AgentAccessOAuthGrant,
  type AgentAccessOAuthStore,
} from '@/modules/agent-access/oauth-state'

function storeFixture(): AgentAccessOAuthStore & { grants: Map<string, AgentAccessOAuthGrant>; clients: Map<string, AgentAccessOAuthClient> } {
  const grants = new Map<string, AgentAccessOAuthGrant>()
  const clients = new Map<string, AgentAccessOAuthClient>()
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

const formRequest = (url: string, values: Record<string, string>, origin = new URL(url).origin): Request => new Request(url, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', Origin: origin },
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
    expect(pending.headers.get('content-type')).toBe('application/json')
    expect(pending.headers.get('cache-control')).toBe('no-store')
    const pendingBody = await pending.json() as Record<string, unknown>
    expect(pendingBody).toEqual({
      error: 'authorization_pending',
      error_description: 'Authorization is still pending.',
    })
    expect(pendingBody).not.toHaveProperty('type')
    expect(pendingBody).not.toHaveProperty('title')
    expect(pendingBody).not.toHaveProperty('status')
    expect(pendingBody).not.toHaveProperty('kind')
    expect(pendingBody).not.toHaveProperty('code')
    expect(pending.headers.get('retry-after')).toBe('5')
    const slow = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: 'client-local', device_code: body.device_code,
    }), options)
    expect(slow.headers.get('content-type')).toBe('application/json')
    expect(slow.headers.get('retry-after')).toBe('10')
    expect(await slow.json()).toEqual({
      error: 'slow_down',
      error_description: 'Authorization is still pending; wait longer before polling again.',
    })
    const grant = await store.getGrantByHash('device', await hashOAuthValue(body.device_code))
    if (grant === null) throw new Error('grant missing')
    await store.updateGrant(grant.grantRef, 'pending', { status: 'approved', keyId: 'ak_local', ownerId: 'user_local' })
    const delivered = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: 'client-local', device_code: body.device_code,
    }), options)
    expect(await delivered.json()).toMatchObject({ access_token: 'secret-local', token_type: 'Bearer', scope: 'market_operations:invoke customer_requests:create customer_requests:approve_each', expires_in: 604800 })
    const replay = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: 'client-local', device_code: body.device_code,
    }), options)
    expect(await replay.json()).toEqual({
      error: 'invalid_grant',
      error_description: 'The authorization grant is invalid or expired.',
    })
  })

  it('keeps rate-limit failures in the OAuth error envelope', async () => {
    const response = await handleDeviceAuthorizationPost(formRequest('http://localhost/oauth/device_authorization', {
      client_id: 'client-limited',
      scope: 'customer_requests:create customer_requests:inspect_only',
    }), {
      rateLimit: async () => ({ ok: false, retryAfter: 12_345 }),
    })

    expect(response.status).toBe(429)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('retry-after')).toBe('13')
    expect(await response.json()).toEqual({
      error: 'rate_limited',
      error_description: 'Too many OAuth requests; retry later.',
    })
  })

  it('uses the configured canonical base URL for OAuth verification redirects instead of the request host', async () => {
    vi.stubEnv('AE_CANONICAL_BASE_URL', 'https://canonical.agentic.test/')
    try {
      const store = storeFixture()
      await store.insertClient({
        clientId: 'client-canonical',
        clientName: 'Canonical assistant',
        redirectUris: ['http://localhost/callback'],
        grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'],
        tokenEndpointAuthMethod: 'none',
        createdAt: 1_000,
      })
      const response = await handleDeviceAuthorizationPost(formRequest('https://spoofed.agentic.test/oauth/device_authorization', {
        client_id: 'client-canonical',
        scope: 'customer_requests:create customer_requests:inspect_only',
      }), { store, now: () => 1_000 })
      const body = await response.json() as { verification_uri: string }

      expect(response.status).toBe(200)
      expect(new URL(body.verification_uri).origin).toBe('https://canonical.agentic.test')
      expect(new URL(body.verification_uri).pathname).toBe('/agent-access/authorize')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('registers a device-only client without an authorization-code response type', async () => {
    const store = storeFixture()
    const response = await handleOAuthRegisterPost(new Request('http://localhost/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST),
    }), { store, now: () => 1_000 })

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      client_name: AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.client_name,
      redirect_uris: [...AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.redirect_uris],
      grant_types: [...AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.grant_types],
      response_types: [],
      token_endpoint_auth_method: AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.token_endpoint_auth_method,
      scope: AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.scope,
    })
    expect(store.clients.size).toBe(1)
  })

  it('rejects registration without required client metadata', async () => {
    for (const field of ['client_name', 'redirect_uris'] as const) {
      const store = storeFixture()
      const payload = { ...AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST, [field]: undefined }
      const response = await handleOAuthRegisterPost(new Request('http://localhost/oauth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }), { store })

      expect(response.status).toBe(400)
      expect(store.clients.size).toBe(0)
    }
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
  it('requires JSON media type before dynamic registration parsing', async () => {
    const store = storeFixture()
    const registration = {
      client_name: 'JSON assistant',
      redirect_uris: ['http://localhost/callback'],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }
    for (const contentType of [undefined, 'text/plain']) {
      const headers = contentType === undefined ? {} : { 'content-type': contentType }
      const rejected = await handleOAuthRegisterPost(new Request('http://localhost/oauth/register', {
        method: 'POST',
        headers,
        body: JSON.stringify(registration),
      }), { store })
      expect(rejected.status).toBe(400)
      expect(rejected.headers.get('content-type')).toBe('application/json')
      expect(await rejected.json()).toEqual({
        error: 'invalid_request',
        error_description: 'The OAuth request is invalid.',
      })
      expect(store.clients.size).toBe(0)
    }

    const accepted = await handleOAuthRegisterPost(new Request('http://localhost/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(registration),
    }), { store })
    expect(accepted.status).toBe(201)
    expect(store.clients.size).toBe(1)
  })
  it('projects consent source failures as a safe unavailable problem', async () => {
    const baseStore = storeFixture()
    const store: AgentAccessOAuthStore = {
      ...baseStore,
      async getGrantByHash() {
        throw new Error('HTTPError')
      },
    }
    const response = await handleOAuthAuthorizeGet(new Request('http://localhost/oauth/authorize?user_code=G12-FAKE-CODE'), {
      store,
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
    })

    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    const body = await response.json()
    expect(body).toMatchObject({
      type: 'about:blank',
      status: 503,
      kind: 'UNAVAILABLE',
      code: 'oauth_authorization_unavailable',
      detail: 'The authorization request is temporarily unavailable.',
      retryable: true,
    })
    expect(JSON.stringify(body)).not.toContain('HTTPError')
  })

  it('binds device consent to the signed-in owner and returns no key secret', async () => {
    const store = storeFixture()
    await store.insertGrant({ grantRef: 'device:1', flow: 'device_code', clientId: 'client-local', requestedScopes: ['customer_requests:create', 'customer_requests:inspect_only'], deviceCodeHash: 'd', userCodeHash: await hashOAuthValue('ABCD-EFGH'), status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Local assistant' })
    const response = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: 'device:1', decision: 'approve' }), {
      store, now: () => 1_000, canonicalBaseUrl: 'http://localhost', authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }), issueKey: async () => ({ keyId: 'ak_local' }),
    })
    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain('ak_local')
    expect(store.grants.get('device:1')?.status).toBe('approved')
  })
  it('rejects consent from a foreign Origin before changing the grant', async () => {
    const store = storeFixture()
    await store.insertGrant({ grantRef: 'device:foreign-origin', flow: 'device_code', clientId: 'client-local', requestedScopes: ['customer_requests:create', 'customer_requests:inspect_only'], deviceCodeHash: 'd-foreign', userCodeHash: 'u-foreign', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Local assistant' })
    const response = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: 'device:foreign-origin', decision: 'approve' }, 'https://evil.example'), {
      store, now: () => 1_000, canonicalBaseUrl: 'http://localhost', authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }), issueKey: async () => ({ keyId: 'ak_local' }),
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'access_denied',
      error_description: 'The resource owner denied the request.',
    })
    expect(store.grants.get('device:foreign-origin')?.status).toBe('pending')
  })

})
