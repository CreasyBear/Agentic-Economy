import { describe, expect, it, vi } from 'vitest'
import { AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST } from '@/modules/agent-access/contract'
import { AGENT_ACCESS_KEY_TTL_SECONDS } from '@/modules/agent-access/agent-access'

import {
  handleDeviceAuthorizationPost,
  handleOAuthAuthorizeGet,
  handleOAuthConsentPost,
  handleOAuthRegisterPost,
  handleOAuthTokenPost,
  type OAuthApiOptions,
} from '@/lib/server/agent-access-oauth-api'
import { defaultSandboxAgentAccessPolicy } from '@/modules/agent-access/sandbox-policy'
import {
  buildProductionAgentAccessPolicy,
  defaultProductionAgentAccessPolicy,
} from '@/modules/agent-access/production-policy'
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

const productionAuthorizationDetails = {
  type: 'agentic_economy_market_operations',
  environment: 'production',
  expires_in_seconds: 7_200,
  maximum_spend_per_invocation: { currency: 'USD', units: '100', exponent: 2 },
  maximum_daily_spend: { currency: 'USD', units: '500', exponent: 2 },
  maximum_monthly_spend: { currency: 'USD', units: '2000', exponent: 2 },
  maximum_concurrent_invocations: 3,
  maximum_calls_per_minute: 7,
  maximum_calls_per_hour: 42,
} as const

const productionRequestedAccess = {
  environment: 'production',
  expiresInSeconds: 7_200,
  maximumSpendPerInvocation: { currency: 'USD', units: '100', exponent: 2 },
  maximumDailySpend: { currency: 'USD', units: '500', exponent: 2 },
  maximumMonthlySpend: { currency: 'USD', units: '2000', exponent: 2 },
  maximumConcurrentInvocations: 3,
  maximumCallsPerMinute: 7,
  maximumCallsPerHour: 42,
} as const

type OAuthIssueInput = Parameters<NonNullable<OAuthApiOptions['issueKey']>>[0]

