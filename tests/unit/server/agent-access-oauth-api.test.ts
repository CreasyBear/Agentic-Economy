import { describe, expect, it, vi } from 'vitest'
import { AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST, MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'
import { AGENT_ACCESS_KEY_TTL_SECONDS } from '@/modules/agent-access/agent-access'

import {
  handleDeviceAuthorizationPost,
  handleOAuthAuthorizeGet,
  handleOAuthConsentPost,
  handleOAuthRegisterPost,
  handleOAuthRevokePost,
  handleOAuthTokenPost,
  type OAuthApiOptions,
} from '@/lib/server/agent-access-oauth-api'
import { consentAccessSummary, parseAuthorizationDetails } from '@/lib/server/agent-access-oauth/protocol'
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
import type {
  AgentAccessOAuthRefreshFamily,
  AgentAccessOAuthRefreshStore,
} from '@/lib/server/agent-access-oauth-store'

const strictAuthObject: NonNullable<OAuthApiOptions['authObject']> = {
  isAuthenticated: true,
  userId: 'user_local',
  has: () => true,
  sessionClaims: { reverification_id: 'rev_test_consent' },
  factorVerificationAge: [0, 0],
  getToken: async () => 'convex-test-token',
}
const allTools = { toolAccess: 'all_admitted' as const, toolRefs: [] as const }
const toolRefA = `operation:v1:${'a'.repeat(64)}`
const toolRefB = `operation:v1:${'b'.repeat(64)}`

it('shows the effective default Sandbox spending limits before approval', () => {
  const summary = consentAccessSummary({ environment: 'sandbox', expiresInSeconds: 3600, ...allTools })
  expect(summary).toContain('AUD 1.000000')
  expect(summary).toContain('AUD 5.000000')
  expect(summary).toContain('AUD 20.000000')
  expect(summary).toContain('Maximum concurrent Calls: 1')
  expect(summary).toContain('Maximum calls per minute: 30')
  expect(summary).not.toContain('No additional spend')
})

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
          toolAccess: input.approvedToolAccess,
          toolRefs: [...input.approvedToolRefs],
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
    if (!body.has('approved_tool_access')) body.set('approved_tool_access', 'all_admitted')
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
  type: 'agentic_economy_market_tools',
  environment: 'production',
  expires_in_seconds: 7_200,
  maximum_spend_per_call: { currency: 'USD', units: '100', exponent: 2 },
  maximum_daily_spend: { currency: 'USD', units: '500', exponent: 2 },
  maximum_monthly_spend: { currency: 'USD', units: '2000', exponent: 2 },
  maximum_concurrent_calls: 3,
  maximum_calls_per_minute: 7,
  maximum_calls_per_hour: 42,
} as const

const productionRequestedAccess = {
  environment: 'production',
  ...allTools,
  expiresInSeconds: 7_200,
  maximumSpendPerCall: { currency: 'USD', units: '100', exponent: 2 },
  maximumDailySpend: { currency: 'USD', units: '500', exponent: 2 },
  maximumMonthlySpend: { currency: 'USD', units: '2000', exponent: 2 },
  maximumConcurrentCalls: 3,
  maximumCallsPerMinute: 7,
  maximumCallsPerHour: 42,
} as const

type OAuthIssueInput = Parameters<NonNullable<OAuthApiOptions['issueKey']>>[0]

function refreshFamilyFixture(input: Partial<AgentAccessOAuthRefreshFamily> = {}): AgentAccessOAuthRefreshFamily {
  const now = 1_000
  return {
    familyRef: 'refresh-family-1',
    revision: 1,
    clientId: 'client-durable',
    ownerId: 'acct_owner',
    ownerPrincipalRef: 'prn_owner',
    providerSubject: 'user_local',
    principalRef: 'prn_agent',
    displayName: 'Durable agent',
    applicationRef: 'app_agentic_economy',
    environment: 'sandbox',
    scopes: ['market_tools:call', 'customer_requests:approval_required'],
    authorityMode: 'approval_required',
    toolAccess: 'all_admitted',
    toolRefs: [],
    spendingPolicy: defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }),
    currentCredentialRef: 'crd_access_1',
    currentProviderCredentialId: 'ak_access_1',
    currentGrantRef: 'grt_access_1',
    currentGeneration: 1,
    currentAccessExpiresAt: now + AGENT_ACCESS_KEY_TTL_SECONDS * 1_000,
    currentTokenHash: 'refresh-hash-1',
    lifecycle: 'active',
    createdAt: now,
    expiresAt: now + 30 * 24 * 60 * 60 * 1_000,
    updatedAt: now,
    ...input,
  }
}

function refreshStoreFixture(
  overrides: Partial<AgentAccessOAuthRefreshStore> = {},
): AgentAccessOAuthRefreshStore {
  return {
    createRefreshFamily: async () => ({ kind: 'recorded', family: refreshFamilyFixture() }),
    claimRefreshFamily: async () => ({ kind: 'invalid_grant' }),
    commitRefreshFamilyRotation: async () => ({ kind: 'conflict', code: 'not_configured' }),
    revokeRefreshFamily: async () => ({ kind: 'unknown' }),
    revokeRefreshFamilyByAccessToken: async () => ({ kind: 'unknown' }),
    ...overrides,
  }
}

