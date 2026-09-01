import { describe, expect, it } from 'vitest'

import { CUSTOMER_REQUEST_BOUNDED_MANDATE_SCOPE, MARKET_OPERATIONS_INVOKE_SCOPE, MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'
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
  resetGrantDelivery,
  type AgentAccessOAuthClient,
  type AgentAccessOAuthGrant,
  type AgentAccessOAuthStore,
} from '@/modules/agent-access/oauth-state'

function storeFixture(): AgentAccessOAuthStore & {
  grants: Map<string, AgentAccessOAuthGrant>
  updates: Array<Readonly<{
    expectedStatus: AgentAccessOAuthGrant['status']
    expectedRevision: number
    patchStatus?: AgentAccessOAuthGrant['status']
    expectedIssuanceStartedAt?: number
  }>>
} {
  const grants = new Map<string, AgentAccessOAuthGrant>()
  const updates: Array<Readonly<{
    expectedStatus: AgentAccessOAuthGrant['status']
    expectedRevision: number
    patchStatus?: AgentAccessOAuthGrant['status']
    expectedIssuanceStartedAt?: number
  }>> = []
  return {
    grants,
    updates,
    async insertGrant(grant) { grants.set(grant.grantRef, grant) },
    async getGrantByHash(kind, hash) {
      for (const grant of grants.values()) {
        const value = kind === 'device' ? grant.deviceCodeHash : kind === 'user' ? grant.userCodeHash : grant.authorizationCodeHash
        if (value === hash) return grant
      }
      return null
    },
    async getGrantByRef(grantRef) { return grants.get(grantRef) ?? null },
    async updateGrant(grantRef, expectedStatus, expectedRevision, patch, expectedIssuanceStartedAt) {
      const current = grants.get(grantRef)
      updates.push({
        expectedStatus,
        expectedRevision,
        ...(patch.status === undefined ? {} : { patchStatus: patch.status }),
        ...(expectedIssuanceStartedAt === undefined ? {} : { expectedIssuanceStartedAt }),
      })
      if (current === undefined
        || current.status !== expectedStatus
        || current.revision !== expectedRevision
        || (expectedIssuanceStartedAt !== undefined
          && current.issuanceStartedAt !== expectedIssuanceStartedAt)) return null
      const pollScheduleOnly = Object.keys(patch).length === 1 && patch.nextPollAt !== undefined
      const updated = { ...current, ...patch, revision: pollScheduleOnly ? current.revision : current.revision + 1 }
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
const operationRefA = `operation:v1:${'a'.repeat(64)}`
const operationRefB = `operation:v1:${'b'.repeat(64)}`

async function beginDirectGrant(
  flow: 'device_code' | 'authorization_code',
  store: AgentAccessOAuthStore,
  requestedAccess: AgentAccessOAuthGrant['requestedAccess'],
  requestedScopes: readonly string[] = scopes,
) {
  return flow === 'device_code'
    ? await beginDeviceGrant(store, { client: deviceClient, requestedScopes, requestedAccess, now: 1_000 })
    : await beginAuthorizationCodeGrant(store, {
        client: authClient,
        redirectUri: 'http://localhost/callback',
        requestedScopes,
        requestedAccess,
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
        ownerId: 'owner-one',
        now: 1_000,
      })
}

async function deviceGrant(store: AgentAccessOAuthStore) {
  const result = await beginDeviceGrant(store, { client: deviceClient, requestedScopes: scopes, now: 1_000 })
  if (result.kind !== 'ok') throw new Error('device grant did not begin')
  return result.value
}

async function reserveForApproval(
  store: AgentAccessOAuthStore,
  grant: AgentAccessOAuthGrant,
  target: AgentAccessOAuthGrant['connectionTarget'] = { kind: 'new_agent', displayName: grant.displayName },
  ownerId = 'owner-one',
  reservedAt = 1_000,
): Promise<AgentAccessOAuthGrant> {
  const reserved = await store.updateGrant(grant.grantRef, 'pending', grant.revision, {
    status: 'issuing',
    ownerId,
    issuanceKey: `oauth-${grant.grantRef.replaceAll(':', '-')}`,
    issuanceStartedAt: reservedAt,
    connectionTarget: target,
    consequenceReservation: {
      action: target.kind === 'new_agent' ? 'agent_access.create' : 'agent_access.replace_credential',
      commandDigest: 'sha256:test-reservation',
      targetRevision: 1,
      reservedAt,
    },
  })
  if (reserved === null) throw new Error('grant reservation failed')
  return reserved
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
      profile: 'market',
    })
    expect(normalizeRequestedScopes('customer_requests:create customer_requests:approve_each')).toBeUndefined()
    expect(normalizeRequestedScopes(`${MARKET_OPERATIONS_INVOKE_SCOPE} ${CUSTOMER_REQUEST_BOUNDED_MANDATE_SCOPE}`)).toEqual({
      mode: 'bounded_mandate',
      scopes: [MARKET_OPERATIONS_INVOKE_SCOPE, CUSTOMER_REQUEST_BOUNDED_MANDATE_SCOPE],
      profile: 'market',
    })
    expect(normalizeRequestedScopes(MARKET_SUPPLY_MANAGE_SCOPE)).toEqual({
      mode: 'bounded_mandate',
      scopes: [MARKET_SUPPLY_MANAGE_SCOPE],
      profile: 'supplier',
    })
    expect(normalizeRequestedScopes(`${MARKET_SUPPLY_MANAGE_SCOPE} ${MARKET_OPERATIONS_INVOKE_SCOPE}`)).toBeUndefined()
    expect(normalizeRequestedScopes('customer_requests:create customer_requests:approve_each customer_requests:full_yolo')).toBeUndefined()
    expect(normalizeRequestedScopes('customer_requests:create customer_requests:standing_authority')).toBeUndefined()
  })

  it('persists explicit requested access for both flows and the exact default when absent', async () => {
    const requestedAccess = {
      environment: 'production' as const,
      operationAccess: 'selected_operations' as const,
      operationRefs: [`operation:v1:${'a'.repeat(64)}`],
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
      operationAccess: 'all_admitted' as const,
      operationRefs: [],
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
    expect(deviceResult.value.grant.revision).toBe(1)
    expect(authResult.value.grant.revision).toBe(1)
  })

  it.each(['device_code', 'authorization_code'] as const)(
    'canonicalizes direct %s selected-Operation requests before insert',
    async (flow) => {
      const store = storeFixture()
      const result = await beginDirectGrant(flow, store, {
        environment: 'sandbox',
        operationAccess: 'selected_operations',
        operationRefs: [operationRefB, operationRefA],
        expiresInSeconds: 600,
      })
      expect(result.kind).toBe('ok')
      expect([...store.grants.values()][0]?.requestedAccess).toMatchObject({
        operationAccess: 'selected_operations', operationRefs: [operationRefA, operationRefB],
      })
      expect(store.grants.size).toBe(1)
    },
  )

  it.each(['device_code', 'authorization_code'] as const)(
    'refuses invalid direct %s Operation selection before insert',
    async (flow) => {
      const invalidSelections = [
        { operationAccess: 'selected_operations' as const, operationRefs: [] },
        { operationAccess: 'selected_operations' as const, operationRefs: [operationRefA, operationRefA] },
        { operationAccess: 'selected_operations' as const, operationRefs: ['operation:not-canonical'] },
        { operationAccess: 'all_admitted' as const, operationRefs: [operationRefA] },
      ]
      for (const selection of invalidSelections) {
        const store = storeFixture()
        await expect(beginDirectGrant(flow, store, {
          environment: 'sandbox', ...selection, expiresInSeconds: 600,
        })).resolves.toEqual({ kind: 'refused', reason: 'invalid_scope' })
        expect(store.grants.size).toBe(0)
      }
    },
  )

  it.each(['device_code', 'authorization_code'] as const)(
    'refuses direct %s supplier-selected access before insert',
    async (flow) => {
      const store = storeFixture()
      await expect(beginDirectGrant(flow, store, {
        environment: 'sandbox', operationAccess: 'selected_operations', operationRefs: [operationRefA], expiresInSeconds: 600,
      }, [MARKET_SUPPLY_MANAGE_SCOPE])).resolves.toEqual({ kind: 'refused', reason: 'invalid_scope' })
      expect(store.grants.size).toBe(0)
    },
  )

  it('requires the current revision and increments it exactly once on a successful transition', async () => {
    const store = storeFixture()
    const started = await deviceGrant(store)

    await expect(store.updateGrant(started.grant.grantRef, 'pending', 0, {
      ownerId: 'owner-one',
    })).resolves.toBeNull()
    expect(store.grants.get(started.grant.grantRef)?.revision).toBe(1)

    await expect(store.updateGrant(started.grant.grantRef, 'pending', 1, {
      ownerId: 'owner-one',
    })).resolves.toMatchObject({ revision: 2, ownerId: 'owner-one' })
    expect(store.grants.get(started.grant.grantRef)?.revision).toBe(2)
  })

  it('preserves exact supplier scope through owner approval and refuses mode tampering', async () => {
    const store = storeFixture()
    const started = await beginDeviceGrant(store, {
      client: deviceClient,
      requestedScopes: [MARKET_SUPPLY_MANAGE_SCOPE],
      now: 1_000,
    })
    if (started.kind !== 'ok') throw new Error('supplier grant did not begin')
    await reserveForApproval(store, started.value.grant)
    const issuedScopes: string[][] = []
    const approved = await approveGrant(store, {
      grantRef: started.value.grant.grantRef,
      ownerId: 'owner-one',
      now: 1_001,
      authorityMode: 'bounded_mandate',
      issueKey: async ({ grant }) => {
        issuedScopes.push([...grant.requestedScopes])
        return { keyId: 'key_supplier' }
      },
    })
    expect(approved.kind).toBe('ok')
    expect(issuedScopes).toEqual([[MARKET_SUPPLY_MANAGE_SCOPE]])
    if (approved.kind === 'ok') expect(approved.value.grant.requestedScopes).toEqual([MARKET_SUPPLY_MANAGE_SCOPE])

    const tamperedStore = storeFixture()
    const tampered = await beginDeviceGrant(tamperedStore, { client: deviceClient, requestedScopes: [MARKET_SUPPLY_MANAGE_SCOPE], now: 1_000 })
    if (tampered.kind !== 'ok') throw new Error('supplier grant did not begin')
    await reserveForApproval(tamperedStore, tampered.value.grant)
    await expect(approveGrant(tamperedStore, {
      grantRef: tampered.value.grant.grantRef,
      ownerId: 'owner-one',
      now: 1_001,
      authorityMode: 'inspect_only',
      issueKey,
    })).resolves.toEqual({ kind: 'refused', reason: 'invalid_scope' })
  })

  it('enforces expiry and owner binding inside consent transitions', async () => {
    const store = storeFixture()
    const started = await deviceGrant(store)
    await reserveForApproval(store, started.grant)
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
    await reserveForApproval(validStore, authStarted.value.grant)
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
    expect(store.grants.get(started.grant.grantRef)).toMatchObject({ revision: 1, nextPollAt: 6_000 })
  })

  it('keeps polling pending when approval wins the pending poll update race', async () => {
    const store = storeFixture()
    const started = await deviceGrant(store)
    const racingStore: AgentAccessOAuthStore = {
      ...store,
      updateGrant: async (grantRef, expectedStatus, expectedRevision, patch, expectedIssuanceStartedAt) => {
        if (expectedStatus === 'pending' && patch.nextPollAt !== undefined) {
          const current = store.grants.get(grantRef)
          if (current === undefined) throw new Error('racing grant missing')
          store.grants.set(grantRef, {
            ...current,
            status: 'approved',
            revision: current.revision + 1,
            ownerId: 'owner-one',
            keyId: 'key-approved-concurrently',
            approvedAt: 1_000,
          })
          return null
        }
        return await store.updateGrant(
          grantRef,
          expectedStatus,
          expectedRevision,
          patch,
          expectedIssuanceStartedAt,
        )
      },
    }

    await expect(pollDeviceGrant(racingStore, {
      clientId: deviceClient.clientId,
      deviceCode: started.deviceCode,
      now: 1_000,
    })).resolves.toEqual({ kind: 'authorization_pending' })
    expect(store.grants.get(started.grant.grantRef)).toMatchObject({
      status: 'approved',
      keyId: 'key-approved-concurrently',
    })
  })

  it('refuses denied grants and bounds completed delivery replay to the original exchange', async () => {
    const deniedStore = storeFixture()
    const deniedStarted = await deviceGrant(deniedStore)
    const denied = await denyGrant(deniedStore, { userCode: deniedStarted.userCode, ownerId: 'owner-one', now: 1_001 })
    expect(denied.kind).toBe('ok')
    const deniedReplay = await approveGrant(deniedStore, { userCode: deniedStarted.userCode, ownerId: 'owner-one', now: 1_002, issueKey })
    expect(deniedReplay).toEqual({ kind: 'refused', reason: 'invalid_grant' })

    const consumedStore = storeFixture()
    const consumedStarted = await deviceGrant(consumedStore)
    await reserveForApproval(consumedStore, consumedStarted.grant)
    const approved = await approveGrant(consumedStore, { grantRef: consumedStarted.grant.grantRef, ownerId: 'owner-one', now: 1_001, issueKey })
    if (approved.kind !== 'ok') throw new Error('approval failed')
    const claimed = await claimGrantDelivery(consumedStore, { credential: { kind: 'device', grantRef: approved.value.grant.grantRef, clientId: deviceClient.clientId }, now: 1_002 })
    if (claimed.kind !== 'ok') throw new Error('claim failed')
    await completeGrantDelivery(consumedStore, { grantRef: claimed.value.grant.grantRef, claimToken: claimed.value.claimToken, now: 1_003 })
    const replay = await claimGrantDelivery(consumedStore, { credential: { kind: 'device', grantRef: approved.value.grant.grantRef, clientId: deviceClient.clientId }, now: 1_004 })
    expect(replay.kind).toBe('ok')
    const wrongClient = await claimGrantDelivery(consumedStore, { credential: { kind: 'device', grantRef: approved.value.grant.grantRef, clientId: 'client-other' }, now: 1_004 })
    expect(wrongClient).toEqual({ kind: 'refused', reason: 'invalid_grant' })
    const replayNearGrantExpiry = await claimGrantDelivery(consumedStore, { credential: { kind: 'device', grantRef: approved.value.grant.grantRef, clientId: deviceClient.clientId }, now: consumedStarted.grant.expiresAt - 1 })
    expect(replayNearGrantExpiry.kind).toBe('ok')
    const lateReplay = await claimGrantDelivery(consumedStore, { credential: { kind: 'device', grantRef: approved.value.grant.grantRef, clientId: deviceClient.clientId }, now: consumedStarted.grant.expiresAt })
    expect(lateReplay).toEqual({ kind: 'refused', reason: 'expired_token' })
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
    await reserveForApproval(store, started.value.grant)
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
    await reserveForApproval(store, started.grant)
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
    await reserveForApproval(store, started.grant)
    let issueCount = 0
    const results = await Promise.all([
      approveGrant(store, { grantRef: started.grant.grantRef, ownerId: 'owner-one', now: 1_001, issueKey: async () => { issueCount += 1; await Promise.resolve(); return { keyId: 'key-one' } } }),
      approveGrant(store, { grantRef: started.grant.grantRef, ownerId: 'owner-one', now: 1_001, issueKey: async () => { issueCount += 1; await Promise.resolve(); return { keyId: 'key-two' } } }),
    ])
    expect(results.filter((result) => result.kind === 'ok')).toHaveLength(1)
    expect(results.filter((result) => result.kind === 'outcome_unknown')).toHaveLength(1)
    expect(issueCount).toBe(1)
    expect(store.grants.get(started.grant.grantRef)?.status).toBe('approved')
  })

  it('does not redispatch a reservation whose issuance already started', async () => {
    const store = storeFixture()
    const started = await deviceGrant(store)
    const reserved = await reserveForApproval(
      store,
      started.grant,
      { kind: 'replace_credential', principalRef: 'prn_agent_a' },
      'owner-one',
      1_001,
    )
    await store.updateGrant(reserved.grantRef, 'issuing', reserved.revision, { issuanceStartedAt: 1_002 }, 1_001)
    let issued = false
    const resumed = await approveGrant(store, {
      grantRef: started.grant.grantRef,
      ownerId: 'owner-one',
      now: 31_001,
      issueKey: async () => {
        issued = true
        return { keyId: 'key-resumed' }
      },
    })
    expect(resumed.kind).toBe('outcome_unknown')
    expect(issued).toBe(false)
    expect(store.grants.get(started.grant.grantRef)?.status).toBe('issuing')
    expect(store.grants.get(started.grant.grantRef)?.issuanceKey).toBe(`oauth-${started.grant.grantRef.replaceAll(':', '-')}`)
    expect(store.updates).not.toContainEqual(expect.objectContaining({
      expectedStatus: 'issuing',
      patchStatus: 'pending',
    }))
  })

  it('lets only one approval claim the persisted reservation', async () => {
    const store = storeFixture()
    const started = await deviceGrant(store)
    await reserveForApproval(store, started.grant, undefined, 'owner-one', 1_001)
    let issueCount = 0
    const recover = () => approveGrant(store, {
      grantRef: started.grant.grantRef,
      ownerId: 'owner-one',
      now: 31_001,
      issueKey: async ({ grant }) => {
        issueCount += 1
        expect(grant.issuanceKey).toBe(`oauth-${started.grant.grantRef.replaceAll(':', '-')}`)
        await Promise.resolve()
        return { keyId: 'key-recovered' }
      },
    })
    const results = await Promise.all([recover(), recover()])
    expect(results.filter((result) => result.kind === 'ok')).toHaveLength(1)
    expect(results.filter((result) => result.kind === 'outcome_unknown')).toHaveLength(1)
    expect(issueCount).toBe(1)
  })

  it('does not approve or reset after the acquired issuance lease is lost', async () => {
    for (const outcome of ['issued', 'threw', 'missing_key'] as const) {
      const store = storeFixture()
      const started = await deviceGrant(store)
      await reserveForApproval(store, started.grant)
      const grantRef = started.grant.grantRef
      const result = await approveGrant(store, {
        grantRef,
        ownerId: 'owner-one',
        now: 1_001,
        issueKey: async () => {
          const current = store.grants.get(grantRef)
          if (current === undefined) throw new Error('reserved grant missing')
          store.grants.set(grantRef, { ...current, issuanceStartedAt: 1_002 })
          if (outcome === 'threw') throw new Error('old issuer failed')
          return { keyId: outcome === 'missing_key' ? '' : 'key-from-old-issuer' }
        },
      })

      expect(result.kind).toBe('outcome_unknown')
      expect(store.grants.get(grantRef)).toMatchObject({
        status: 'issuing',
        issuanceStartedAt: 1_002,
      })
      expect(store.grants.get(grantRef)?.keyId).toBeUndefined()
    }
  })

  it('defaults approval to a new durable agent and persists the explicit target', async () => {
    const store = storeFixture()
    const started = await deviceGrant(store)
    await reserveForApproval(store, started.grant)
    const targets: unknown[] = []
    const approved = await approveGrant(store, {
      grantRef: started.grant.grantRef,
      ownerId: 'owner-one',
      now: 1_001,
      issueKey: async ({ target }) => {
        targets.push(target)
        return { keyId: 'key-new' }
      },
    })
    expect(targets).toEqual([{ kind: 'new_agent', displayName: 'Device assistant' }])
    if (approved.kind !== 'ok') throw new Error('approval failed')
    expect(approved.value.grant.connectionTarget).toEqual({ kind: 'new_agent', displayName: 'Device assistant' })
  })

  it('binds replacement to an explicit principal and carries canonical successor material', async () => {
    const store = storeFixture()
    const started = await deviceGrant(store)
    await reserveForApproval(store, started.grant, { kind: 'replace_credential', principalRef: 'prn_agent_a' })
    const approved = await approveGrant(store, {
      grantRef: started.grant.grantRef,
      ownerId: 'owner-one',
      now: 1_001,
      connectionTarget: { kind: 'replace_credential', principalRef: 'prn_agent_a' },
      issueKey: async ({ target }) => {
        expect(target).toEqual({ kind: 'replace_credential', principalRef: 'prn_agent_a' })
        return {
          keyId: 'key-successor',
          replacement: {
            principalRef: 'prn_agent_a',
            generation: 2,
            successorCredentialRef: 'crd_successor',
            predecessorCredentialRef: 'crd_predecessor',
            predecessorKeyId: 'key-predecessor',
            successorGrantRef: 'grt_successor',
          },
        }
      },
    })
    if (approved.kind !== 'ok') throw new Error('approval failed')
    expect(approved.value.grant.connectionTarget).toEqual({ kind: 'replace_credential', principalRef: 'prn_agent_a' })
    expect(approved.value.grant.replacement).toEqual({
      principalRef: 'prn_agent_a',
      generation: 2,
      successorCredentialRef: 'crd_successor',
      predecessorCredentialRef: 'crd_predecessor',
      predecessorKeyId: 'key-predecessor',
      successorGrantRef: 'grt_successor',
    })
  })

  it('refuses a replacement without a concrete principal before issuing a key', async () => {
    const store = storeFixture()
    const started = await deviceGrant(store)
    await reserveForApproval(store, started.grant, { kind: 'replace_credential', principalRef: '   ' })
    let issued = false
    await expect(approveGrant(store, {
      grantRef: started.grant.grantRef,
      ownerId: 'owner-one',
      now: 1_001,
      connectionTarget: { kind: 'replace_credential', principalRef: '   ' },
      issueKey: async () => {
        issued = true
        return { keyId: 'should-not-exist' }
      },
    })).resolves.toEqual({ kind: 'refused', reason: 'invalid_target' })
    expect(issued).toBe(false)
  })
})
