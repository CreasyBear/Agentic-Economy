import { describe, expect, it } from 'vitest'

import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'

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

const scopes = ['customer_requests:create', 'customer_requests:approve_each']
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
    expect(normalizeRequestedScopes('customer_requests:create customer_requests:approve_each')).toEqual({
      mode: 'approve_each', scopes: [MARKET_OPERATIONS_INVOKE_SCOPE, 'customer_requests:create', 'customer_requests:approve_each'],
    })
    expect(normalizeRequestedScopes('customer_requests:create customer_requests:approve_each customer_requests:full_yolo')).toBeUndefined()
    expect(normalizeRequestedScopes('customer_requests:create customer_requests:standing_authority')).toBeUndefined()
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