describe('Customer Request OAuth HTTP adapter', () => {
  it('issues bounded device state, slows polling, and delivers once after approval', async () => {
    const store = storeFixture()
    await store.insertClient({ clientId: 'client-local', clientName: 'Local assistant', redirectUris: ['http://localhost/callback'], grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000 })
    const options = { store, now: () => 1_000, issueKey: async () => ({ keyId: 'ak_local' }), getSecret: async () => ({ secret: 'secret-local' }) }
    const issued = await handleDeviceAuthorizationPost(formRequest('http://localhost/oauth/device_authorization', {
      client_id: 'client-local', scope: 'market_operations:invoke customer_requests:approve_each',
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
    expect(grant.requestedAccess).toEqual({ environment: 'sandbox', expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS })
    await store.updateGrant(grant.grantRef, 'pending', { status: 'approved', keyId: 'ak_local', ownerId: 'user_local' })
    const delivered = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: 'client-local', device_code: body.device_code,
    }), options)
    expect(await delivered.json()).toMatchObject({ access_token: 'secret-local', token_type: 'Bearer', scope: 'market_operations:invoke customer_requests:approve_each', expires_in: 604800 })
    const replay = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: 'client-local', device_code: body.device_code,
    }), options)
    expect(await replay.json()).toEqual({
      error: 'invalid_grant',
      error_description: 'The authorization grant is invalid or expired.',
    })
  })

  it('persists the same requested access through device and authorization-code grants', async () => {
    const store = storeFixture()
    await store.insertClient({ clientId: 'client-details-device', clientName: 'Details device', redirectUris: ['http://localhost/callback'], grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000 })
    await store.insertClient({ clientId: 'client-details-code', clientName: 'Details code', redirectUris: ['http://localhost/callback'], grantTypes: ['authorization_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000 })
    const options = { store, now: () => 1_000, authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }) }
    const details = JSON.stringify([productionAuthorizationDetails])
    const device = await handleDeviceAuthorizationPost(formRequest('http://localhost/oauth/device_authorization', {
      client_id: 'client-details-device',
      scope: 'market_operations:invoke customer_requests:approve_each',
      authorization_details: details,
    }), options)
    expect(device.status).toBe(200)
    const deviceGrant = [...store.grants.values()].find((grant) => grant.flow === 'device_code')
    if (deviceGrant === undefined) throw new Error('device grant missing')
    expect(deviceGrant.requestedAccess).toEqual(productionRequestedAccess)

    const authorizationUrl = new URL('http://localhost/oauth/authorize')
    authorizationUrl.search = new URLSearchParams({
      client_id: 'client-details-code',
      redirect_uri: 'http://localhost/callback',
      response_type: 'code',
      state: 'state-details',
      scope: 'market_operations:invoke customer_requests:approve_each',
      code_challenge: 'challenge-details',
      code_challenge_method: 'S256',
      authorization_details: details,
    }).toString()
    const authorization = await handleOAuthAuthorizeGet(new Request(authorizationUrl), options)
    expect(authorization.status).toBe(200)
    const authorizationGrant = [...store.grants.values()].find((grant) => grant.flow === 'authorization_code')
    if (authorizationGrant === undefined) throw new Error('authorization-code grant missing')
    expect(authorizationGrant.requestedAccess).toEqual(productionRequestedAccess)
    expect(authorizationGrant.requestedAccess).toEqual(deviceGrant.requestedAccess)
  })

  it('rejects invalid authorization details before inserting a grant', async () => {
    const partialDetails = {
      type: productionAuthorizationDetails.type,
      environment: productionAuthorizationDetails.environment,
      expires_in_seconds: productionAuthorizationDetails.expires_in_seconds,
      maximum_spend_per_invocation: productionAuthorizationDetails.maximum_spend_per_invocation,
      maximum_daily_spend: productionAuthorizationDetails.maximum_daily_spend,
    }
    const invalidCases: Array<{ value: unknown; scope?: string }> = [
      { value: '{not-json' },
      { value: [{ ...productionAuthorizationDetails, unexpected: true }] },
      { value: [productionAuthorizationDetails, productionAuthorizationDetails] },
      { value: [partialDetails] },
      { value: [{ ...productionAuthorizationDetails, maximum_spend_per_invocation: { currency: 'USD', units: '600', exponent: 2 }, maximum_daily_spend: { currency: 'USD', units: '500', exponent: 2 } }] },
      { value: [{ ...productionAuthorizationDetails, maximum_monthly_spend: { currency: 'EUR', units: '2000', exponent: 2 } }] },
      { value: [{ ...productionAuthorizationDetails, maximum_spend_per_invocation: { currency: 'USD', units: '0', exponent: 2 } }] },
      { value: [{ ...productionAuthorizationDetails, environment: 'sandbox' }] },
      { value: [productionAuthorizationDetails], scope: 'market_operations:invoke customer_requests:full_yolo' },
    ]

    for (const [index, invalidCase] of invalidCases.entries()) {
      const store = storeFixture()
      await store.insertClient({ clientId: `client-invalid-details-${index}`, clientName: 'Invalid details', redirectUris: ['http://localhost/callback'], grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000 })
      const details = typeof invalidCase.value === 'string' ? invalidCase.value : JSON.stringify(invalidCase.value)
      const response = await handleDeviceAuthorizationPost(formRequest('http://localhost/oauth/device_authorization', {
        client_id: `client-invalid-details-${index}`,
        scope: invalidCase.scope ?? 'market_operations:invoke customer_requests:approve_each',
        authorization_details: details,
      }), { store, now: () => 1_000 })
      expect(response.status, `case ${index}`).toBe(400)
      expect(await response.json(), `case ${index}`).toMatchObject({ error: 'invalid_request' })
      expect(store.grants.size, `case ${index}`).toBe(0)
    }
  })

  it('keeps rate-limit failures in the OAuth error envelope', async () => {
    const response = await handleDeviceAuthorizationPost(formRequest('http://localhost/oauth/device_authorization', {
      client_id: 'client-limited',
      scope: 'market_operations:invoke customer_requests:inspect_only',
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
        scope: 'market_operations:invoke customer_requests:inspect_only',
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
    const consent = await handleOAuthAuthorizeGet(new Request('http://localhost/oauth/authorize?client_id=client-auth&redirect_uri=http%3A%2F%2Flocalhost%2Fcallback&response_type=code&state=s&scope=market_operations%3Ainvoke%20customer_requests%3Aapprove_each&code_challenge=abc&code_challenge_method=S256'), { store, now: () => 1_000, authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }) })
    const consentHtml = await consent.text()
    expect(consentHtml).toContain('data-ae-consent')
    expect(consentHtml).toContain('data-authority-mode="approve_each"')
    expect(consentHtml).toContain('<p data-ae-scope>Technical permission: customer_requests:approve_each</p>')
    expect(consentHtml).toContain('You approve each request before it moves forward.')
    expect(consentHtml).toContain('<details>')
    expect(consentHtml).not.toContain('Requested mode:')
    expect(consentHtml).not.toContain('Customer Request scope:')
    expect(consentHtml).not.toContain('secret')
    const sandboxGrant = [...store.grants.values()].find((grant) => grant.flow === 'authorization_code')
    expect(sandboxGrant?.requestedAccess).toEqual({ environment: 'sandbox', expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS })
  })

  it('renders persisted production controls and the production zero default truthfully', async () => {
    const store = storeFixture()
    await store.insertClient({ clientId: 'client-production-consent', clientName: 'Production assistant', redirectUris: ['http://localhost/callback'], grantTypes: ['authorization_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000 })
    const options = { store, now: () => 1_000, authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }) }
    const withControls = new URL('http://localhost/oauth/authorize')
    withControls.search = new URLSearchParams({
      client_id: 'client-production-consent',
      redirect_uri: 'http://localhost/callback',
      response_type: 'code',
      state: 'production-state',
      scope: 'market_operations:invoke customer_requests:bounded_mandate',
      code_challenge: 'production-challenge',
      code_challenge_method: 'S256',
      authorization_details: JSON.stringify([productionAuthorizationDetails]),
    }).toString()
    const controlledResponse = await handleOAuthAuthorizeGet(new Request(withControls), options)
    expect(controlledResponse.status).toBe(200)
    const controlledHtml = await controlledResponse.text()
    expect(controlledHtml).toContain('data-environment="production"')
    expect(controlledHtml).toContain('data-expires-in-seconds="7200"')
    expect(controlledHtml).toContain('Authority mode: bounded_mandate')
    expect(controlledHtml).toContain('Maximum spend per invocation: USD 1.00.')
    expect(controlledHtml).toContain('Maximum daily spend: USD 5.00.')
    expect(controlledHtml).toContain('Maximum monthly spend: USD 20.00.')
    expect(controlledHtml).toContain('Maximum concurrent invocations: 3.')
    expect(controlledHtml).toContain('Maximum calls per minute: 7.')
    expect(controlledHtml).toContain('Maximum calls per hour: 42.')
    expect(controlledHtml).not.toContain(JSON.stringify(productionAuthorizationDetails))
    expect(controlledHtml).not.toContain('data-expires-in-days')
    expect(controlledHtml).not.toContain('development')
    expect(controlledHtml).not.toContain('$1 each')

    const zeroDefault = new URL('http://localhost/oauth/authorize')
    zeroDefault.search = new URLSearchParams({
      client_id: 'client-production-consent',
      redirect_uri: 'http://localhost/callback',
      response_type: 'code',
      state: 'production-zero-state',
      scope: 'market_operations:invoke customer_requests:approve_each',
      code_challenge: 'production-zero-challenge',
      code_challenge_method: 'S256',
      authorization_details: JSON.stringify([{
        type: 'agentic_economy_market_operations',
        environment: 'production',
        expires_in_seconds: 3_600,
      }]),
    }).toString()
    const zeroDefaultResponse = await handleOAuthAuthorizeGet(new Request(zeroDefault), options)
    expect(zeroDefaultResponse.status).toBe(200)
    expect(await zeroDefaultResponse.text()).toContain('Spending is disabled by the zero default.')
  })

  it('derives sandbox, zero-budget, and bounded production issuance from persisted access', async () => {
    const store = storeFixture()
    await store.insertClient({ clientId: 'client-local', clientName: 'Local assistant', redirectUris: ['http://localhost/callback'], grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000 })
    await store.insertGrant({ grantRef: 'device:sandbox-issuance', flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'], requestedAccess: { environment: 'sandbox', expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'sandbox-code', userCodeHash: 'sandbox-user', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Sandbox assistant' })
    await store.insertGrant({ grantRef: 'device:production-zero', flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:approve_each'], requestedAccess: { environment: 'production', expiresInSeconds: 1_234 }, deviceCodeHash: 'zero-code', userCodeHash: 'zero-user', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Zero assistant' })
    await store.insertGrant({ grantRef: 'device:production-bounded', flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:bounded_mandate'], requestedAccess: productionRequestedAccess, deviceCodeHash: await hashOAuthValue('bounded-code'), userCodeHash: 'bounded-user', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Bounded assistant' })
    const issued: OAuthIssueInput[] = []
    const options = {
      store,
      now: () => 1_000,
      canonicalBaseUrl: 'http://localhost',
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
      issueKey: async (input: OAuthIssueInput) => { issued.push(input); return { keyId: `ak_issued_${issued.length}` } },
      getSecret: async () => ({ secret: 'bounded-secret' }),
    }
    for (const [grantRef, authorityMode] of [
      ['device:sandbox-issuance', 'inspect_only'],
      ['device:production-zero', 'approve_each'],
      ['device:production-bounded', 'bounded_mandate'],
    ] as const) {
      const response = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: grantRef, decision: 'approve', authority_mode: authorityMode }), options)
      expect(response.status).toBe(200)
    }
    const retry = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: 'device:production-bounded', decision: 'approve', authority_mode: 'bounded_mandate' }), options)
    expect(retry.status).toBe(400)
    expect(issued).toHaveLength(3)
    expect(issued[0]?.requestedAccess).toEqual({ environment: 'sandbox', expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS })
    expect(issued[0]?.policy).toEqual(defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }))
    expect(issued[1]?.requestedAccess).toEqual({ environment: 'production', expiresInSeconds: 1_234 })
    expect(issued[1]?.policy).toEqual(defaultProductionAgentAccessPolicy({ currency: 'USD', exponent: 2 }))
    const boundedBase = buildProductionAgentAccessPolicy({
      currency: 'USD',
      exponent: 2,
      maximumSpendPerInvocation: productionRequestedAccess.maximumSpendPerInvocation,
      maximumDailySpend: productionRequestedAccess.maximumDailySpend,
      maximumMonthlySpend: productionRequestedAccess.maximumMonthlySpend,
    })
    expect(issued[2]?.authorityMode).toBe('bounded_mandate')
    expect(issued[2]?.requestedAccess).toEqual(productionRequestedAccess)
    expect(issued[2]?.policy).toEqual({
      ...boundedBase,
      budget: { ...boundedBase.budget, maximumConcurrentInvocations: 3 },
      rate: { ...boundedBase.rate, maximumCallsPerMinute: 7, maximumCallsPerHour: 42 },
    })

    const token = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: 'client-local',
      device_code: 'bounded-code',
    }), options)
    expect(await token.json()).toMatchObject({ access_token: 'bounded-secret', expires_in: 7_200 })
  })

  it('does not issue production full_yolo or invalid persisted access', async () => {
    const store = storeFixture()
    await store.insertGrant({ grantRef: 'device:full-yolo', flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:full_yolo'], requestedAccess: { environment: 'production', expiresInSeconds: 1_000 }, deviceCodeHash: 'full-code', userCodeHash: 'full-user', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Unsafe assistant' })
    await store.insertGrant({ grantRef: 'device:invalid-access', flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:approve_each'], requestedAccess: { environment: 'production', expiresInSeconds: 1_000, maximumSpendPerInvocation: { currency: 'USD', units: '100', exponent: 2 } }, deviceCodeHash: 'invalid-code', userCodeHash: 'invalid-user', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Invalid assistant' })
    let issueCount = 0
    const options = {
      store,
      now: () => 1_000,
      canonicalBaseUrl: 'http://localhost',
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
      issueKey: async () => { issueCount += 1; return { keyId: 'ak_should-not-exist' } },
    }
    const fullYolo = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: 'device:full-yolo', decision: 'approve', authority_mode: 'full_yolo' }), options)
    const invalid = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: 'device:invalid-access', decision: 'approve', authority_mode: 'approve_each' }), options)
    expect(fullYolo.status).toBe(400)
    expect(invalid.status).toBe(400)
    expect(issueCount).toBe(0)
    expect(store.grants.get('device:full-yolo')?.status).toBe('pending')
    expect(store.grants.get('device:invalid-access')?.status).toBe('pending')
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
    await store.insertGrant({ grantRef: 'device:1', flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'], requestedAccess: { environment: 'sandbox', expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'd', userCodeHash: await hashOAuthValue('ABCD-EFGH'), status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Local assistant' })
    let issuedInput: OAuthIssueInput | undefined
    const response = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: 'device:1', decision: 'approve' }), {
      store, now: () => 1_000, canonicalBaseUrl: 'http://localhost', authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }), issueKey: async (input) => { issuedInput = input; return { keyId: 'ak_local' } },
    })
    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain('ak_local')
    expect(store.grants.get('device:1')?.status).toBe('approved')
    expect(issuedInput?.authorityMode).toBe('inspect_only')
    expect(issuedInput?.requestedAccess).toEqual({ environment: 'sandbox', expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS })
    expect(issuedInput?.policy).toEqual(defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }))
  })
  it('rejects consent from a foreign Origin before changing the grant', async () => {
    const store = storeFixture()
    await store.insertGrant({ grantRef: 'device:foreign-origin', flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'], requestedAccess: { environment: 'sandbox', expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'd-foreign', userCodeHash: 'u-foreign', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Local assistant' })
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
