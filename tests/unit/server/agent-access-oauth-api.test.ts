import { describe, expect, it, vi } from 'vitest'
import { AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST, MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'
import { AGENT_ACCESS_KEY_TTL_SECONDS } from '@/modules/agent-access/agent-access'

import {
  handleDeviceAuthorizationPost,
  handleOAuthAuthorizeGet,
  handleOAuthConsentPost,
  handleOAuthRegisterPost,
  handleOAuthTokenPost,
  type OAuthApiOptions,
} from '@/lib/server/agent-access-oauth-api'
import { parseAuthorizationDetails } from '@/lib/server/agent-access-oauth/protocol'
import { createLocalE2EAgentAccessKeyApi } from '@/lib/server/local-e2e-agent-key'
import { LOCAL_E2E_OPERATOR_PRINCIPAL } from '@/lib/server/local-e2e-bypass'
import { defaultSandboxAgentAccessPolicy } from '@/modules/agent-access/sandbox-policy'
import {
  buildProductionAgentAccessPolicy,
  defaultProductionAgentAccessPolicy,
} from '@/modules/agent-access/production-policy'
import {
  hashOAuthValue,
  requestedScopesForMode,
  type AgentAccessOAuthClient,
  type AgentAccessOAuthGrant,
  type AgentAccessOAuthStore,
} from '@/modules/agent-access/oauth-state'

const strictAuthObject: NonNullable<OAuthApiOptions['authObject']> = {
  isAuthenticated: true,
  userId: 'user_local',
  has: () => true,
  sessionClaims: { reverification_id: 'rev_test_consent' },
  factorVerificationAge: [0, 0],
  getToken: async () => 'convex-test-token',
}
const allOperations = { operationAccess: 'all_admitted' as const, operationRefs: [] as const }
const operationRefA = `operation:v1:${'a'.repeat(64)}`
const operationRefB = `operation:v1:${'b'.repeat(64)}`

function consentSecurity(store: ReturnType<typeof storeFixture>, ownerId = 'user_local'): Pick<OAuthApiOptions, 'authObject' | 'reserveConsent'> {
  const authObject = { ...strictAuthObject, userId: ownerId }
  const reservations = new Map<string, Readonly<{
    ownerId: string
    expectedGrantRevision: number
    expectedTargetRevision: number
    authorityMode: string
    connectionTarget: string
    reverificationId: string
  }>>()
  return {
    authObject,
    reserveConsent: async (input) => {
      const current = store.grants.get(input.grantRef)
      const existing = reservations.get(input.grantRef)
      const connectionTargetKey = input.connectionTarget.kind === 'new_agent'
        ? input.connectionTarget.kind
        : `${input.connectionTarget.kind}:${input.connectionTarget.principalRef}:${input.connectionTarget.replacementMode}`
      if (current !== undefined
        && (current.status === 'issuing'
          || current.status === 'approved'
          || current.status === 'delivery_claimed'
          || current.status === 'consumed')
        && existing !== undefined) {
        const exactReplay = existing.ownerId === ownerId
          && existing.expectedGrantRevision === input.expectedGrantRevision
          && existing.expectedTargetRevision === input.expectedTargetRevision
          && existing.authorityMode === input.authorityMode
          && existing.connectionTarget === connectionTargetKey
          && existing.reverificationId === input.proof?.reverificationId
        return exactReplay
          ? {
              kind: 'replayed',
              grantRef: current.grantRef,
              grantRevision: current.revision,
              commandDigest: 'sha256:test-consent-command',
              correlationRef: `oauth:grant:${current.grantRef}:reserve:${input.expectedGrantRevision}`,
            }
          : { kind: 'refused', code: 'command_changed' }
      }
      if (current === undefined || current.status !== 'pending' || current.revision !== input.expectedGrantRevision) {
        return { kind: 'conflict', code: 'stale_grant' }
      }
      const selectedScopes = current.requestedScopes.includes(MARKET_SUPPLY_MANAGE_SCOPE)
        ? [...current.requestedScopes]
        : requestedScopesForMode(input.authorityMode)
      const connectionTarget = input.connectionTarget.kind === 'new_agent'
        ? { kind: 'new_agent' as const, displayName: current.displayName }
        : input.connectionTarget
      const reservedAt = 1_000
      const updated = await store.updateGrant(current.grantRef, 'pending', current.revision, {
        status: 'issuing',
        ownerId,
        requestedScopes: selectedScopes,
        approvedAccess: {
          ...current.requestedAccess,
          operationAccess: input.approvedOperationAccess,
          operationRefs: [...input.approvedOperationRefs],
        },
        connectionTarget,
        issuanceKey: `oauth-${current.grantRef.replaceAll(':', '-')}`,
        issuanceStartedAt: reservedAt,
        consequenceReservation: {
          action: connectionTarget.kind === 'new_agent' ? 'agent_access.create' : 'agent_access.replace_credential',
          commandDigest: 'sha256:test-consent-command',
          targetRevision: input.expectedTargetRevision,
          reservedAt,
          ...(connectionTarget.kind === 'replace_credential' ? {
            predecessor: {
              credentialId: 'ak_predecessor',
              credentialRef: 'crd_predecessor',
            },
          } : {}),
        },
      })
      if (updated === null) return { kind: 'conflict', code: 'stale_grant' }
      reservations.set(input.grantRef, {
        ownerId,
        expectedGrantRevision: input.expectedGrantRevision,
        expectedTargetRevision: input.expectedTargetRevision,
        authorityMode: input.authorityMode,
        connectionTarget: connectionTargetKey,
        reverificationId: input.proof?.reverificationId ?? '',
      })
      return {
        kind: 'reserved',
        grantRef: updated.grantRef,
        grantRevision: updated.revision,
        commandDigest: 'sha256:test-consent-command',
        correlationRef: `oauth:grant:${current.grantRef}:reserve:${current.revision}`,
      }
    },
  }
}

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
    async updateGrant(grantRef, expectedStatus, expectedRevision, patch, expectedIssuanceStartedAt) {
      const current = grants.get(grantRef)
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
    async insertClient(client) { clients.set(client.clientId, client) },
    async getClient(clientId) { return clients.get(clientId) ?? null },
  }
}

