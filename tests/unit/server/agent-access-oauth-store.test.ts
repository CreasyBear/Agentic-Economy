import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  query: vi.fn(),
  sourceWriteAdmissionFromRequest: vi.fn(),
  sourceWriteRequestFromAdmission: vi.fn(),
}))

vi.mock('@/lib/server/convex-source', () => ({
  createPublicSourceTransport: () => ({ mutation: mocks.mutation, query: mocks.query }),
  createAuthenticatedSourceTransport: () => ({ mutation: mocks.mutation, query: mocks.query }),
  sourceMutation: (name: string) => ({ name }),
  sourceQuery: (name: string) => ({ name }),
}))

vi.mock('@/lib/server/source-write-admission', () => ({
  sourceWriteAdmissionFromRequest: mocks.sourceWriteAdmissionFromRequest,
  sourceWriteRequestFromAdmission: mocks.sourceWriteRequestFromAdmission,
}))

import {
  createConvexAgentAccessOAuthStore,
  reserveAgentAccessConsentForOwner,
} from '@/lib/server/agent-access-oauth-store'
import type { AgentAccessOAuthGrant } from '@/modules/agent-access/oauth-state'

const replacement = {
  principalRef: 'prn_agent_a',
  generation: 2,
  successorCredentialRef: 'crd_successor',
  predecessorCredentialRef: 'crd_predecessor',
  predecessorKeyId: 'key_predecessor',
  successorGrantRef: 'grt_successor',
} as const

const grant: AgentAccessOAuthGrant = {
  grantRef: 'device:persistence',
  revision: 4,
  flow: 'device_code',
  clientId: 'client-persistence',
  requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'],
  requestedAccess: { environment: 'sandbox', expiresInSeconds: 600 },
  status: 'delivery_claimed',
  ownerId: 'owner-one',
  keyId: 'key-successor',
  createdAt: 1_000,
  expiresAt: 601_000,
  approvedAt: 1_001,
  issuanceKey: 'oauth-device-persistence',
  issuanceStartedAt: 1_001,
  deliveryClaimToken: 'claim-token',
  deliveryCredentialHash: 'credential-hash',
  deliveryReplayUntil: 601_000,
  displayName: 'Persistence agent',
  connectionTarget: { kind: 'replace_credential', principalRef: 'prn_agent_a' },
  replacement,
}

describe('Convex Agent Access OAuth store adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mutation.mockResolvedValue(null)
    mocks.sourceWriteAdmissionFromRequest.mockResolvedValue({ kind: 'admitted' })
    mocks.sourceWriteRequestFromAdmission.mockReturnValue({ kind: 'request' })
  })

  it('persists issuance, delivery, target, replacement, and lease-CAS material', async () => {
    const store = createConvexAgentAccessOAuthStore(
      new Request('https://ae.example/oauth/token', { method: 'POST' }),
      'grant-body',
    )

    await store.insertGrant(grant)
    expect(mocks.mutation).toHaveBeenNthCalledWith(
      1,
      { name: 'agentAccessOAuth:insertGrant' },
      expect.objectContaining({ grant: expect.objectContaining({
        issuanceKey: grant.issuanceKey,
        issuanceStartedAt: grant.issuanceStartedAt,
        deliveryClaimToken: grant.deliveryClaimToken,
        deliveryCredentialHash: grant.deliveryCredentialHash,
        deliveryReplayUntil: grant.deliveryReplayUntil,
        connectionTarget: grant.connectionTarget,
        replacement,
      }) }),
    )

    await store.updateGrant(grant.grantRef, 'issuing', grant.revision, grant, 1_001)
    expect(mocks.mutation).toHaveBeenNthCalledWith(
      2,
      { name: 'agentAccessOAuth:updateGrant' },
      expect.objectContaining({
        expectedRevision: grant.revision,
        expectedIssuanceStartedAt: 1_001,
        patch: expect.objectContaining({
          issuanceKey: grant.issuanceKey,
          issuanceStartedAt: grant.issuanceStartedAt,
          deliveryCredentialHash: grant.deliveryCredentialHash,
          deliveryReplayUntil: grant.deliveryReplayUntil,
          connectionTarget: grant.connectionTarget,
          replacement,
        }),
      }),
    )
    expect(mocks.mutation.mock.calls[1]?.[1]?.patch).not.toHaveProperty('revision')
  })

  it('signs and sends only the exact server-derived consent reservation command', async () => {
    mocks.mutation.mockResolvedValue({
      kind: 'reserved',
      grantRef: 'device:proof-bound',
      grantRevision: 2,
      commandDigest: 'sha256:command',
      correlationRef: 'oauth:grant:device:proof-bound:reserve:1',
    })
    const request = new Request('https://ae.example/oauth/authorize', { method: 'POST' })
    const authObject = { isAuthenticated: true, getToken: vi.fn().mockResolvedValue('convex-token') }
    const result = await reserveAgentAccessConsentForOwner({
      request,
      body: 'exact-body',
      authObject,
      grantRef: 'device:proof-bound',
      expectedGrantRevision: 1,
      expectedTargetRevision: 1,
      authorityMode: 'inspect_only',
      connectionTarget: { kind: 'new_agent' },
      proof: { reverificationId: 'rev_exact', firstFactorAgeMinutes: 3, secondFactorAgeMinutes: -1 },
    })

    const exactCommand = {
      grantRef: 'device:proof-bound',
      expectedGrantRevision: 1,
      expectedTargetRevision: 1,
      authorityMode: 'inspect_only',
      connectionTarget: { kind: 'new_agent' },
      proof: { reverificationId: 'rev_exact', firstFactorAgeMinutes: 3, secondFactorAgeMinutes: -1 },
      operationKey: 'oauth:grant:device:proof-bound:reserve:1',
      correlationId: 'oauth:grant:device:proof-bound:reserve:1',
    } as const
    expect(mocks.sourceWriteAdmissionFromRequest).toHaveBeenCalledWith({
      request,
      command: exactCommand,
      body: 'exact-body',
      scope: 'agent_identity',
      operationKey: 'oauth:grant:device:proof-bound:reserve:1',
      correlationId: 'oauth:grant:device:proof-bound:reserve:1',
    })
    expect(mocks.mutation).toHaveBeenCalledWith(
      { name: 'agentAccessOAuth:reserveAgentAccessConsent' },
      expect.objectContaining(exactCommand),
    )
    expect(result.kind).toBe('reserved')
  })
})
