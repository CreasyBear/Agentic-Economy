import { MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'
import { AGENT_ACCESS_KEY_TTL_SECONDS } from '@/modules/agent-access/agent-access'
import { defaultSandboxAgentAccessPolicy } from '@/modules/agent-access/sandbox-policy'
import {
  requestedScopesForMode,
  type AgentAccessOAuthClient,
  type AgentAccessOAuthGrant,
  type AgentAccessOAuthStore,
} from '@/modules/agent-access/oauth-state'
import type { OAuthApiOptions } from '@/lib/server/agent-access-oauth-api'
import type {
  AgentAccessOAuthRefreshFamily,
  AgentAccessOAuthRefreshStore,
} from '@/lib/server/agent-access-oauth-store'

export type OAuthStoreFixture = AgentAccessOAuthStore & {
  grants: Map<string, AgentAccessOAuthGrant>
  clients: Map<string, AgentAccessOAuthClient>
  updates: Array<Readonly<{
    expectedStatus: AgentAccessOAuthGrant['status']
    expectedRevision: number
    patchStatus?: AgentAccessOAuthGrant['status']
    expectedIssuanceStartedAt?: number
  }>>
}

export const strictAuthObject: NonNullable<OAuthApiOptions['authObject']> = {
  isAuthenticated: true,
  userId: 'user_local',
  has: () => true,
  sessionClaims: { reverification_id: 'rev_test_consent' },
  factorVerificationAge: [0, 0],
  getToken: async () => 'convex-test-token',
}

export function consentSecurity(
  store: OAuthStoreFixture,
  ownerId = 'user_local',
): Pick<OAuthApiOptions, 'authObject' | 'reserveConsent'> {
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

export function refreshFamilyFixture(input: Partial<AgentAccessOAuthRefreshFamily> = {}): AgentAccessOAuthRefreshFamily {
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

export function refreshStoreFixture(
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

export function defaultOAuthClientFixture(
  clientId = 'client-local',
  overrides: Partial<AgentAccessOAuthClient> = {},
): AgentAccessOAuthClient {
  return {
    clientId,
    clientName: 'Local assistant',
    redirectUris: ['http://localhost/callback'],
    grantTypes: ['urn:ietf:params:oauth:grant-type:device_code'],
    tokenEndpointAuthMethod: 'none',
    createdAt: 1_000,
    ...overrides,
  }
}

export function defaultOAuthGrantFixture(
  grantRef = 'device:default',
  overrides: Partial<AgentAccessOAuthGrant> = {},
): AgentAccessOAuthGrant {
  return {
    grantRef,
    revision: 1,
    flow: 'device_code',
    clientId: 'client-local',
    requestedScopes: ['market_tools:call', 'customer_requests:read_only'],
    requestedAccess: {
      environment: 'sandbox',
      toolAccess: 'all_admitted',
      toolRefs: [],
      expiresInSeconds: 604_800,
    },
    approvedAccess: {
      environment: 'sandbox',
      toolAccess: 'all_admitted',
      toolRefs: [],
      expiresInSeconds: 604_800,
    },
    deviceCodeHash: 'd-code',
    userCodeHash: 'u-code',
    status: 'pending',
    createdAt: 1_000,
    expiresAt: 601_000,
    nextPollAt: 1_000,
    displayName: 'Default assistant',
    ...overrides,
  }
}

export function createOAuthStoreFixture(): OAuthStoreFixture {
  const grants = new Map<string, AgentAccessOAuthGrant>()
  const clients = new Map<string, AgentAccessOAuthClient>()
  const updates: OAuthStoreFixture['updates'] = []

  return {
    grants,
    clients,
    updates,
    async insertGrant(grant) {
      grants.set(grant.grantRef, grant)
    },
    async getGrantByHash(kind, hash) {
      for (const grant of grants.values()) {
        const value =
          kind === 'device'
            ? grant.deviceCodeHash
            : kind === 'user'
              ? grant.userCodeHash
              : grant.authorizationCodeHash
        if (value === hash) return grant
      }
      return null
    },
    async getGrantByRef(grantRef) {
      return grants.get(grantRef) ?? null
    },
    async updateGrant(grantRef, expectedStatus, expectedRevision, patch, expectedIssuanceStartedAt) {
      const current = grants.get(grantRef)
      updates.push({
        expectedStatus,
        expectedRevision,
        ...(patch.status === undefined ? {} : { patchStatus: patch.status }),
        ...(expectedIssuanceStartedAt === undefined ? {} : { expectedIssuanceStartedAt }),
      })
      if (
        current === undefined
        || current.status !== expectedStatus
        || current.revision !== expectedRevision
        || (expectedIssuanceStartedAt !== undefined
          && current.issuanceStartedAt !== expectedIssuanceStartedAt)
      ) {
        return null
      }
      const pollScheduleOnly = Object.keys(patch).length === 1 && patch.nextPollAt !== undefined
      const updated = {
        ...current,
        ...patch,
        revision: pollScheduleOnly ? current.revision : current.revision + 1,
      }
      grants.set(grantRef, updated)
      return updated
    },
    async insertClient(client) {
      clients.set(client.clientId, client)
    },
    async getClient(clientId) {
      return clients.get(clientId) ?? null
    },
  }
}