describe('Customer Request OAuth HTTP adapter', () => {
  it('normalizes exact Tool selection and rejects partial or malformed authorization details', () => {
    const detail = (selection: Record<string, unknown> = {}) => JSON.stringify([{
      type: 'agentic_economy_market_tools',
      environment: 'sandbox',
      expires_in_seconds: 600,
      ...selection,
    }])
    expect(parseAuthorizationDetails(detail())).toMatchObject({
      kind: 'ok', requestedAccess: { toolAccess: 'all_admitted', toolRefs: [] },
    })
    expect(parseAuthorizationDetails(detail({
      tool_access: 'selected_tools', tool_refs: [toolRefB, toolRefA],
    }))).toMatchObject({
      kind: 'ok', requestedAccess: { toolAccess: 'selected_tools', toolRefs: [toolRefA, toolRefB] },
    })
    expect(parseAuthorizationDetails(detail({ tool_access: 'selected_tools' }))).toEqual({ kind: 'invalid' })
    expect(parseAuthorizationDetails(detail({ tool_access: 'selected_tools', tool_refs: [toolRefA, toolRefA] }))).toEqual({ kind: 'invalid' })
    expect(parseAuthorizationDetails(detail({ tool_access: 'selected_tools', tool_refs: [] }))).toEqual({ kind: 'invalid' })
    expect(parseAuthorizationDetails(detail({ tool_access: 'all_admitted', tool_refs: [toolRefA] }))).toEqual({ kind: 'invalid' })
    expect(parseAuthorizationDetails(detail({ tool_access: 'selected_tools', tool_refs: Array.from({ length: 65 }, (_, index) => `operation:v1:${String(index).padStart(64, '0')}`) }))).toEqual({ kind: 'invalid' })
  })

  it('issues bounded device state, slows polling, and safely replays an interrupted delivery', async () => {
    const store = storeFixture()
    await store.insertClient({ clientId: 'client-local', clientName: 'Local assistant', redirectUris: ['http://localhost/callback'], grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000 })
    const options = { store, now: () => 1_000, issueKey: async () => ({ keyId: 'ak_local' }), getSecret: async () => ({ secret: 'secret-local' }) }
    const issued = await handleDeviceAuthorizationPost(formRequest('http://localhost/oauth/device_authorization', {
      client_id: 'client-local', scope: 'market_tools:call customer_requests:approval_required',
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
    expect(grant.requestedAccess).toEqual({ environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS })
    await store.updateGrant(grant.grantRef, 'pending', grant.revision, { status: 'approved', keyId: 'ak_local', ownerId: 'user_local' })
    const delivered = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: 'client-local', device_code: body.device_code,
    }), options)
    expect(await delivered.json()).toMatchObject({ access_token: 'secret-local', token_type: 'Bearer', scope: 'market_tools:call customer_requests:approval_required', expires_in: 604800 })
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
      client_id: 'client-replacement', scope: 'market_tools:call customer_requests:approval_required',
    }), options)
    const device = await issued.json() as { device_code: string }
    const grant = [...store.grants.values()][0]
    if (grant === undefined) throw new Error('replacement grant missing')
    const approved = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', {
      grant_ref: grant.grantRef,
      expected_grant_revision: String(grant.revision),
      expected_target_revision: '1',
      decision: 'approve',
      authority_mode: 'approval_required',
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
      client_id: 'client-compromise', scope: 'market_tools:call customer_requests:approval_required',
    }), options)
    const grant = [...store.grants.values()][0]
    if (grant === undefined) throw new Error('compromise grant missing')
    const response = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', {
      grant_ref: grant.grantRef, expected_grant_revision: String(grant.revision), expected_target_revision: '1',
      decision: 'approve', authority_mode: 'approval_required', connection_target: 'replace_credential',
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
      client_id: 'client-compromise-unknown', scope: 'market_tools:call customer_requests:approval_required',
    }), options)
    const grant = [...store.grants.values()][0]
    if (grant === undefined) throw new Error('compromise recovery grant missing')
    const request = () => handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', {
      grant_ref: grant.grantRef, expected_grant_revision: String(grant.revision), expected_target_revision: '1',
      decision: 'approve', authority_mode: 'approval_required', connection_target: 'replace_credential',
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
      requestedScopes: ['market_tools:call', 'customer_requests:read_only'],
      requestedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: 600 },
      approvedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: 600 },
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
      requestedScopes: ['market_tools:call', 'customer_requests:approval_required'],
      requestedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: 600 },
      approvedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: 600 },
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
      scope: 'market_tools:call customer_requests:approval_required',
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
      scope: 'market_tools:call customer_requests:approval_required',
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

  it('uses the durable safe MCP scope set when an authorization request omits scope', async () => {
    const store = storeFixture()
    await store.insertClient({
      clientId: 'client-native-default',
      clientName: 'Codex',
      redirectUris: ['http://localhost/callback'],
      grantTypes: ['authorization_code', 'refresh_token'],
      tokenEndpointAuthMethod: 'none',
      createdAt: 1_000,
    })
    const authorizationUrl = new URL('http://localhost/oauth/authorize')
    authorizationUrl.search = new URLSearchParams({
      client_id: 'client-native-default',
      redirect_uri: 'http://localhost/callback',
      response_type: 'code',
      state: 'state-native-default',
      code_challenge: 'challenge-native-default',
      code_challenge_method: 'S256',
    }).toString()

    const response = await handleOAuthAuthorizeGet(new Request(authorizationUrl), {
      store,
      now: () => 1_000,
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
    })

    expect(response.status).toBe(302)
    const created = [...store.grants.values()].find(({ clientId }) => clientId === 'client-native-default')
    expect(created).toMatchObject({
      requestedScopes: ['market_tools:call', 'customer_requests:approval_required'],
      offlineAccess: true,
    })
  })

  it('rejects invalid authorization details before inserting a grant', async () => {
    const partialDetails = {
      type: productionAuthorizationDetails.type,
      environment: productionAuthorizationDetails.environment,
      expires_in_seconds: productionAuthorizationDetails.expires_in_seconds,
      maximum_spend_per_call: productionAuthorizationDetails.maximum_spend_per_call,
      maximum_daily_spend: productionAuthorizationDetails.maximum_daily_spend,
    }
    const invalidCases: Array<{ value: unknown; scope?: string }> = [
      { value: '{not-json' },
      { value: [{ ...productionAuthorizationDetails, unexpected: true }] },
      { value: [productionAuthorizationDetails, productionAuthorizationDetails] },
      { value: [partialDetails] },
      { value: [{ ...productionAuthorizationDetails, maximum_spend_per_call: { currency: 'USD', units: '600', exponent: 2 }, maximum_daily_spend: { currency: 'USD', units: '500', exponent: 2 } }] },
      { value: [{ ...productionAuthorizationDetails, maximum_monthly_spend: { currency: 'EUR', units: '2000', exponent: 2 } }] },
      { value: [{ ...productionAuthorizationDetails, maximum_spend_per_call: { currency: 'USD', units: '0', exponent: 2 } }] },
      { value: [{ ...productionAuthorizationDetails, environment: 'sandbox' }] },
      { value: [productionAuthorizationDetails], scope: 'market_tools:call customer_requests:unrestricted_test_only' },
    ]

    for (const [index, invalidCase] of invalidCases.entries()) {
      const store = storeFixture()
      await store.insertClient({ clientId: `client-invalid-details-${index}`, clientName: 'Invalid details', redirectUris: ['http://localhost/callback'], grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000 })
      const details = typeof invalidCase.value === 'string' ? invalidCase.value : JSON.stringify(invalidCase.value)
      const response = await handleDeviceAuthorizationPost(formRequest('http://localhost/oauth/device_authorization', {
        client_id: `client-invalid-details-${index}`,
        scope: invalidCase.scope ?? 'market_tools:call customer_requests:approval_required',
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
      scope: 'market_tools:call customer_requests:read_only',
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
        scope: 'market_tools:call customer_requests:read_only',
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

  it('registers a public authorization-code client for rotating refresh', async () => {
    const store = storeFixture()
    const response = await handleOAuthRegisterPost(new Request('http://localhost/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Durable MCP client',
        redirect_uris: ['http://127.0.0.1/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: 'market_tools:call customer_requests:approval_required offline_access',
      }),
    }), { store, now: () => 1_000 })

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'market_tools:call customer_requests:approval_required offline_access',
    })
  })

  it('returns a hash-only refresh credential for approved code+PKCE offline access and never for an online grant', async () => {
    const now = 1_000
    const verifier = 'pkce-verifier'
    const authorizationCode = 'authorization-code'
    const store = storeFixture()
    await store.insertClient({
      clientId: 'client-durable', clientName: 'Durable client', redirectUris: ['http://localhost/callback'],
      grantTypes: ['authorization_code', 'refresh_token'], tokenEndpointAuthMethod: 'none', createdAt: now,
    })
    await store.insertGrant({
      grantRef: 'authorization:offline', revision: 1, flow: 'authorization_code', clientId: 'client-durable',
      redirectUri: 'http://localhost/callback', requestedScopes: ['market_tools:call', 'customer_requests:approval_required'],
      offlineAccess: true,
      requestedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: 30 * 24 * 60 * 60 },
      approvedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: 30 * 24 * 60 * 60 },
      codeChallenge: await hashOAuthValue(verifier), codeChallengeMethod: 'S256',
      authorizationCodeHash: await hashOAuthValue(authorizationCode), status: 'approved', ownerId: 'user_local',
      keyId: 'ak_access_1', createdAt: now, expiresAt: now + 60_000, displayName: 'Durable client',
    })
    const persisted: Array<Parameters<AgentAccessOAuthRefreshStore['createRefreshFamily']>[0]> = []
    const refreshStore = refreshStoreFixture({
      createRefreshFamily: async (input) => {
        persisted.push(input)
        return { kind: 'recorded', family: refreshFamilyFixture({ currentTokenHash: input.tokenHash }) }
      },
    })
    const offline = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'authorization_code', code: authorizationCode, client_id: 'client-durable',
      redirect_uri: 'http://localhost/callback', code_verifier: verifier,
    }), { store, refreshStore, now: () => now, getSecret: async () => ({ secret: 'access-secret-1' }) })
    const offlineBody = await offline.json() as Record<string, unknown>

    expect(offline.status).toBe(200)
    expect(offlineBody).toMatchObject({
      access_token: 'access-secret-1', token_type: 'Bearer', expires_in: AGENT_ACCESS_KEY_TTL_SECONDS,
      scope: 'market_tools:call customer_requests:approval_required offline_access',
    })
    expect(typeof offlineBody.refresh_token).toBe('string')
    expect(persisted).toHaveLength(1)
    expect(persisted[0]).toMatchObject({
      grantRef: 'authorization:offline', keyId: 'ak_access_1', clientId: 'client-durable',
      createdAt: now, expiresAt: now + 30 * 24 * 60 * 60 * 1_000,
      tokenHash: await hashOAuthValue(offlineBody.refresh_token as string),
      accessTokenHash: await hashOAuthValue('access-secret-1'),
    })
    expect(JSON.stringify(persisted)).not.toContain(offlineBody.refresh_token as string)

    const offlineReplay = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'authorization_code', code: authorizationCode, client_id: 'client-durable',
      redirect_uri: 'http://localhost/callback', code_verifier: verifier,
    }), { store, refreshStore, now: () => now, getSecret: async () => ({ secret: 'access-secret-1' }) })
    expect(offlineReplay.status).toBe(400)
    await expect(offlineReplay.json()).resolves.toMatchObject({ error: 'invalid_grant' })

    const onlineCode = 'online-authorization-code'
    await store.insertGrant({
      grantRef: 'authorization:online', revision: 1, flow: 'authorization_code', clientId: 'client-durable',
      redirectUri: 'http://localhost/callback', requestedScopes: ['market_tools:call', 'customer_requests:approval_required'],
      requestedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS },
      approvedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS },
      codeChallenge: await hashOAuthValue(verifier), codeChallengeMethod: 'S256',
      authorizationCodeHash: await hashOAuthValue(onlineCode), status: 'approved', ownerId: 'user_local',
      keyId: 'ak_access_online', createdAt: now, expiresAt: now + 60_000, displayName: 'Online client',
    })
    const online = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'authorization_code', code: onlineCode, client_id: 'client-durable',
      redirect_uri: 'http://localhost/callback', code_verifier: verifier,
    }), { store, refreshStore, now: () => now, getSecret: async () => ({ secret: 'access-secret-online' }) })
    const onlineBody = await online.json() as Record<string, unknown>
    expect(onlineBody).not.toHaveProperty('refresh_token')
    expect(persisted).toHaveLength(1)
  })

  it('rotates access and refresh credentials while preserving the exact approved family authority', async () => {
    const now = 10_000
    const oldRefreshToken = 'old-refresh-token'
    const family = refreshFamilyFixture({
      currentTokenHash: await hashOAuthValue(oldRefreshToken),
      createdAt: now - 1_000,
      updatedAt: now - 1_000,
      currentAccessExpiresAt: now + 1_000,
      expiresAt: now + 30 * 24 * 60 * 60 * 1_000,
    })
    const rotatedFamily = refreshFamilyFixture({
      ...family,
      revision: 2,
      currentCredentialRef: 'crd_access_2',
      currentProviderCredentialId: 'ak_access_2',
      currentGrantRef: 'grt_access_2',
      currentGeneration: 2,
      currentAccessExpiresAt: now + AGENT_ACCESS_KEY_TTL_SECONDS * 1_000,
      updatedAt: now,
    })
    const store = storeFixture()
    await store.insertClient({
      clientId: 'client-durable', clientName: 'Durable client', redirectUris: ['http://localhost/callback'],
      grantTypes: ['authorization_code', 'refresh_token'], tokenEndpointAuthMethod: 'none', createdAt: now,
    })
    const commits: Array<Parameters<AgentAccessOAuthRefreshStore['commitRefreshFamilyRotation']>[0]> = []
    const revoked: string[] = []
    const refreshStore = refreshStoreFixture({
      claimRefreshFamily: async (input) => ({ kind: 'claimed', family, claimRef: input.claimRef }),
      commitRefreshFamilyRotation: async (input) => {
        commits.push(input)
        return {
          kind: 'completed', family: { ...rotatedFamily, currentTokenHash: input.successorTokenHash },
          providerCleanupTarget: { credentialRef: 'crd_access_1', providerCredentialId: 'ak_access_1' },
        }
      },
    })
    const issued: Array<Parameters<NonNullable<OAuthApiOptions['issueRefreshKey']>>[0]> = []
    const response = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'refresh_token', refresh_token: oldRefreshToken, client_id: 'client-durable',
    }), {
      store,
      refreshStore,
      now: () => now,
      issueRefreshKey: async (input) => { issued.push(input); return { keyId: 'ak_access_2' } },
      getSecret: async (keyId) => ({ secret: `${keyId}-secret` }),
      getProviderCredential: async () => ({ revoked: false }),
      revokeProviderCredential: async (keyId) => { revoked.push(keyId) },
      recordProviderRevocation: async () => ({ kind: 'completed' }),
    })
    const body = await response.json() as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      access_token: 'ak_access_2-secret', token_type: 'Bearer', expires_in: AGENT_ACCESS_KEY_TTL_SECONDS,
      scope: 'market_tools:call customer_requests:approval_required offline_access',
    })
    expect(body.refresh_token).not.toBe(oldRefreshToken)
    expect(issued).toHaveLength(1)
    expect(issued[0]).toMatchObject({ family, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS })
    expect(commits).toHaveLength(1)
    expect(commits[0]).toMatchObject({
      familyRef: family.familyRef,
      expectedRevision: family.revision,
      tokenHash: await hashOAuthValue(oldRefreshToken),
      successorCredentialId: 'ak_access_2',
      successorAccessTokenHash: await hashOAuthValue('ak_access_2-secret'),
      successorTokenHash: await hashOAuthValue(body.refresh_token as string),
    })
    expect(revoked).toEqual(['ak_access_1'])
  })

  it('rejects a refresh from a compromised inactive family before successor key issuance', async () => {
    const now = 12_000
    const oldRefreshToken = 'compromised-old-refresh-token'
    const family = refreshFamilyFixture({
      currentTokenHash: await hashOAuthValue(oldRefreshToken),
      lifecycle: 'revoked',
      revokedAt: now - 1,
      revocationReason: 'suspected_compromise',
      updatedAt: now - 1,
    })
    const store = storeFixture()
    await store.insertClient({
      clientId: family.clientId, clientName: 'Durable client', redirectUris: ['http://localhost/callback'],
      grantTypes: ['authorization_code', 'refresh_token'], tokenEndpointAuthMethod: 'none', createdAt: now,
    })
    const issueRefreshKey = vi.fn<NonNullable<OAuthApiOptions['issueRefreshKey']>>()
    const claimRefreshFamily = vi.fn<AgentAccessOAuthRefreshStore['claimRefreshFamily']>(async () => (
      family.lifecycle === 'revoked' && family.revocationReason === 'suspected_compromise'
        ? { kind: 'invalid_grant' }
        : { kind: 'busy' }
    ))
    const response = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'refresh_token', refresh_token: oldRefreshToken, client_id: family.clientId,
    }), {
      store,
      refreshStore: refreshStoreFixture({ claimRefreshFamily }),
      issueRefreshKey,
      now: () => now,
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_grant' })
    expect(claimRefreshFamily).toHaveBeenCalledOnce()
    expect(issueRefreshKey).not.toHaveBeenCalled()
  })

  it('reconciles a lost commit response without revoking the promoted successor', async () => {
    const now = 15_000
    const family = refreshFamilyFixture({
      createdAt: now - 1_000,
      updatedAt: now - 1_000,
      expiresAt: now + 30 * 24 * 60 * 60 * 1_000,
    })
    const rotated = refreshFamilyFixture({
      ...family,
      revision: family.revision + 1,
      currentCredentialRef: 'crd_access_2',
      currentProviderCredentialId: 'ak_access_2',
      currentGrantRef: 'grt_access_2',
      currentGeneration: 2,
      currentAccessExpiresAt: now + AGENT_ACCESS_KEY_TTL_SECONDS * 1_000,
    })
    const store = storeFixture()
    await store.insertClient({
      clientId: family.clientId, clientName: 'Durable client', redirectUris: ['http://localhost/callback'],
      grantTypes: ['authorization_code', 'refresh_token'], tokenEndpointAuthMethod: 'none', createdAt: now,
    })
    const commit = vi.fn<AgentAccessOAuthRefreshStore['commitRefreshFamilyRotation']>()
      .mockRejectedValueOnce(new Error('response_lost_after_commit'))
      .mockResolvedValueOnce({ kind: 'replayed', family: rotated })
    const revokeProviderCredential = vi.fn()
    const response = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'refresh_token', refresh_token: 'parent-refresh', client_id: family.clientId,
    }), {
      store,
      refreshStore: refreshStoreFixture({
        claimRefreshFamily: async (input) => ({ kind: 'claimed', family, claimRef: input.claimRef }),
        commitRefreshFamilyRotation: commit,
      }),
      issueRefreshKey: async () => ({ keyId: 'ak_access_2' }),
      getSecret: async () => ({ secret: 'ak_access_2-secret' }),
      revokeProviderCredential,
      now: () => now,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ access_token: 'ak_access_2-secret' })
    expect(commit).toHaveBeenCalledTimes(2)
    expect(revokeProviderCredential).not.toHaveBeenCalled()
  })

  it('recovers an immediately retried refresh delivery without another browser ceremony or access-key rotation', async () => {
    const now = 20_000
    const family = refreshFamilyFixture({
      currentProviderCredentialId: 'ak_current',
      currentAccessExpiresAt: now + 300_000,
      updatedAt: now,
    })
    const store = storeFixture()
    await store.insertClient({
      clientId: 'client-durable', clientName: 'Durable client', redirectUris: ['http://localhost/callback'],
      grantTypes: ['authorization_code', 'refresh_token'], tokenEndpointAuthMethod: 'none', createdAt: now,
    })
    const issueRefreshKey = vi.fn<NonNullable<OAuthApiOptions['issueRefreshKey']>>()
    const response = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'refresh_token', refresh_token: 'immediate-parent-token', client_id: 'client-durable',
    }), {
      store,
      refreshStore: refreshStoreFixture({ claimRefreshFamily: async () => ({ kind: 'recovered', family }) }),
      issueRefreshKey,
      getSecret: async () => ({ secret: 'current-access-secret' }),
      now: () => now,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      access_token: 'current-access-secret', expires_in: 300, refresh_token: expect.any(String),
    })
    expect(issueRefreshKey).not.toHaveBeenCalled()
  })

  it('revokes refresh or access credentials idempotently and returns 200 for an unknown token', async () => {
    const store = storeFixture()
    await store.insertClient({
      clientId: 'client-durable', clientName: 'Durable client', redirectUris: ['http://localhost/callback'],
      grantTypes: ['authorization_code', 'refresh_token'], tokenEndpointAuthMethod: 'none', createdAt: 1_000,
    })
    const byRefresh = vi.fn<AgentAccessOAuthRefreshStore['revokeRefreshFamily']>()
      .mockResolvedValueOnce({ kind: 'completed' })
      .mockResolvedValue({ kind: 'unknown' })
    const byAccess = vi.fn<AgentAccessOAuthRefreshStore['revokeRefreshFamilyByAccessToken']>()
      .mockResolvedValue({ kind: 'completed' })
    const refreshStore = refreshStoreFixture({ revokeRefreshFamily: byRefresh, revokeRefreshFamilyByAccessToken: byAccess })
    const options: OAuthApiOptions = {
      store, refreshStore, now: () => 1_000,
    }

    const refresh = await handleOAuthRevokePost(formRequest('http://localhost/oauth/revoke', {
      token: 'known-refresh', token_type_hint: 'access_token', client_id: 'client-durable',
    }), options)
    const access = await handleOAuthRevokePost(formRequest('http://localhost/oauth/revoke', {
      token: 'known-access', token_type_hint: 'refresh_token', client_id: 'client-durable',
    }), options)
    const unknown = await handleOAuthRevokePost(formRequest('http://localhost/oauth/revoke', {
      token: 'unknown', client_id: 'client-durable',
    }), options)

    expect(refresh.status).toBe(200)
    expect(access.status).toBe(200)
    expect(unknown.status).toBe(200)
    expect(refresh.headers.get('cache-control')).toBe('no-store')
    expect(byAccess).toHaveBeenCalledWith(expect.objectContaining({
      tokenHash: await hashOAuthValue('known-access'), clientId: 'client-durable',
    }))
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
        expect(input.authorityMode).toBe('spending_policy')
        return { keyId: 'ak_supplier' }
      },
      getSecret: async () => ({ secret: 'supplier-secret-once' }),
    }
    const registration = await handleOAuthRegisterPost(new Request('http://localhost/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST,
        client_name: 'Agentic Economy Provider CLI',
        scope: MARKET_SUPPLY_MANAGE_SCOPE,
      }),
    }), options)
    const registered = await registration.json() as { client_id: string; scope: string }
    expect(registered.scope).toBe(MARKET_SUPPLY_MANAGE_SCOPE)

    const selectedProvider = await handleDeviceAuthorizationPost(formRequest('http://localhost/oauth/device_authorization', {
      client_id: registered.client_id,
      scope: MARKET_SUPPLY_MANAGE_SCOPE,
      authorization_details: JSON.stringify([{
        type: 'agentic_economy_market_tools', environment: 'sandbox', expires_in_seconds: 600,
        tool_access: 'selected_tools', tool_refs: [toolRefA],
      }]),
    }), options)
    expect(selectedProvider.status).toBe(400)

    const device = await handleDeviceAuthorizationPost(formRequest('http://localhost/oauth/device_authorization', {
      client_id: registered.client_id,
      scope: MARKET_SUPPLY_MANAGE_SCOPE,
    }), options)
    const deviceGrant = await device.json() as { device_code: string; user_code: string }
    const consent = await handleOAuthAuthorizeGet(new Request(`http://localhost/oauth/authorize?user_code=${encodeURIComponent(deviceGrant.user_code)}`), options)
    const html = await consent.text()
    expect(html).toContain('data-access-profile="provider"')
    expect(html).toContain(`Technical permission: ${MARKET_SUPPLY_MANAGE_SCOPE}`)
    expect(html).toContain('manage your published Provider Tools')

    const grant = [...store.grants.values()][0]
    if (grant === undefined) throw new Error('supplier grant missing')
    const approved = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', {
      grant_ref: grant.grantRef,
      expected_grant_revision: String(grant.revision),
      expected_target_revision: String(grant.revision),
      decision: 'approve',
      authority_mode: 'spending_policy',
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
    const consentStart = await handleOAuthAuthorizeGet(new Request('http://localhost/oauth/authorize?client_id=client-auth&redirect_uri=http%3A%2F%2Flocalhost%2Fcallback&response_type=code&state=s&scope=market_tools%3Acall%20customer_requests%3Aapproval_required&code_challenge=abc&code_challenge_method=S256'), { store, now: () => 1_000, authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }) })
    expect(consentStart.status).toBe(302)
    const consent = await handleOAuthAuthorizeGet(new Request(consentStart.headers.get('location')!), {
      store,
      now: () => 1_000,
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
      listAgents: async () => ({ items: [{ principalRef: 'prn_existing', principalRevision: 4, displayName: 'Existing agent' }] }),
      listReconnectCandidates: async ({ clientId, principalRefs }) => {
        expect(clientId).toBe('client-auth')
        expect(principalRefs).toEqual(['prn_existing'])
        return [{ principalRef: 'prn_existing', principalRevision: 4 }]
      },
    })
    const consentHtml = await consent.text()
    expect(consentHtml).toContain('data-ae-consent')
    expect(consentHtml).toContain('data-authority-mode="approval_required"')
    expect(consentHtml).toContain('<p data-ae-scope>Technical permission: customer_requests:approval_required</p>')
    expect(consentHtml).toContain('You approve each request before it moves forward.')
    expect(consentHtml).toContain('<details>')
    expect(consentHtml).toContain('data-reconnect-principal-ref="prn_existing"')
    expect(consentHtml).toContain('data-reconnect-ambiguous="false"')
    expect(consentHtml).not.toContain('Requested mode:')
    expect(consentHtml).not.toContain('Customer Request scope:')
    expect(consentHtml).not.toContain('secret')
    const sandboxGrant = [...store.grants.values()].find((grant) => grant.flow === 'authorization_code')
    expect(sandboxGrant?.requestedAccess).toEqual({ environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS })
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
      scope: 'market_tools:call customer_requests:approval_required',
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
      scope: 'market_tools:call customer_requests:spending_policy',
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
    expect(controlledHtml).toContain('Authority mode: spending_policy')
    expect(controlledHtml).toContain('Maximum spend per Call: USD 1.00.')
    expect(controlledHtml).toContain('Maximum daily spend: USD 5.00.')
    expect(controlledHtml).toContain('Maximum monthly spend: USD 20.00.')
    expect(controlledHtml).toContain('Maximum concurrent Calls: 3.')
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
      scope: 'market_tools:call customer_requests:approval_required',
      code_challenge: 'production-zero-challenge',
      code_challenge_method: 'S256',
      authorization_details: JSON.stringify([{
        type: 'agentic_economy_market_tools',
        environment: 'production',
        expires_in_seconds: 3_600,
      }]),
    }).toString()
    const zeroDefaultResponse = await handleOAuthAuthorizeGet(new Request(zeroDefault), options)
    expect(zeroDefaultResponse.status).toBe(302)
    const zeroDefaultGate = await handleOAuthAuthorizeGet(new Request(zeroDefaultResponse.headers.get('location')!), options)
    expect(await zeroDefaultGate.text()).toContain('Spending is disabled by the zero default.')
  })

  it('derives sandbox, zero-budget, and spending-policy production issuance from persisted access', async () => {
    const store = storeFixture()
    await store.insertClient({ clientId: 'client-local', clientName: 'Local assistant', redirectUris: ['http://localhost/callback'], grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000 })
    await store.insertGrant({ grantRef: 'device:sandbox-issuance', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_tools:call', 'customer_requests:read_only'], requestedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'sandbox-code', userCodeHash: 'sandbox-user', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Sandbox assistant' })
    await store.insertGrant({ grantRef: 'device:production-zero', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_tools:call', 'customer_requests:approval_required'], requestedAccess: { environment: 'production', ...allTools, expiresInSeconds: 1_234 }, approvedAccess: { environment: 'production', ...allTools, expiresInSeconds: 1_234 }, deviceCodeHash: 'zero-code', userCodeHash: 'zero-user', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Zero assistant' })
    await store.insertGrant({ grantRef: 'device:production-bounded', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_tools:call', 'customer_requests:spending_policy'], requestedAccess: productionRequestedAccess, approvedAccess: productionRequestedAccess, deviceCodeHash: await hashOAuthValue('bounded-code'), userCodeHash: 'bounded-user', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Bounded assistant' })
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
      ['device:sandbox-issuance', 'read_only'],
      ['device:production-zero', 'approval_required'],
      ['device:production-bounded', 'spending_policy'],
    ] as const) {
      const response = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: grantRef, expected_grant_revision: '1', expected_target_revision: '1', decision: 'approve', authority_mode: authorityMode, connection_target: 'new_agent' }), options)
      expect(response.status).toBe(200)
    }
    const retry = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: 'device:production-bounded', expected_grant_revision: '1', expected_target_revision: '1', decision: 'approve', authority_mode: 'spending_policy', connection_target: 'new_agent' }), options)
    expect(retry.status).toBe(200)
    expect(await retry.json()).toMatchObject({
      kind: 'approved',
      grantRef: 'device:production-bounded',
    })
    expect(issued).toHaveLength(3)
    expect(issued[0]?.approvedAccess).toEqual({ environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS })
    expect(issued[0]?.spendingPolicy).toEqual(defaultSandboxAgentAccessPolicy({ currency: 'AUD', exponent: 6 }))
    expect(issued[1]?.approvedAccess).toEqual({ environment: 'production', ...allTools, expiresInSeconds: 1_234 })
    expect(issued[1]?.spendingPolicy).toEqual(defaultProductionAgentAccessPolicy({ currency: 'AUD', exponent: 6 }))
    const spendingPolicyBase = buildProductionAgentAccessPolicy({
      currency: 'USD',
      exponent: 2,
      maximumSpendPerCall: productionRequestedAccess.maximumSpendPerCall,
      maximumDailySpend: productionRequestedAccess.maximumDailySpend,
      maximumMonthlySpend: productionRequestedAccess.maximumMonthlySpend,
    })
    expect(issued[2]?.authorityMode).toBe('spending_policy')
    expect(issued[2]?.approvedAccess).toEqual(productionRequestedAccess)
    expect(issued[2]?.spendingPolicy).toEqual({
      ...spendingPolicyBase,
      budget: { ...spendingPolicyBase.budget, maximumConcurrentCalls: 3 },
      rate: { ...spendingPolicyBase.rate, maximumCallsPerMinute: 7, maximumCallsPerHour: 42 },
    })

    const token = await handleOAuthTokenPost(formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: 'client-local',
      device_code: 'bounded-code',
    }), options)
    expect(await token.json()).toMatchObject({ access_token: 'bounded-secret', expires_in: 7_200 })
  })

  it('does not issue production unrestricted_test_only or invalid persisted access', async () => {
    const store = storeFixture()
    await store.insertGrant({ grantRef: 'device:full-yolo', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_tools:call', 'customer_requests:unrestricted_test_only'], requestedAccess: { environment: 'production', ...allTools, expiresInSeconds: 1_000 }, approvedAccess: { environment: 'production', ...allTools, expiresInSeconds: 1_000 }, deviceCodeHash: 'full-code', userCodeHash: 'full-user', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Unsafe assistant' })
    await store.insertGrant({ grantRef: 'device:invalid-access', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_tools:call', 'customer_requests:approval_required'], requestedAccess: { environment: 'production', ...allTools, expiresInSeconds: 1_000, maximumSpendPerCall: { currency: 'USD', units: '100', exponent: 2 } }, approvedAccess: { environment: 'production', ...allTools, expiresInSeconds: 1_000, maximumSpendPerCall: { currency: 'USD', units: '100', exponent: 2 } }, deviceCodeHash: 'invalid-code', userCodeHash: 'invalid-user', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Invalid assistant' })
    let issueCount = 0
    const options = {
      store,
      ...consentSecurity(store),
      now: () => 1_000,
      canonicalBaseUrl: 'http://localhost',
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
      issueKey: async () => { issueCount += 1; return { keyId: 'ak_should-not-exist' } },
    }
    const unrestrictedTestOnly = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: 'device:full-yolo', expected_grant_revision: '1', expected_target_revision: '1', decision: 'approve', authority_mode: 'unrestricted_test_only', connection_target: 'new_agent' }), options)
    const invalid = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: 'device:invalid-access', expected_grant_revision: '1', expected_target_revision: '1', decision: 'approve', authority_mode: 'approval_required', connection_target: 'new_agent' }), options)
    expect(unrestrictedTestOnly.status).toBe(202)
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
      requestedScopes: ['market_tools:call', 'customer_requests:read_only'],
      requestedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS },
      approvedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS },
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
      requestedScopes: ['market_tools:call', 'customer_requests:read_only'],
      requestedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS },
      approvedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS },
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
        requestedScopes: ['market_tools:call', 'customer_requests:read_only'],
        requestedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS },
        approvedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS },
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
    await store.insertGrant({ grantRef: 'device:1', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_tools:call', 'customer_requests:read_only'], requestedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'd', userCodeHash: await hashOAuthValue('ABCD-EFGH'), status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Local assistant' })
    let issuedInput: OAuthIssueInput | undefined
    const response = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: 'device:1', expected_grant_revision: '1', expected_target_revision: '1', decision: 'approve', authority_mode: 'read_only', connection_target: 'new_agent' }), {
      store, ...consentSecurity(store), now: () => 1_000, canonicalBaseUrl: 'http://localhost', authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }), issueKey: async (input) => { issuedInput = input; return { keyId: 'ak_local' } },
    })
    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain('ak_local')
    expect(store.grants.get('device:1')?.status).toBe('approved')
    expect(issuedInput?.authorityMode).toBe('read_only')
    expect(issuedInput?.approvedAccess).toEqual({ environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS })
    expect(issuedInput?.spendingPolicy).toEqual(defaultSandboxAgentAccessPolicy({ currency: 'AUD', exponent: 6 }))
  })
  it('denies a pending grant without requiring approval proof or issuing a key', async () => {
    const store = storeFixture()
    await store.insertGrant({ grantRef: 'device:denied', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_tools:call', 'customer_requests:read_only'], requestedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'd-denied', userCodeHash: 'u-denied', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Declined assistant' })
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
    await store.insertGrant({ grantRef: 'device:completed-replay', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_tools:call', 'customer_requests:read_only'], requestedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'd-replay', userCodeHash: 'u-replay', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Replay-safe assistant' })
    const issueKey = vi.fn(async () => ({ keyId: 'ak_replay_safe' }))
    const request = () => formRequest('http://localhost/oauth/authorize', {
      grant_ref: 'device:completed-replay',
      expected_grant_revision: '1',
      expected_target_revision: '1',
      decision: 'approve',
      authority_mode: 'read_only',
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
  it('registers one deterministic consent binding and delivers its issued secret through the OAuth seams', async () => {
    const store = storeFixture()
    await store.insertClient({ clientId: 'client-local', clientName: 'Test device assistant', redirectUris: ['http://localhost/callback'], grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000 })
    await store.insertGrant({ grantRef: 'device:test-consent', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_tools:call', 'customer_requests:read_only'], requestedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: await hashOAuthValue('test-device-code'), userCodeHash: 'u-test-consent', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Test device assistant' })
    const security = consentSecurity(store)
    const reserveConsent = vi.fn(security.reserveConsent!)
    const issuedSecret = 'ae_test_device_secret'
    const issueKey = vi.fn<NonNullable<OAuthApiOptions['issueKey']>>(async () => ({ keyId: 'ak_test_device' }))
    const request = () => formRequest('http://localhost/oauth/authorize', {
      grant_ref: 'device:test-consent',
      expected_grant_revision: '1',
      expected_target_revision: '1',
      decision: 'approve',
      authority_mode: 'read_only',
      connection_target: 'new_agent',
    })
    const consentOptions: OAuthApiOptions = {
      store,
      ...(security.authObject === undefined ? {} : { authObject: security.authObject }),
      reserveConsent,
      issueKey,
      now: () => 1_000,
      canonicalBaseUrl: 'http://localhost',
    }

    const first = await handleOAuthConsentPost(request(), consentOptions)
    const replay = await handleOAuthConsentPost(request(), consentOptions)

    expect(first.status).toBe(200)
    expect(replay.status).toBe(200)
    expect(issueKey).toHaveBeenCalledTimes(1)
    expect(reserveConsent).toHaveBeenCalledTimes(2)
    const firstReservation = reserveConsent.mock.calls[0]?.[0]
    const replayReservation = reserveConsent.mock.calls[1]?.[0]
    expect(issueKey.mock.calls[0]?.[0]).toMatchObject({
      name: 'Test device assistant',
      target: { kind: 'new_agent' },
    })
    expect(firstReservation?.proof).toMatchObject({
      firstFactorAgeMinutes: 0,
      secondFactorAgeMinutes: 0,
    })
    expect(replayReservation?.proof?.reverificationId).toBe(firstReservation?.proof?.reverificationId)

    const tokenRequest = () => formRequest('http://localhost/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: 'client-local',
      device_code: 'test-device-code',
    })
    const tokenOptions = { store, now: () => 1_000, getSecret: async () => ({ secret: issuedSecret }) }
    const delivered = await handleOAuthTokenPost(tokenRequest(), tokenOptions)
    const deliveryReplay = await handleOAuthTokenPost(tokenRequest(), tokenOptions)
    expect(await delivered.json()).toMatchObject({
      access_token: issuedSecret,
      token_type: 'Bearer',
    })
    expect(await deliveryReplay.json()).toMatchObject({
      access_token: issuedSecret,
      token_type: 'Bearer',
    })
    expect(issueKey).toHaveBeenCalledTimes(1)
  })
  it('keeps credential replacement on the selected Principal lifecycle', async () => {
    const store = storeFixture()
    await store.insertClient({ clientId: 'client-local-replacement', clientName: 'Test replacement', redirectUris: ['http://localhost/callback'], grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'], tokenEndpointAuthMethod: 'none', createdAt: 1_000 })
    await store.insertGrant({ grantRef: 'device:local-replacement', revision: 1, flow: 'device_code', clientId: 'client-local-replacement', requestedScopes: ['market_tools:call', 'customer_requests:read_only'], requestedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: await hashOAuthValue('local-replacement-device'), userCodeHash: 'u-local-replacement', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Local replacement' })
    const replacement = {
      principalRef: 'prn_selected_agent',
      generation: 2,
      successorCredentialRef: 'crd_local_successor',
      predecessorCredentialRef: 'crd_local_predecessor',
      predecessorKeyId: 'ak_local_predecessor',
      successorGrantRef: 'grt_local_successor',
    } as const
    const issueKey = vi.fn<NonNullable<OAuthApiOptions['issueKey']>>(async (input) => {
      expect(input.target).toEqual({
        kind: 'replace_credential',
        principalRef: 'prn_selected_agent',
        replacementMode: 'planned',
      })
      return { keyId: 'ak_local_successor', replacement }
    })

    const response = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', {
      grant_ref: 'device:local-replacement',
      expected_grant_revision: '1',
      expected_target_revision: '4',
      decision: 'approve',
      authority_mode: 'read_only',
      connection_target: 'replace_credential',
      principal_ref: 'prn_selected_agent',
    }), {
      store,
      ...consentSecurity(store),
      authenticateOwner: async () => ({ isAuthenticated: true, userId: 'user_local' }),
      issueKey,
      now: () => 1_000,
      canonicalBaseUrl: 'http://localhost',
    })

    expect(response.status).toBe(200)
    expect(issueKey).toHaveBeenCalledTimes(1)
    expect(store.grants.get('device:local-replacement')).toMatchObject({
      status: 'approved',
      connectionTarget: { kind: 'replace_credential', principalRef: 'prn_selected_agent' },
      replacement,
    })
  })
  it('returns Clerk reverification hints before reservation and terminal JSON when signed evidence is unavailable', async () => {
    const store = storeFixture()
    await store.insertGrant({ grantRef: 'device:proof-gate', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_tools:call', 'customer_requests:read_only'], requestedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'd-proof', userCodeHash: 'u-proof', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Proof assistant' })
    const reserveConsent = vi.fn<NonNullable<OAuthApiOptions['reserveConsent']>>()
    const issueKey = vi.fn<NonNullable<OAuthApiOptions['issueKey']>>()
    const request = () => formRequest('http://localhost/oauth/authorize', {
      grant_ref: 'device:proof-gate',
      expected_grant_revision: '1',
      expected_target_revision: '1',
      decision: 'approve',
      authority_mode: 'read_only',
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
    await store.insertGrant({ grantRef: 'device:rate-storage-outage', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_tools:call', 'customer_requests:read_only'], requestedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'd-rate-storage', userCodeHash: 'u-rate-storage', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Rate-safe assistant' })
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
      authority_mode: 'read_only',
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
    await store.insertGrant({ grantRef: 'device:issuance-outage', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_tools:call', 'customer_requests:read_only'], requestedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'd-outage', userCodeHash: 'u-outage', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Unavailable assistant' })
    const response = await handleOAuthConsentPost(formRequest('http://localhost/oauth/authorize', { grant_ref: 'device:issuance-outage', expected_grant_revision: '1', expected_target_revision: '1', decision: 'approve', authority_mode: 'read_only', connection_target: 'new_agent' }), {
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
    await store.insertGrant({ grantRef: 'device:foreign-origin', revision: 1, flow: 'device_code', clientId: 'client-local', requestedScopes: ['market_tools:call', 'customer_requests:read_only'], requestedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, approvedAccess: { environment: 'sandbox', ...allTools, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS }, deviceCodeHash: 'd-foreign', userCodeHash: 'u-foreign', status: 'pending', createdAt: 1_000, expiresAt: 601_000, nextPollAt: 1_000, displayName: 'Local assistant' })
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