const formRequest = (url: string, values: Record<string, string>, origin = new URL(url).origin): Request => {
  const body = new URLSearchParams(values)
  if (new URL(url).pathname === '/oauth/authorize' && values.decision === 'approve') {
    if (!body.has('approved_operation_access')) body.set('approved_operation_access', 'all_admitted')
    if (values.connection_target === 'replace_credential' && !body.has('replacement_mode')) {
      body.set('replacement_mode', 'planned')
    }
  }
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', Origin: origin },
    body,
  })
}

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
  ...allOperations,
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
  it('normalizes exact Operation selection and rejects partial or malformed authorization details', () => {
    const detail = (selection: Record<string, unknown> = {}) => JSON.stringify([{
      type: 'agentic_economy_market_operations',
      environment: 'sandbox',
      expires_in_seconds: 600,
      ...selection,
    }])
    expect(parseAuthorizationDetails(detail())).toMatchObject({
      kind: 'ok', requestedAccess: { operationAccess: 'all_admitted', operationRefs: [] },
    })
    expect(parseAuthorizationDetails(detail({
      operation_access: 'selected_operations', operation_refs: [operationRefB, operationRefA],
    }))).toMatchObject({
      kind: 'ok', requestedAccess: { operationAccess: 'selected_operations', operationRefs: [operationRefA, operationRefB] },
    })
    expect(parseAuthorizationDetails(detail({ operation_access: 'selected_operations' }))).toEqual({ kind: 'invalid' })
    expect(parseAuthorizationDetails(detail({ operation_access: 'selected_operations', operation_refs: [operationRefA, operationRefA] }))).toEqual({ kind: 'invalid' })
    expect(parseAuthorizationDetails(detail({ operation_access: 'selected_operations', operation_refs: [] }))).toEqual({ kind: 'invalid' })
    expect(parseAuthorizationDetails(detail({ operation_access: 'all_admitted', operation_refs: [operationRefA] }))).toEqual({ kind: 'invalid' })
    expect(parseAuthorizationDetails(detail({ operation_access: 'selected_operations', operation_refs: Array.from({ length: 65 }, (_, index) => `operation:v1:${String(index).padStart(64, '0')}`) }))).toEqual({ kind: 'invalid' })
  })

  it('issues bounded device state, slows polling, and safely replays an interrupted delivery', async () => {
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
    expect(grant.requestedAccess).toEqual({ environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS })
    await store.updateGrant(grant.grantRef, 'pending', grant.revision, { status: 'approved', keyId: 'ak_local', ownerId: 'user_local' })
    const delivered = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: 'client-local', device_code: body.device_code,
    }), options)
    expect(await delivered.json()).toMatchObject({ access_token: 'secret-local', token_type: 'Bearer', scope: 'market_operations:invoke customer_requests:approve_each', expires_in: 604800 })
    const replay = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: 'client-local', device_code: body.device_code,
    }), options)
    expect(await replay.json()).toMatchObject({ access_token: 'secret-local', token_type: 'Bearer' })
  })

  it('promotes an explicitly selected agent only after successor delivery and safely retries provider cleanup', async () => {
    const store = storeFixture()
    await store.insertClient({
      clientId: 'client-replacement', clientName: 'Replacement CLI', redirectUris: ['http://localhost/callback'],
      grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000,
    })
    const replacement = {
      principalRef: 'prn_agent_a', generation: 2, successorCredentialRef: 'crd_successor',
      predecessorCredentialRef: 'crd_predecessor', predecessorKeyId: 'ak_predecessor', successorGrantRef: 'grt_successor',
    } as const
    const promoted: string[] = []
    const revoked: string[] = []
    const recorded: string[] = []
    let revokeAttempt = 0
    let recordAttempt = 0
    let providerRevoked = false
    const options: OAuthApiOptions = {
      store,
      ...consentSecurity(store),
      now: () => 1_000,
      canonicalBaseUrl: 'http://localhost',
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
      issueKey: async (input) => {
        expect(input.target).toEqual({
          kind: 'replace_credential',
          principalRef: 'prn_agent_a',
          replacementMode: 'planned',
        })
        return { keyId: 'ak_successor', replacement }
      },
      getSecret: async () => ({ secret: 'successor-secret-once' }),
      promoteReplacement: async (value) => {
        promoted.push(value.principalRef)
        return { kind: promoted.length === 1 ? 'completed' : 'replayed', providerCredentialId: 'ak_predecessor' }
      },
      getProviderCredential: async () => ({ revoked: providerRevoked }),
      revokeProviderCredential: async (credentialId) => {
        revokeAttempt += 1
        if (revokeAttempt === 1) throw new Error('provider temporarily unavailable')
        providerRevoked = true
        revoked.push(credentialId)
      },
      recordProviderRevocation: async (input) => {
        recordAttempt += 1
        if (recordAttempt === 1) throw new Error('canonical record temporarily unavailable')
        recorded.push(`${input.principalRef}:${input.credentialRef}:${input.providerCredentialId}`)
        return { kind: 'completed' }
      },
    }
    const issued = await handleDeviceAuthorizationPost(formRequest('http://localhost/oauth/device_authorization', {
      client_id: 'client-replacement', scope: 'market_operations:invoke customer_requests:approve_each',
    }), options)
    const device = await issued.json() as { device_code: string }
    const grant = [...store.grants.values()][0]
    if (grant === undefined) throw new Error('replacement grant missing')
    const approved = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', {
      grant_ref: grant.grantRef,
      expected_grant_revision: String(grant.revision),
      expected_target_revision: '1',
      decision: 'approve',
      authority_mode: 'approve_each',
      connection_target: 'replace_credential',
      principal_ref: 'prn_agent_a',
    }), options)
    expect(approved.status).toBe(200)
    expect(store.grants.get(grant.grantRef)?.replacement).toEqual(replacement)

    const firstDelivery = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: 'client-replacement',
      device_code: device.device_code,
    }), options)
    expect(firstDelivery.status).toBe(503)
    await expect(firstDelivery.json()).resolves.toMatchObject({ error: 'server_error' })
    expect(store.grants.get(grant.grantRef)?.status).toBe('approved')
    expect(promoted).toEqual(['prn_agent_a'])
    expect(revoked).toEqual([])
    expect(recorded).toEqual([])

    const recordFailure = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: 'client-replacement',
      device_code: device.device_code,
    }), options)
    expect(recordFailure.status).toBe(503)
    await expect(recordFailure.json()).resolves.toMatchObject({ error: 'server_error' })
    expect(revoked).toEqual(['ak_predecessor'])
    expect(recorded).toEqual([])

    const delivered = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: 'client-replacement',
      device_code: device.device_code,
    }), options)
    await expect(delivered.json()).resolves.toMatchObject({ access_token: 'successor-secret-once' })
    expect(promoted).toEqual(['prn_agent_a', 'prn_agent_a', 'prn_agent_a'])
    expect(revoked).toEqual(['ak_predecessor'])
    expect(recorded).toEqual(['prn_agent_a:crd_predecessor:ak_predecessor'])
    expect(store.grants.get(grant.grantRef)?.status).toBe('consumed')
  })

  it('confirms compromised predecessor revocation before issuing the successor and keeps one recovery reference', async () => {
    const store = storeFixture()
    await store.insertClient({
      clientId: 'client-compromise', clientName: 'Compromise CLI', redirectUris: ['http://localhost/callback'],
      grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'],
      tokenEndpointAuthMethod: 'none', createdAt: 1_000,
    })
    const events: string[] = []
    let providerRevoked = false
    const options: OAuthApiOptions = {
      store,
      ...consentSecurity(store),
      now: () => 1_000,
      canonicalBaseUrl: 'http://localhost',
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
      getProviderCredential: async () => {
        events.push('confirm-provider-revocation')
        return { revoked: providerRevoked }
      },
      revokeProviderCredential: async (credentialId) => {
        events.push(`revoke:${credentialId}`)
        providerRevoked = true
      },
      recordProviderRevocation: async (input) => {
        events.push(`record:${input.correlationRef}`)
        return { kind: 'completed' }
      },
      issueKey: async (input) => {
        events.push('issue-successor')
        expect(input.target).toEqual({
          kind: 'replace_credential',
          principalRef: 'prn_agent_compromised',
          replacementMode: 'compromise',
        })
        return {
          keyId: 'ak_successor',
          replacement: {
            principalRef: 'prn_agent_compromised', generation: 2,
            successorCredentialRef: 'crd_successor', predecessorCredentialRef: 'crd_predecessor',
            predecessorKeyId: 'ak_predecessor', successorGrantRef: 'grt_successor',
          },
        }
      },
    }
    await handleDeviceAuthorizationPost(formRequest('http://localhost/oauth/device_authorization', {
      client_id: 'client-compromise', scope: 'market_operations:invoke customer_requests:approve_each',
    }), options)
    const grant = [...store.grants.values()][0]
    if (grant === undefined) throw new Error('compromise grant missing')
    const response = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', {
      grant_ref: grant.grantRef, expected_grant_revision: String(grant.revision), expected_target_revision: '1',
      decision: 'approve', authority_mode: 'approve_each', connection_target: 'replace_credential',
      principal_ref: 'prn_agent_compromised', replacement_mode: 'compromise',
    }), options)

    expect(response.status).toBe(200)
    const correlationRef = `oauth:grant:${grant.grantRef}:reserve:1`
    expect(events).toEqual([
      'confirm-provider-revocation',
      'revoke:ak_predecessor',
      'confirm-provider-revocation',
      `record:${correlationRef}`,
      'issue-successor',
    ])
    expect(store.grants.get(grant.grantRef)).toMatchObject({
      status: 'approved', keyId: 'ak_successor', connectionTarget: { replacementMode: 'compromise' },
    })
  })

  it('does not issue a compromise successor until provider revocation is authoritative', async () => {
    const store = storeFixture()
    await store.insertClient({
      clientId: 'client-compromise-unknown', clientName: 'Compromise recovery CLI', redirectUris: ['http://localhost/callback'],
      grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000,
    })
    const issueKey = vi.fn<NonNullable<OAuthApiOptions['issueKey']>>()
    const options: OAuthApiOptions = {
      store,
      ...consentSecurity(store),
      now: () => 1_000,
      canonicalBaseUrl: 'http://localhost',
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
      getProviderCredential: async () => ({ revoked: false }),
      revokeProviderCredential: async () => undefined,
      recordProviderRevocation: async () => ({ kind: 'completed' }),
      issueKey,
    }
    await handleDeviceAuthorizationPost(formRequest('http://localhost/oauth/device_authorization', {
      client_id: 'client-compromise-unknown', scope: 'market_operations:invoke customer_requests:approve_each',
    }), options)
    const grant = [...store.grants.values()][0]
    if (grant === undefined) throw new Error('compromise recovery grant missing')
    const request = () => handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', {
      grant_ref: grant.grantRef, expected_grant_revision: String(grant.revision), expected_target_revision: '1',
      decision: 'approve', authority_mode: 'approve_each', connection_target: 'replace_credential',
      principal_ref: 'prn_agent_compromised', replacement_mode: 'compromise',
    }), options)

    const first = await request()
    expect(first.status).toBe(202)
    await expect(first.json()).resolves.toEqual({
      kind: 'outcome_unknown', grantRef: grant.grantRef,
      readbackRef: `agent-access/oauth/${grant.grantRef}`,
      correlationRef: `oauth:grant:${grant.grantRef}:reserve:1`,
    })
    const replay = await request()
    expect(replay.status).toBe(202)
    await expect(replay.json()).resolves.toMatchObject({
      kind: 'outcome_unknown', correlationRef: `oauth:grant:${grant.grantRef}:reserve:1`,
    })
    expect(issueKey).not.toHaveBeenCalled()
    expect(store.grants.get(grant.grantRef)).toMatchObject({ status: 'issuing' })
    expect(store.grants.get(grant.grantRef)?.keyId).toBeUndefined()
  })

  it('does not let anonymous device polling finish an owner-bound issuance', async () => {
    const store = storeFixture()
    await store.insertClient({
      clientId: 'client-recovery', clientName: 'Recovery agent', redirectUris: [],
      grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000,
    })
    await store.insertGrant({
      grantRef: 'device:recovery', revision: 1, flow: 'device_code', clientId: 'client-recovery',
      requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'],
      requestedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: 600 },
      approvedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: 600 },
      deviceCodeHash: await hashOAuthValue('recover-device'), userCodeHash: await hashOAuthValue('RECOVER1'),
      status: 'issuing', ownerId: 'owner-one', createdAt: 1_000, expiresAt: 601_000,
      issuanceKey: 'oauth-device-recovery', issuanceStartedAt: 1_001,
      connectionTarget: { kind: 'new_agent', displayName: 'Recovery agent' },
      displayName: 'Recovery agent',
    })
    const issued: string[] = []
    const response = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: 'client-recovery',
      device_code: 'recover-device',
    }), {
      store,
      now: () => 31_001,
      issueKey: async (input) => {
        issued.push(input.idempotencyKey)
        return { keyId: 'ak_recovered' }
      },
      getSecret: async () => ({ secret: 'recovered-secret' }),
    })
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'server_error',
      error_description: 'The authorization server is temporarily unavailable.',
    })
    expect(issued).toEqual([])
    expect(store.grants.get('device:recovery')?.status).toBe('issuing')
  })

  it('cancels an unclaimed successor on expiry and leaves the predecessor current', async () => {
    const store = storeFixture()
    await store.insertClient({
      clientId: 'client-expired-replacement', clientName: 'Expired replacement', redirectUris: ['http://localhost/callback'],
      grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000,
    })
    const replacement = {
      principalRef: 'prn_agent_a', generation: 2, successorCredentialRef: 'crd_successor',
      predecessorCredentialRef: 'crd_predecessor', predecessorKeyId: 'ak_predecessor', successorGrantRef: 'grt_successor',
    } as const
    await store.insertGrant({
      grantRef: 'device:expired-replacement', revision: 1, flow: 'device_code', clientId: 'client-expired-replacement',
      requestedScopes: ['market_operations:invoke', 'customer_requests:approve_each'],
      requestedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: 600 },
      approvedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: 600 },
      deviceCodeHash: await hashOAuthValue('expired-device-code'), userCodeHash: 'expired-user-code',
      status: 'approved', ownerId: 'user_local', keyId: 'ak_successor', createdAt: 1_000, expiresAt: 2_000,
      nextPollAt: 1_000, displayName: 'Expired replacement',
      connectionTarget: { kind: 'replace_credential', principalRef: 'prn_agent_a', replacementMode: 'planned' }, replacement,
    })
    const cancelled: string[] = []
    const revoked: string[] = []
    const recorded: string[] = []
    let providerRevoked = false
    let recordAttempt = 0
    const options: OAuthApiOptions = {
      store,
      ...consentSecurity(store, 'user_supplier'),
      now: () => 2_000,
      cancelReplacement: async (value) => {
        cancelled.push(value.principalRef)
        return { kind: cancelled.length === 1 ? 'completed' : 'replayed', providerCredentialId: 'ak_successor' }
      },
      getProviderCredential: async () => ({ revoked: providerRevoked }),
      revokeProviderCredential: async (credentialId) => {
        providerRevoked = true
        revoked.push(credentialId)
      },
      recordProviderRevocation: async (input) => {
        recordAttempt += 1
        if (recordAttempt === 1) throw new Error('canonical record temporarily unavailable')
        recorded.push(`${input.principalRef}:${input.credentialRef}:${input.providerCredentialId}:${input.correlationRef}`)
        return { kind: 'completed' }
      },
    }
    const request = () => handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: 'client-expired-replacement',
      device_code: 'expired-device-code',
    }), options)
    const retryable = await request()
    expect(retryable.status).toBe(503)
    await expect(retryable.json()).resolves.toMatchObject({ error: 'server_error' })
    expect(revoked).toEqual(['ak_successor'])
    expect(recorded).toEqual([])

    const completed = await request()
    expect(completed.status).toBe(400)
    await expect(completed.json()).resolves.toMatchObject({ error: 'expired_token' })
    expect(cancelled).toEqual(['prn_agent_a', 'prn_agent_a'])
    expect(revoked).toEqual(['ak_successor'])
    expect(recorded).toEqual(['prn_agent_a:crd_successor:ak_successor:replacement-expired:grt_successor'])
    expect(store.grants.get('device:expired-replacement')?.status).toBe('expired')
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
    expect(authorization.status).toBe(302)
    const gate = new URL(authorization.headers.get('location')!)
    expect(gate.pathname).toBe('/agent-access/authorize')
    expect(gate.searchParams.get('state')).toBe('state-details')
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

  it('issues one exact owner-approved supplier credential through device OAuth', async () => {
    const store = storeFixture()
    const options: OAuthApiOptions = {
      store,
      ...consentSecurity(store, 'user_supplier'),
      now: () => 1_000,
      canonicalBaseUrl: 'http://localhost',
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_supplier' }),
      issueKey: async (input) => {
        expect(input.scopes).toEqual([MARKET_SUPPLY_MANAGE_SCOPE])
        expect(input.authorityMode).toBe('bounded_mandate')
        return { keyId: 'ak_supplier' }
      },
      getSecret: async () => ({ secret: 'supplier-secret-once' }),
    }
    const registration = await handleOAuthRegisterPost(new Request('http://localhost/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST,
        client_name: 'Agentic Economy Supplier CLI',
        scope: MARKET_SUPPLY_MANAGE_SCOPE,
      }),
    }), options)
    const registered = await registration.json() as { client_id: string; scope: string }
    expect(registered.scope).toBe(MARKET_SUPPLY_MANAGE_SCOPE)

    const selectedSupplier = await handleDeviceAuthorizationPost(formRequest('http://localhost/oauth/device_authorization', {
      client_id: registered.client_id,
      scope: MARKET_SUPPLY_MANAGE_SCOPE,
      authorization_details: JSON.stringify([{
        type: 'agentic_economy_market_operations', environment: 'sandbox', expires_in_seconds: 600,
        operation_access: 'selected_operations', operation_refs: [operationRefA],
      }]),
    }), options)
    expect(selectedSupplier.status).toBe(400)

    const device = await handleDeviceAuthorizationPost(formRequest('http://localhost/oauth/device_authorization', {
      client_id: registered.client_id,
      scope: MARKET_SUPPLY_MANAGE_SCOPE,
    }), options)
    const deviceGrant = await device.json() as { device_code: string; user_code: string }
    const consent = await handleOAuthAuthorizeGet(new Request(`http://localhost/oauth/authorize?user_code=${encodeURIComponent(deviceGrant.user_code)}`), options)
    const html = await consent.text()
    expect(html).toContain('data-access-profile="supplier"')
    expect(html).toContain(`Technical permission: ${MARKET_SUPPLY_MANAGE_SCOPE}`)
    expect(html).toContain('manage your published supplier Operations')

    const grant = [...store.grants.values()][0]
    if (grant === undefined) throw new Error('supplier grant missing')
    const approved = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', {
      grant_ref: grant.grantRef,
      expected_grant_revision: String(grant.revision),
      expected_target_revision: String(grant.revision),
      decision: 'approve',
      authority_mode: 'bounded_mandate',
      connection_target: 'new_agent',
    }), options)
    expect(approved.status).toBe(200)

    const token = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: registered.client_id,
      device_code: deviceGrant.device_code,
    }), options)
    await expect(token.json()).resolves.toMatchObject({
      access_token: 'supplier-secret-once',
      scope: MARKET_SUPPLY_MANAGE_SCOPE,
    })
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
    const consentStart = await handleOAuthAuthorizeGet(new Request('http://localhost/oauth/authorize?client_id=client-auth&redirect_uri=http%3A%2F%2Flocalhost%2Fcallback&response_type=code&state=s&scope=market_operations%3Ainvoke%20customer_requests%3Aapprove_each&code_challenge=abc&code_challenge_method=S256'), { store, now: () => 1_000, authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }) })
    expect(consentStart.status).toBe(302)
    const consent = await handleOAuthAuthorizeGet(new Request(consentStart.headers.get('location')!), { store, now: () => 1_000, authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }) })
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
    expect(sandboxGrant?.requestedAccess).toEqual({ environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS })
  })

  it('pages replacement targets with an opaque cursor and marks enrichment failures', async () => {
    const store = storeFixture()
    await store.insertClient({
      clientId: 'client-paged-consent',
      clientName: 'Paged CLI',
      redirectUris: [],
      grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'],
      tokenEndpointAuthMethod: 'none',
      createdAt: 1_000,
    })
    const device = await handleDeviceAuthorizationPost(formRequest('http://localhost/oauth/device_authorization', {
      client_id: 'client-paged-consent',
      scope: 'market_operations:invoke customer_requests:approve_each',
    }), { store, now: () => 1_000 })
    const grant = await device.json() as { user_code: string }
    const cursors: Array<string | null> = []
    const listAgents: NonNullable<OAuthApiOptions['listAgents']> = async (cursor) => {
      cursors.push(cursor)
      return cursor === null
        ? { items: [{ principalRef: 'prn_agent_a', principalRevision: 1, displayName: 'Agent A' }], nextCursor: 'opaque+/cursor==' }
        : { items: [{ principalRef: 'prn_agent_b', principalRevision: 2, displayName: 'Agent B' }] }
    }
    const base = `http://localhost/oauth/authorize?user_code=${encodeURIComponent(grant.user_code)}`
    const first = await handleOAuthAuthorizeGet(new Request(base), {
      store,
      now: () => 1_000,
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
      listAgents,
    })
    const firstHtml = await first.text()
    expect(firstHtml).toContain('Agent%20A')
    expect(firstHtml).toContain('data-agent-targets-next-cursor="opaque%2B%2Fcursor%3D%3D"')

    const second = await handleOAuthAuthorizeGet(new Request(`${base}&agent_cursor=${encodeURIComponent('opaque+/cursor==')}`), {
      store,
      now: () => 1_000,
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
      listAgents,
    })
    expect(await second.text()).toContain('Agent%20B')
    expect(cursors).toEqual([null, 'opaque+/cursor=='])

    const unavailable = await handleOAuthAuthorizeGet(new Request(base), {
      store,
      now: () => 1_000,
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
      listAgents: async () => { throw new Error('directory unavailable') },
    })
    const unavailableHtml = await unavailable.text()
    expect(unavailableHtml).toContain('data-agent-targets-unavailable="true"')
    expect(unavailableHtml).toContain('data-agent-targets="%5B%5D"')
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
    expect(controlledResponse.status).toBe(302)
    const controlledGate = await handleOAuthAuthorizeGet(new Request(controlledResponse.headers.get('location')!), options)
    const controlledHtml = await controlledGate.text()
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
    expect(zeroDefaultResponse.status).toBe(302)
    const zeroDefaultGate = await handleOAuthAuthorizeGet(new Request(zeroDefaultResponse.headers.get('location')!), options)
    expect(await zeroDefaultGate.text()).toContain('Spending is disabled by the zero default.')
  })

  it('derives sandbox, zero-budget, and bounded production issuance from persisted access', async () => {
    const store = storeFixture()
    await store.insertClient({ clientId: 'client-local', clientName: 'Local assistant', redirectUris: ['http://localhost/callback'], grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000 })
    await store.insertGrant({ grantRef: 'device:sandbox-issuance', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'], requestedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'sandbox-code', userCodeHash: 'sandbox-user', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Sandbox assistant' })
    await store.insertGrant({ grantRef: 'device:production-zero', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:approve_each'], requestedAccess: { environment: 'production', ...allOperations, expiresInSeconds: 1_234 }, approvedAccess: { environment: 'production', ...allOperations, expiresInSeconds: 1_234 }, deviceCodeHash: 'zero-code', userCodeHash: 'zero-user', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Zero assistant' })
    await store.insertGrant({ grantRef: 'device:production-bounded', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:bounded_mandate'], requestedAccess: productionRequestedAccess, approvedAccess: productionRequestedAccess, deviceCodeHash: await hashOAuthValue('bounded-code'), userCodeHash: 'bounded-user', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Bounded assistant' })
    const issued: OAuthIssueInput[] = []
    const options = {
      store,
      ...consentSecurity(store),
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
      const response = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: grantRef, expected_grant_revision: '1', expected_target_revision: '1', decision: 'approve', authority_mode: authorityMode, connection_target: 'new_agent' }), options)
      expect(response.status).toBe(200)
    }
    const retry = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: 'device:production-bounded', expected_grant_revision: '1', expected_target_revision: '1', decision: 'approve', authority_mode: 'bounded_mandate', connection_target: 'new_agent' }), options)
    expect(retry.status).toBe(200)
    expect(await retry.json()).toMatchObject({
      kind: 'approved',
      grantRef: 'device:production-bounded',
    })
    expect(issued).toHaveLength(3)
    expect(issued[0]?.approvedAccess).toEqual({ environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS })
    expect(issued[0]?.policy).toEqual(defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }))
    expect(issued[1]?.approvedAccess).toEqual({ environment: 'production', ...allOperations, expiresInSeconds: 1_234 })
    expect(issued[1]?.policy).toEqual(defaultProductionAgentAccessPolicy({ currency: 'USD', exponent: 2 }))
    const boundedBase = buildProductionAgentAccessPolicy({
      currency: 'USD',
      exponent: 2,
      maximumSpendPerInvocation: productionRequestedAccess.maximumSpendPerInvocation,
      maximumDailySpend: productionRequestedAccess.maximumDailySpend,
      maximumMonthlySpend: productionRequestedAccess.maximumMonthlySpend,
    })
    expect(issued[2]?.authorityMode).toBe('bounded_mandate')
    expect(issued[2]?.approvedAccess).toEqual(productionRequestedAccess)
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
    await store.insertGrant({ grantRef: 'device:full-yolo', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:full_yolo'], requestedAccess: { environment: 'production', ...allOperations, expiresInSeconds: 1_000 }, approvedAccess: { environment: 'production', ...allOperations, expiresInSeconds: 1_000 }, deviceCodeHash: 'full-code', userCodeHash: 'full-user', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Unsafe assistant' })
    await store.insertGrant({ grantRef: 'device:invalid-access', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:approve_each'], requestedAccess: { environment: 'production', ...allOperations, expiresInSeconds: 1_000, maximumSpendPerInvocation: { currency: 'USD', units: '100', exponent: 2 } }, approvedAccess: { environment: 'production', ...allOperations, expiresInSeconds: 1_000, maximumSpendPerInvocation: { currency: 'USD', units: '100', exponent: 2 } }, deviceCodeHash: 'invalid-code', userCodeHash: 'invalid-user', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Invalid assistant' })
    let issueCount = 0
    const options = {
      store,
      ...consentSecurity(store),
      now: () => 1_000,
      canonicalBaseUrl: 'http://localhost',
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
      issueKey: async () => { issueCount += 1; return { keyId: 'ak_should-not-exist' } },
    }
    const fullYolo = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: 'device:full-yolo', expected_grant_revision: '1', expected_target_revision: '1', decision: 'approve', authority_mode: 'full_yolo', connection_target: 'new_agent' }), options)
    const invalid = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: 'device:invalid-access', expected_grant_revision: '1', expected_target_revision: '1', decision: 'approve', authority_mode: 'approve_each', connection_target: 'new_agent' }), options)
    expect(fullYolo.status).toBe(202)
    expect(invalid.status).toBe(202)
    expect(issueCount).toBe(0)
    expect(store.grants.get('device:full-yolo')?.status).toBe('issuing')
    expect(store.grants.get('device:invalid-access')?.status).toBe('issuing')
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

  it('projects issuing consent as read-only recovery and rejects ambiguous locators', async () => {
    const store = storeFixture()
    await store.insertGrant({
      grantRef: 'device:issuing-recovery',
      revision: 2,
      flow: 'device_code',
      clientId: 'client-local',
      requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'],
      requestedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS },
      approvedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS },
      deviceCodeHash: 'device-hash',
      userCodeHash: await hashOAuthValue('ISSU-ING1'),
      status: 'issuing',
      ownerId: 'user_local',
      issuanceKey: 'oauth-device-issuing-recovery',
      issuanceStartedAt: 1_001,
      connectionTarget: { kind: 'new_agent', displayName: 'Recovery assistant' },
      consequenceReservation: {
        action: 'agent_access.create',
        commandDigest: 'sha256:recovery',
        targetRevision: 1,
        reservedAt: 1_000,
      },
      createdAt: 1_000,
      expiresAt: 601_000,
      displayName: 'Recovery assistant',
    })
    const options = {
      store,
      now: () => 2_000,
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
    }

    const response = await handleOAuthAuthorizeGet(new Request('http://localhost/oauth/authorize?user_code=ISSU-ING1'), options)
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(html).toContain('data-ae-consent-state="outcome_unknown"')
    expect(html).toContain('data-grant-ref="device:issuing-recovery"')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('Approve access')
    expect(store.grants.get('device:issuing-recovery')?.revision).toBe(2)

    const ambiguous = await handleOAuthAuthorizeGet(new Request('http://localhost/oauth/authorize?user_code=ISSU-ING1&grant_ref=device%3Aissuing-recovery'), options)
    expect(ambiguous.status).toBe(400)
    expect(await ambiguous.json()).toMatchObject({ error: 'invalid_request' })
  })

  it.each([
    ['ownerless', undefined],
    ['foreign-owned', 'user_foreign'],
  ])('does not expose %s issuing recovery to the signed-in owner', async (_case, grantOwnerId) => {
    const store = storeFixture()
    await store.insertGrant({
      grantRef: 'device:private-issuing',
      revision: 2,
      flow: 'device_code',
      clientId: 'client-local',
      requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'],
      requestedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS },
      approvedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS },
      userCodeHash: await hashOAuthValue('PRIV-ATE1'),
      status: 'issuing',
      ...(grantOwnerId === undefined ? {} : { ownerId: grantOwnerId }),
      issuanceKey: 'oauth-device-private-issuing',
      issuanceStartedAt: 1_001,
      connectionTarget: { kind: 'new_agent', displayName: 'Private assistant' },
      consequenceReservation: {
        action: 'agent_access.create',
        commandDigest: 'sha256:private-recovery',
        targetRevision: 1,
        reservedAt: 1_000,
      },
      createdAt: 1_000,
      expiresAt: 601_000,
      displayName: 'Private assistant',
    })

    const response = await handleOAuthAuthorizeGet(new Request('http://localhost/oauth/authorize?user_code=PRIV-ATE1'), {
      store,
      now: () => 2_000,
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
    })
    const body = await response.text()
    expect(response.status).toBe(403)
    expect(body).not.toContain('data-ae-consent-state')
    expect(body).not.toContain('device:private-issuing')
  })

  it.each(['approved', 'delivery_claimed', 'consumed'] as const)(
    'projects owner-matched %s consent as read-only completed state',
    async (status) => {
      const store = storeFixture()
      await store.insertGrant({
        grantRef: `device:completed-${status}`,
        revision: 3,
        flow: 'device_code',
        clientId: 'client-local',
        requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'],
        requestedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS },
        approvedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS },
        userCodeHash: await hashOAuthValue(`COMPLETE-${status}`),
        status,
        ownerId: 'user_local',
        keyId: 'key-private',
        createdAt: 1_000,
        expiresAt: 601_000,
        displayName: 'Completed assistant',
      })

      const response = await handleOAuthAuthorizeGet(new Request(`http://localhost/oauth/authorize?user_code=${encodeURIComponent(`COMPLETE-${status}`)}`), {
        store,
        now: () => 700_000,
        authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
      })
      const html = await response.text()
      expect(response.status).toBe(200)
      expect(html).toContain('data-ae-consent-state="succeeded"')
      expect(html).not.toContain('<form')
      expect(html).not.toContain('Approve access')
      expect(html).not.toContain('key-private')
      expect(html).toContain('This approval has completed. Open Agents for the current credential status.')
      expect(html).not.toContain('ready for one-time delivery')
    },
  )


  it('binds device consent to the signed-in owner and returns no key secret', async () => {
    const store = storeFixture()
    await store.insertGrant({ grantRef: 'device:1', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'], requestedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'd', userCodeHash: await hashOAuthValue('ABCD-EFGH'), status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Local assistant' })
    let issuedInput: OAuthIssueInput | undefined
    const response = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: 'device:1', expected_grant_revision: '1', expected_target_revision: '1', decision: 'approve', authority_mode: 'inspect_only', connection_target: 'new_agent' }), {
      store, ...consentSecurity(store), now: () => 1_000, canonicalBaseUrl: 'http://localhost', authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }), issueKey: async (input) => { issuedInput = input; return { keyId: 'ak_local' } },
    })
    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain('ak_local')
    expect(store.grants.get('device:1')?.status).toBe('approved')
    expect(issuedInput?.authorityMode).toBe('inspect_only')
    expect(issuedInput?.approvedAccess).toEqual({ environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS })
    expect(issuedInput?.policy).toEqual(defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }))
  })
  it('denies a pending grant without requiring approval proof or issuing a key', async () => {
    const store = storeFixture()
    await store.insertGrant({ grantRef: 'device:denied', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'], requestedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'd-denied', userCodeHash: 'u-denied', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Declined assistant' })
    const reserveConsent = vi.fn<NonNullable<OAuthApiOptions['reserveConsent']>>()
    const issueKey = vi.fn<NonNullable<OAuthApiOptions['issueKey']>>()

    const response = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', {
      grant_ref: 'device:denied',
      decision: 'deny',
    }), {
      store,
      authObject: { ...strictAuthObject, has: () => false, sessionClaims: {} },
      reserveConsent,
      issueKey,
      now: () => 1_000,
      canonicalBaseUrl: 'http://localhost',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ kind: 'denied', grantRef: 'device:denied' })
    expect(store.grants.get('device:denied')?.status).toBe('denied')
    expect(reserveConsent).not.toHaveBeenCalled()
    expect(issueKey).not.toHaveBeenCalled()
  })
  it('replays an identical completed approval without issuing another key', async () => {
    const store = storeFixture()
    await store.insertGrant({ grantRef: 'device:completed-replay', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'], requestedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'd-replay', userCodeHash: 'u-replay', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Replay-safe assistant' })
    const issueKey = vi.fn(async () => ({ keyId: 'ak_replay_safe' }))
    const request = () => formRequest('http://localhost/oauth/authorize', {
      grant_ref: 'device:completed-replay',
      expected_grant_revision: '1',
      expected_target_revision: '1',
      decision: 'approve',
      authority_mode: 'inspect_only',
      connection_target: 'new_agent',
    })
    const options = {
      store,
      ...consentSecurity(store),
      now: () => 1_000,
      canonicalBaseUrl: 'http://localhost',
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
      issueKey,
    }

    const first = await handleOAuthConsentPost(request(), options)

    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({
      kind: 'approved',
      grantRef: 'device:completed-replay',
      readbackRef: 'agent-access/oauth/device:completed-replay',
    })
    for (const status of ['approved', 'delivery_claimed', 'consumed'] as const) {
      const current = store.grants.get('device:completed-replay')
      if (current === undefined) throw new Error('completed replay grant missing')
      if (current.status !== status) {
        await store.updateGrant(current.grantRef, current.status, current.revision, { status })
      }
      const replay = await handleOAuthConsentPost(request(), options)
      expect(replay.status).toBe(200)
      expect(await replay.json()).toEqual({
        kind: 'approved',
        grantRef: 'device:completed-replay',
        readbackRef: 'agent-access/oauth/device:completed-replay',
      })
    }
    expect(issueKey).toHaveBeenCalledTimes(1)
  })
  it('uses the production-guarded local E2E identity and one deterministic proof per consent command', async () => {
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')
    const store = storeFixture()
    await store.insertClient({ clientId: 'client-local', clientName: 'Local E2E assistant', redirectUris: ['http://localhost/callback'], grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000 })
    await store.insertGrant({ grantRef: 'device:local-e2e-consent', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'], requestedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: await hashOAuthValue('local-e2e-device'), userCodeHash: 'u-local-e2e', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Local E2E assistant' })
    const security = consentSecurity(store, LOCAL_E2E_OPERATOR_PRINCIPAL)
    const reserveConsent = vi.fn(security.reserveConsent!)
    const localApi = createLocalE2EAgentAccessKeyApi()
    let issuedSecret: string | undefined
    const registerBinding = vi.fn<NonNullable<OAuthApiOptions['registerBinding']>>(async (input) => {
      issuedSecret = (await localApi.getSecret(input.credentialId)).secret
      return {
        kind: 'recorded',
        grantRef: input.grantRef,
        generation: 1,
        policyDigest: 'sha256:local-e2e-policy',
        lifecycle: 'active',
        expiresAt: input.expiresAt,
      }
    })
    const request = () => formRequest('http://localhost/oauth/authorize', {
      grant_ref: 'device:local-e2e-consent',
      expected_grant_revision: '1',
      expected_target_revision: '1',
      decision: 'approve',
      authority_mode: 'inspect_only',
      connection_target: 'new_agent',
    })

    try {
      const first = await handleOAuthConsentPost(request(), {
        store,
        reserveConsent,
        registerBinding,
        now: () => 1_000,
        canonicalBaseUrl: 'http://localhost',
      })
      const replay = await handleOAuthConsentPost(request(), {
        store,
        reserveConsent,
        registerBinding,
        now: () => 1_000,
        canonicalBaseUrl: 'http://localhost',
      })

      expect(first.status).toBe(200)
      expect(replay.status).toBe(200)
      expect(registerBinding).toHaveBeenCalledTimes(1)
      expect(reserveConsent).toHaveBeenCalledTimes(2)
      const firstReservation = reserveConsent.mock.calls[0]?.[0]
      const replayReservation = reserveConsent.mock.calls[1]?.[0]
      expect(registerBinding.mock.calls[0]?.[0]).toMatchObject({
        displayName: 'Local E2E assistant',
        operationAccess: 'all_admitted',
        operationRefs: [],
      })
      expect(firstReservation?.proof).toMatchObject({
        firstFactorAgeMinutes: 0,
        secondFactorAgeMinutes: -1,
      })
      expect(replayReservation?.proof?.reverificationId).toBe(firstReservation?.proof?.reverificationId)

      const tokenRequest = () => formRequest('http://localhost/oauth/token', {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: 'client-local',
        device_code: 'local-e2e-device',
      })
      const delivered = await handleOAuthTokenPost(tokenRequest(), {
        store,
        now: () => 1_000,
      })
      const deliveryReplay = await handleOAuthTokenPost(tokenRequest(), {
        store,
        now: () => 1_000,
      })
      expect(await delivered.json()).toMatchObject({
        access_token: issuedSecret,
        token_type: 'Bearer',
      })
      expect(await deliveryReplay.json()).toMatchObject({
        access_token: issuedSecret,
        token_type: 'Bearer',
      })
      expect(registerBinding).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllEnvs()
    }
  })
  it('keeps local E2E credential replacement on the selected Principal lifecycle', async () => {
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')
    const store = storeFixture()
    await store.insertClient({ clientId: 'client-local-replacement', clientName: 'Local replacement', redirectUris: ['http://localhost/callback'], grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000 })
    await store.insertGrant({ grantRef: 'device:local-replacement', revision: 1, flow: 'device_code', clientId: 'client-local-replacement', requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'], requestedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: await hashOAuthValue('local-replacement-device'), userCodeHash: 'u-local-replacement', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Local replacement' })
    const replacement = {
      principalRef: 'prn_selected_agent',
      generation: 2,
      successorCredentialRef: 'crd_local_successor',
      predecessorCredentialRef: 'crd_local_predecessor',
      predecessorKeyId: 'ak_local_predecessor',
      successorGrantRef: 'grt_local_successor',
    } as const
    const prepareReplacement = vi.fn<NonNullable<OAuthApiOptions['prepareReplacement']>>(async (input) => {
      expect(input.principalRef).toBe('prn_selected_agent')
      expect(input.operationAccess).toBe('all_admitted')
      expect(input.operationRefs).toEqual([])
      return { kind: 'recorded', ...replacement }
    })

    try {
      const response = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', {
        grant_ref: 'device:local-replacement',
        expected_grant_revision: '1',
        expected_target_revision: '4',
        decision: 'approve',
        authority_mode: 'inspect_only',
        connection_target: 'replace_credential',
        principal_ref: 'prn_selected_agent',
      }), {
        store,
        ...consentSecurity(store, LOCAL_E2E_OPERATOR_PRINCIPAL),
        prepareReplacement,
        now: () => 1_000,
        canonicalBaseUrl: 'http://localhost',
      })

      expect(response.status).toBe(200)
      expect(prepareReplacement).toHaveBeenCalledTimes(1)
      expect(store.grants.get('device:local-replacement')).toMatchObject({
        status: 'approved',
        connectionTarget: { kind: 'replace_credential', principalRef: 'prn_selected_agent' },
        replacement,
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })
  it('returns Clerk reverification hints before reservation and terminal JSON when signed evidence is unavailable', async () => {
    const store = storeFixture()
    await store.insertGrant({ grantRef: 'device:proof-gate', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'], requestedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'd-proof', userCodeHash: 'u-proof', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Proof assistant' })
    const reserveConsent = vi.fn<NonNullable<OAuthApiOptions['reserveConsent']>>()
    const issueKey = vi.fn<NonNullable<OAuthApiOptions['issueKey']>>()
    const request = () => formRequest('http://localhost/oauth/authorize', {
      grant_ref: 'device:proof-gate',
      expected_grant_revision: '1',
      expected_target_revision: '1',
      decision: 'approve',
      authority_mode: 'inspect_only',
      connection_target: 'new_agent',
    })
    const hint = await handleOAuthConsentPost(request(), {
      store,
      authObject: { ...strictAuthObject, has: () => false },
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
      reserveConsent,
      issueKey,
    })
    expect(hint.headers.get('content-type')).toContain('application/json')
    await expect(hint.json()).resolves.toHaveProperty('clerk_error')
    expect(reserveConsent).not.toHaveBeenCalled()
    expect(issueKey).not.toHaveBeenCalled()

    const unavailable = await handleOAuthConsentPost(request(), {
      store,
      authObject: { ...strictAuthObject, sessionClaims: {} },
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
      reserveConsent,
      issueKey,
    })
    expect(unavailable.status).toBe(403)
    await expect(unavailable.json()).resolves.toEqual({ kind: 'refused', code: 'security_evidence_unavailable' })
    expect(reserveConsent).not.toHaveBeenCalled()
    expect(issueKey).not.toHaveBeenCalled()
    expect(store.grants.get('device:proof-gate')?.status).toBe('pending')

    const freshProofRequired = await handleOAuthConsentPost(request(), {
      store,
      authObject: strictAuthObject,
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
      reserveConsent: async () => ({ kind: 'refused', code: 'command_changed' }),
      issueKey,
    })
    expect(freshProofRequired.status).toBe(403)
    await expect(freshProofRequired.json()).resolves.toHaveProperty('clerk_error')
    expect(issueKey).not.toHaveBeenCalled()
    expect(store.grants.get('device:proof-gate')?.status).toBe('pending')
  })
  it('returns a durable reference and does not issue a key when the security rate limit is unavailable', async () => {
    const store = storeFixture()
    await store.insertGrant({ grantRef: 'device:rate-storage-outage', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'], requestedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'd-rate-storage', userCodeHash: 'u-rate-storage', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Rate-safe assistant' })
    const reserveConsent = vi.fn<NonNullable<OAuthApiOptions['reserveConsent']>>(async () => ({
      kind: 'unavailable',
      code: 'security_control_unavailable',
      correlationRef: 'oauth:grant:device:rate-storage-outage:reserve:1',
    }))
    const issueKey = vi.fn<NonNullable<OAuthApiOptions['issueKey']>>()

    const response = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', {
      grant_ref: 'device:rate-storage-outage',
      expected_grant_revision: '1',
      expected_target_revision: '1',
      decision: 'approve',
      authority_mode: 'inspect_only',
      connection_target: 'new_agent',
    }), {
      store,
      authObject: strictAuthObject,
      reserveConsent,
      issueKey,
      now: () => 1_000,
      canonicalBaseUrl: 'http://localhost',
    })

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      kind: 'unavailable',
      code: 'security_control_unavailable',
      correlationRef: 'oauth:grant:device:rate-storage-outage:reserve:1',
    })
    expect(issueKey).not.toHaveBeenCalled()
    expect(store.grants.get('device:rate-storage-outage')?.status).toBe('pending')
  })
  it('reports key issuance outages as retryable server failures without consuming the grant', async () => {
    const store = storeFixture()
    await store.insertGrant({ grantRef: 'device:issuance-outage', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'], requestedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'd-outage', userCodeHash: 'u-outage', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Unavailable assistant' })
    const response = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: 'device:issuance-outage', expected_grant_revision: '1', expected_target_revision: '1', decision: 'approve', authority_mode: 'inspect_only', connection_target: 'new_agent' }), {
      store,
      ...consentSecurity(store),
      now: () => 1_000,
      canonicalBaseUrl: 'http://localhost',
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
      issueKey: async () => { throw new Error('upstream unavailable') },
    })

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({
      kind: 'outcome_unknown',
      grantRef: 'device:issuance-outage',
      readbackRef: 'agent-access/oauth/device:issuance-outage',
      correlationRef: 'oauth:grant:device:issuance-outage:reserve:1',
    })
    expect(store.grants.get('device:issuance-outage')?.status).toBe('issuing')
  })
  it('rejects consent from a foreign Origin before changing the grant', async () => {
    const store = storeFixture()
    await store.insertGrant({ grantRef: 'device:foreign-origin', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'], requestedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allOperations, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'd-foreign', userCodeHash: 'u-foreign', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Local assistant' })
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
