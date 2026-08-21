import { describe, expect, it } from 'vitest'

import { CUSTOMER_REQUEST_BOUNDED_MANDATE_SCOPE, MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'
import { AGENT_ACCESS_KEY_TTL_SECONDS } from '@/modules/agent-access/agent-access'

import {
  approveGrant,
  beginAuthorizationCodeGrant,
  beginDeviceGrant,
  claimGrantDelivery,
  completeGrantDelivery,
  createOpaqueOAuthValue,
  createUserCode,
  denyGrant,
  hashOAuthValue,
  normalizeRequestedScopes,
  pollDeviceGrant,
  readGrantForConsent,
  resetGrantDelivery,
  type AgentAccessOAuthClient,
  type AgentAccessOAuthGrant,
  type AgentAccessOAuthStore,
} from '@/modules/agent-access/oauth-state'

function storeFixture(): AgentAccessOAuthStore & { grants: Map<string, AgentAccessOAuthGrant> } {
  const grants = new Map<string, AgentAccessOAuthGrant>()
  return {
    grants,
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
    async insertClient() {},
    async getClient() { return null },
  }
}

const deviceClient: AgentAccessOAuthClient = {
  clientId: 'client-device',
  clientName: 'Device assistant',
  redirectUris: ['http://localhost/callback'],
  grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'],
  tokenEndpointAuthMethod: 'none',
  createdAt: 1_000,
}

const authClient: AgentAccessOAuthClient = {
  ...deviceClient,
  clientId: 'client-auth',
  grantTypes: ['authorization_code'],
}

const scopes = [MARKET_OPERATIONS_INVOKE_SCOPE, 'customer_requests:approve_each']
const issueKey = async () => ({ keyId: 'key_machine' })

async function deviceGrant(store: AgentAccessOAuthStore) {
  const result = await beginDeviceGrant(store, { client: deviceClient, requestedScopes: scopes, now: 1_000 })
  if (result.kind !== 'ok') throw new Error('device grant did not begin')
  return result.value
}

describe('Customer Request OAuth state machine', () => {
  it('stores only one exact mode and hashes opaque values', async () => {
    const deviceCode = createOpaqueOAuthValue()
    const userCode = createUserCode()
    const digest = await hashOAuthValue(deviceCode)
    expect(digest).not.toContain(deviceCode)
    expect(userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/u)
    expect(normalizeRequestedScopes('customer_requests:approve_each')).toEqual({
      mode: 'approve_each', scopes: [MARKET_OPERATIONS_INVOKE_SCOPE, 'customer_requests:approve_each'],
    })
    expect(normalizeRequestedScopes('customer_requests:create customer_requests:approve_each')).toBeUndefined()
    expect(normalizeRequestedScopes(`${MARKET_OPERATIONS_INVOKE_SCOPE} ${CUSTOMER_REQUEST_BOUNDED_MANDATE_SCOPE}`)).toEqual({
      mode: 'bounded_mandate',
      scopes: [MARKET_OPERATIONS_INVOKE_SCOPE, CUSTOMER_REQUEST_BOUNDED_MANDATE_SCOPE],
    })
    expect(normalizeRequestedScopes('customer_requests:create customer_requests:approve_each customer_requests:full_yolo')).toBeUndefined()
    expect(normalizeRequestedScopes('customer_requests:create customer_requests:standing_authority')).toBeUndefined()
  })

  it('persists explicit requested access for both flows and the exact default when absent', async () => {
    const requestedAccess = {
      environment: 'production' as const,
      maximumSpendPerInvocation: { currency: 'USD', units: '100', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '500', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '5000', exponent: 2 },
      maximumConcurrentInvocations: 2,
      maximumCallsPerMinute: 10,
      maximumCallsPerHour: 100,
      expiresInSeconds: 86_400,
    }
    const deviceResult = await beginDeviceGrant(storeFixture(), {
      client: deviceClient,
      requestedScopes: scopes,
      requestedAccess,
      now: 1_000,
    })
    if (deviceResult.kind !== 'ok') throw new Error('device grant did not begin')
    expect(JSON.stringify(deviceResult.value.grant.requestedAccess)).toBe(JSON.stringify(requestedAccess))

    const authResult = await beginAuthorizationCodeGrant(storeFixture(), {
      client: authClient,
      redirectUri: 'http://localhost/callback',
      requestedScopes: scopes,
      requestedAccess,
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
      ownerId: 'owner-one',
      now: 1_000,
    })
    if (authResult.kind !== 'ok') throw new Error('authorization grant did not begin')
    expect(JSON.stringify(authResult.value.grant.requestedAccess)).toBe(JSON.stringify(requestedAccess))

    const expectedDefault = {
      environment: 'sandbox' as const,
      expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS,
    }
    expect(JSON.stringify((await deviceGrant(storeFixture())).grant.requestedAccess)).toBe(JSON.stringify(expectedDefault))
    const defaultAuthResult = await beginAuthorizationCodeGrant(storeFixture(), {
      client: authClient,
      redirectUri: 'http://localhost/callback',
      requestedScopes: scopes,
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
      ownerId: 'owner-one',
      now: 1_000,
    })
    if (defaultAuthResult.kind !== 'ok') throw new Error('authorization default grant did not begin')
    expect(JSON.stringify(defaultAuthResult.value.grant.requestedAccess)).toBe(JSON.stringify(expectedDefault))
  })

  it('enforces expiry and owner binding inside consent transitions', async () => {
    const store = storeFixture()
    const started = await deviceGrant(store)
    const expired = await approveGrant(store, { grantRef: started.grant.grantRef, ownerId: 'owner-one', now: started.grant.expiresAt, issueKey })
    expect(expired).toEqual({ kind: 'refused', reason: 'expired_token' })
    const validStore = storeFixture()
    const authStarted = await beginAuthorizationCodeGrant(validStore, {
      client: authClient,
      redirectUri: 'http://localhost/callback',
      requestedScopes: scopes,
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
      ownerId: 'owner-one',
      now: 1_000,
    })
    if (authStarted.kind !== 'ok') throw new Error('authorization grant did not begin')
    const ownerMismatch = await approveGrant(validStore, { grantRef: authStarted.value.grant.grantRef, ownerId: 'owner-two', now: 1_001, issueKey })
    expect(ownerMismatch).toEqual({ kind: 'refused', reason: 'owner_mismatch' })
  })

  it('enforces the device poll interval and slow_down result', async () => {
    const store = storeFixture()
    const started = await deviceGrant(store)
    const pending = await pollDeviceGrant(store, { clientId: deviceClient.clientId, deviceCode: started.deviceCode, now: 1_000 })
    const slow = await pollDeviceGrant(store, { clientId: deviceClient.clientId, deviceCode: started.deviceCode, now: 1_000 })
    expect(pending).toEqual({ kind: 'authorization_pending' })
    expect(slow).toEqual({ kind: 'slow_down' })
  })

  it('refuses denied and consumed replays', async () => {
    const deniedStore = storeFixture()
    const deniedStarted = await deviceGrant(deniedStore)
    const denied = await denyGrant(deniedStore, { userCode: deniedStarted.userCode, ownerId: 'owner-one', now: 1_001 })
    expect(denied.kind).toBe('ok')
    const deniedReplay = await approveGrant(deniedStore, { userCode: deniedStarted.userCode, ownerId: 'owner-one', now: 1_002, issueKey })
    expect(deniedReplay).toEqual({ kind: 'refused', reason: 'access_denied' })

    const consumedStore = storeFixture()
    const consumedStarted = await deviceGrant(consumedStore)
    const approved = await approveGrant(consumedStore, { grantRef: consumedStarted.grant.grantRef, ownerId: 'owner-one', now: 1_001, issueKey })
    if (approved.kind !== 'ok') throw new Error('approval failed')
    const claimed = await claimGrantDelivery(consumedStore, { credential: { kind: 'device', grantRef: approved.value.grant.grantRef, clientId: deviceClient.clientId }, now: 1_002 })
    if (claimed.kind !== 'ok') throw new Error('claim failed')
    await completeGrantDelivery(consumedStore, { grantRef: claimed.value.grant.grantRef, claimToken: claimed.value.claimToken, now: 1_003 })
    const replay = await claimGrantDelivery(consumedStore, { credential: { kind: 'device', grantRef: approved.value.grant.grantRef, clientId: deviceClient.clientId }, now: 1_004 })
    expect(replay).toEqual({ kind: 'refused', reason: 'invalid_grant' })
  })

  it('enforces PKCE at the claim boundary', async () => {
    const store = storeFixture()
    const started = await beginAuthorizationCodeGrant(store, {
      client: authClient,
      redirectUri: 'http://localhost/callback',
      requestedScopes: scopes,
      codeChallenge: await hashOAuthValue('verifier'),
      codeChallengeMethod: 'S256',
      ownerId: 'owner-one',
      now: 1_000,
    })
    if (started.kind !== 'ok') throw new Error('authorization grant did not begin')
    const approved = await approveGrant(store, { grantRef: started.value.grant.grantRef, ownerId: 'owner-one', now: 1_001, issueKey })
    if (approved.kind !== 'ok' || approved.value.authorizationCode === undefined) throw new Error('authorization grant did not approve')
    const wrong = await claimGrantDelivery(store, { credential: { kind: 'authorization', authorizationCode: approved.value.authorizationCode, clientId: authClient.clientId, redirectUri: 'http://localhost/callback', codeVerifier: 'wrong' }, now: 1_002 })
    expect(wrong).toEqual({ kind: 'refused', reason: 'invalid_pkce' })
    const right = await claimGrantDelivery(store, { credential: { kind: 'authorization', authorizationCode: approved.value.authorizationCode, clientId: authClient.clientId, redirectUri: 'http://localhost/callback', codeVerifier: 'verifier' }, now: 1_002 })
    expect(right.kind).toBe('ok')
  })

  it('rolls delivery back after secret retrieval failure', async () => {
    const store = storeFixture()
    const started = await deviceGrant(store)
    const approved = await approveGrant(store, { grantRef: started.grant.grantRef, ownerId: 'owner-one', now: 1_001, issueKey })
    if (approved.kind !== 'ok') throw new Error('approval failed')
    const claimed = await claimGrantDelivery(store, { credential: { kind: 'device', grantRef: approved.value.grant.grantRef, clientId: deviceClient.clientId }, now: 1_002 })
    if (claimed.kind !== 'ok') throw new Error('claim failed')
    const reset = await resetGrantDelivery(store, { grantRef: claimed.value.grant.grantRef, claimToken: claimed.value.claimToken })
    expect(reset.kind).toBe('ok')
    const retried = await claimGrantDelivery(store, { credential: { kind: 'device', grantRef: approved.value.grant.grantRef, clientId: deviceClient.clientId }, now: 1_003 })
    expect(retried.kind).toBe('ok')
  })

  it('allows only one concurrent approval through CAS', async () => {
    const store = storeFixture()
    const started = await deviceGrant(store)
    const results = await Promise.all([
      approveGrant(store, { grantRef: started.grant.grantRef, ownerId: 'owner-one', now: 1_001, issueKey: async () => { await Promise.resolve(); return { keyId: 'key-one' } } }),
      approveGrant(store, { grantRef: started.grant.grantRef, ownerId: 'owner-one', now: 1_001, issueKey: async () => { await Promise.resolve(); return { keyId: 'key-two' } } }),
    ])
    expect(results.filter((result) => result.kind === 'ok')).toHaveLength(1)
    expect(results.filter((result) => result.kind === 'conflict')).toHaveLength(1)
    expect(store.grants.get(started.grant.grantRef)?.status).toBe('approved')
  })
})
