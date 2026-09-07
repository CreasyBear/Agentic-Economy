import {
  createAuthenticatedSourceTransport,
  createPublicSourceTransport,
  sourceMutation,
  sourceQuery,
  type ConvexSourceAuth,
} from './convex-source'
import {
  sourceWriteAdmissionFromRequest,
  sourceWriteRequestFromAdmission,
} from './source-write-admission'
import type {
  AgentAccessOAuthClient,
  AgentAccessOAuthGrant,
  AgentAccessOAuthGrantPatch,
  AgentAccessOAuthGrantStatus,
  AgentAccessOAuthRequestedAccess,
  AgentAccessOAuthStore,
} from '@/modules/agent-access/oauth-state'
import type { AgentAccessEnvironment } from '@/modules/agent-access/agent-access'
import type { AgentAccessAuthorityMode } from '@/modules/agent-access/contract'
import type { AgentAccessToolAccess, AgentAccessPolicy } from '@/modules/agent-access/policy'
import type {
  SourceWriteAdmission,
  SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'

type SourceWriteArgs = {
  operationKey: string
  correlationId: string
  sourceWriteRequest: SourceWriteAdmissionRequest
  sourceWrite: SourceWriteAdmission
}

type GrantArgs = SourceWriteArgs & {
  grant: {
    grantRef: string
    revision: number
    flow: 'device_code' | 'authorization_code'
    clientId: string
    requestedScopes: string[]
    offlineAccess?: true
    requestedAccess: AgentAccessOAuthRequestedAccess
    approvedAccess: AgentAccessOAuthRequestedAccess
    status: AgentAccessOAuthGrantStatus
    createdAt: number
    expiresAt: number
    displayName: string
    redirectUri?: string
    codeChallenge?: string
    codeChallengeMethod?: 'S256'
    deviceCodeHash?: string
    userCodeHash?: string
    authorizationCodeHash?: string
    ownerId?: string
    keyId?: string
    approvedAt?: number
    issuanceKey?: string
    issuanceStartedAt?: number
    consumedAt?: number
    nextPollAt?: number
    deliveryClaimToken?: string
    deliveryCredentialHash?: string
    deliveryReplayUntil?: number
    denialReason?: 'access_denied'
    connectionTarget?: AgentAccessOAuthGrant['connectionTarget']
    replacement?: AgentAccessOAuthGrant['replacement']
  }
}

type GrantReadArgs = SourceWriteArgs & { kind: 'device' | 'user' | 'authorization'; hash: string }
type GrantRefArgs = SourceWriteArgs & { grantRef: string }
type GrantUpdateArgs = SourceWriteArgs & {
  grantRef: string
  expectedStatus: AgentAccessOAuthGrantStatus
  expectedRevision: number
  expectedIssuanceStartedAt?: number
  patch: {
    status?: AgentAccessOAuthGrantStatus
    approvedAccess?: AgentAccessOAuthRequestedAccess
    redirectUri?: string
    requestedScopes?: string[]
    offlineAccess?: true
    codeChallenge?: string
    codeChallengeMethod?: 'S256'
    deviceCodeHash?: string
    userCodeHash?: string
    authorizationCodeHash?: string
    ownerId?: string
    keyId?: string
    createdAt?: number
    expiresAt?: number
    approvedAt?: number
    issuanceKey?: string
    issuanceStartedAt?: number
    consumedAt?: number
    nextPollAt?: number
    deliveryClaimToken?: string
    deliveryCredentialHash?: string
    deliveryReplayUntil?: number
    displayName?: string
    denialReason?: 'access_denied'
    connectionTarget?: AgentAccessOAuthGrant['connectionTarget']
    replacement?: AgentAccessOAuthGrant['replacement']
  }
}
type ClientArgs = SourceWriteArgs & { client: {
  clientId: string
  clientName: string
  redirectUris: string[]
  grantTypes: ('authorization_code' | 'urn:ietf:params:oauth:grant-type:device_code' | 'refresh_token')[]
  tokenEndpointAuthMethod: 'none'
  createdAt: number
  lastUsedAt?: number
} }
type ClientReadArgs = { clientId: string }

export type AgentAccessOAuthRefreshFamily = Readonly<{
  familyRef: string
  revision: number
  clientId: string
  ownerId: string
  ownerPrincipalRef: string
  providerSubject: string
  principalRef: string
  displayName: string
  applicationRef: string
  environment: AgentAccessEnvironment
  scopes: readonly string[]
  authorityMode: AgentAccessAuthorityMode
  toolAccess: AgentAccessToolAccess
  toolRefs: readonly string[]
  spendingPolicy: AgentAccessPolicy
  currentCredentialRef: string
  currentProviderCredentialId: string
  currentGrantRef: string
  currentGeneration: number
  currentAccessExpiresAt: number
  currentTokenHash: string
  lifecycle: 'active' | 'revoked' | 'expired'
  createdAt: number
  expiresAt: number
  updatedAt: number
  revokedAt?: number
  revocationReason?: string
}>

export type AgentAccessOAuthRefreshCreateResult =
  | Readonly<{ kind: 'recorded' | 'replayed'; family: AgentAccessOAuthRefreshFamily }>
  | Readonly<{ kind: 'conflict'; code: string }>

export type AgentAccessOAuthRefreshClaimResult =
  | Readonly<{ kind: 'claimed' | 'replayed'; family: AgentAccessOAuthRefreshFamily; claimRef: string }>
  | Readonly<{ kind: 'recovered'; family: AgentAccessOAuthRefreshFamily; invalidatedProviderCredentialId?: string }>
  | Readonly<{ kind: 'invalid_grant' | 'busy' | 'revoked' }>

export type AgentAccessOAuthRefreshCommitResult =
  | Readonly<{
      kind: 'completed' | 'replayed'
      family: AgentAccessOAuthRefreshFamily
      providerCleanupTarget?: Readonly<{ credentialRef: string; providerCredentialId: string }>
    }>
  | Readonly<{ kind: 'conflict'; code: string }>

export type AgentAccessOAuthRefreshRevokeResult = Readonly<{
  kind: 'completed' | 'replayed' | 'unknown'
}>

export type AgentAccessOAuthRefreshStore = Readonly<{
  createRefreshFamily: (input: Readonly<{
    grantRef: string
    keyId: string
    clientId: string
    tokenHash: string
    accessTokenHash: string
    createdAt: number
    expiresAt: number
  }>) => Promise<AgentAccessOAuthRefreshCreateResult>
  claimRefreshFamily: (input: Readonly<{
    tokenHash: string
    clientId: string
    claimRef: string
    successorTokenHash: string
    now: number
    claimExpiresAt: number
  }>) => Promise<AgentAccessOAuthRefreshClaimResult>
  commitRefreshFamilyRotation: (input: Readonly<{
    familyRef: string
    expectedRevision: number
    tokenHash: string
    claimRef: string
    successorTokenHash: string
    issuanceKey: string
    successorGrantRef: string
    successorCredentialId: string
    successorAccessTokenHash: string
    createdAt: number
    accessExpiresAt: number
    replayUntil: number
  }>) => Promise<AgentAccessOAuthRefreshCommitResult>
  revokeRefreshFamily: (input: Readonly<{
    tokenHash: string
    clientId: string
    now: number
    reason: string
  }>) => Promise<AgentAccessOAuthRefreshRevokeResult>
  revokeRefreshFamilyByAccessToken: (input: Readonly<{
    tokenHash: string
    clientId: string
    now: number
    reason: string
  }>) => Promise<AgentAccessOAuthRefreshRevokeResult>
}>

type CreateRefreshArgs = SourceWriteArgs & Parameters<AgentAccessOAuthRefreshStore['createRefreshFamily']>[0]
type ClaimRefreshArgs = SourceWriteArgs & Parameters<AgentAccessOAuthRefreshStore['claimRefreshFamily']>[0]
type CommitRefreshArgs = SourceWriteArgs & Parameters<AgentAccessOAuthRefreshStore['commitRefreshFamilyRotation']>[0]
type RevokeRefreshArgs = SourceWriteArgs & Parameters<AgentAccessOAuthRefreshStore['revokeRefreshFamily']>[0]
type RevokeRefreshByAccessTokenArgs = SourceWriteArgs & Parameters<AgentAccessOAuthRefreshStore['revokeRefreshFamilyByAccessToken']>[0]
const insertGrant = sourceMutation<GrantArgs, null>('agentAccessOAuth:insertGrant')
const getGrantByHash = sourceQuery<GrantReadArgs, AgentAccessOAuthGrant | null>('agentAccessOAuth:getGrantByHash')
const getGrantByRef = sourceQuery<GrantRefArgs, AgentAccessOAuthGrant | null>('agentAccessOAuth:getGrantByRef')
const updateGrant = sourceMutation<GrantUpdateArgs, AgentAccessOAuthGrant | null>('agentAccessOAuth:updateGrant')
const insertClient = sourceMutation<ClientArgs, null>('agentAccessOAuth:insertClient')
const getClient = sourceQuery<ClientReadArgs, AgentAccessOAuthClient | null>('agentAccessOAuth:getClient')
const createRefreshFamily = sourceMutation<CreateRefreshArgs, AgentAccessOAuthRefreshCreateResult>('agentAccessOAuth:createRefreshFamily')
const claimRefreshFamily = sourceMutation<ClaimRefreshArgs, AgentAccessOAuthRefreshClaimResult>('agentAccessOAuth:claimRefreshFamily')
const commitRefreshFamilyRotation = sourceMutation<CommitRefreshArgs, AgentAccessOAuthRefreshCommitResult>('agentAccessOAuth:commitRefreshFamilyRotation')
const revokeRefreshFamily = sourceMutation<RevokeRefreshArgs, AgentAccessOAuthRefreshRevokeResult>('agentAccessOAuth:revokeRefreshFamily')
const revokeRefreshFamilyByAccessToken = sourceMutation<RevokeRefreshByAccessTokenArgs, AgentAccessOAuthRefreshRevokeResult>('agentAccessOAuth:revokeRefreshFamilyByAccessToken')
export type AgentAccessConsentReservationResult =
  | Readonly<{ kind: 'reserved' | 'replayed'; grantRef: string; grantRevision: number; commandDigest: string; correlationRef: string }>
  | Readonly<{ kind: 'refused'; code: 'authentication_required' | 'reauthentication_required' | 'proof_stale' | 'proof_replayed' | 'command_changed' }>
  | Readonly<{ kind: 'conflict'; code: 'stale_grant' | 'stale_target' | 'invalid_state' | 'authority_mismatch' }>
  | Readonly<{ kind: 'rate_limited'; retryAfter: number }>
  | Readonly<{ kind: 'unavailable'; code: 'security_control_unavailable'; correlationRef: string }>

type ReserveConsentCommand = Readonly<{
  grantRef: string
  expectedGrantRevision: number
  expectedTargetRevision: number
  authorityMode: AgentAccessAuthorityMode
  approvedToolAccess: 'all_admitted' | 'selected_tools'
  approvedToolRefs: readonly string[]
  connectionTarget: Readonly<{ kind: 'new_agent' }> | Readonly<{
    kind: 'replace_credential'
    principalRef: string
    replacementMode: 'planned' | 'compromise'
  }>
  proof: Readonly<{
    reverificationId: string
    firstFactorAgeMinutes: number
    secondFactorAgeMinutes: number
  }>
  operationKey: string
  correlationId: string
}>

const reserveConsent = sourceMutation<ReserveConsentCommand & SourceWriteArgs, AgentAccessConsentReservationResult>(
  'agentAccessOAuth:reserveAgentAccessConsent',
)

export async function reserveAgentAccessConsentForOwner(input: Readonly<{
  request: Request
  body: string | Uint8Array
  authObject: ConvexSourceAuth
  grantRef: string
  expectedGrantRevision: number
  expectedTargetRevision: number
  authorityMode: ReserveConsentCommand['authorityMode']
  approvedToolAccess: ReserveConsentCommand['approvedToolAccess']
  approvedToolRefs: readonly string[]
  connectionTarget: ReserveConsentCommand['connectionTarget']
  proof: ReserveConsentCommand['proof']
}>): Promise<AgentAccessConsentReservationResult> {
  const operationKey = `oauth:grant:${input.grantRef}:reserve:${input.expectedGrantRevision}`
  const command: ReserveConsentCommand = {
    grantRef: input.grantRef,
    expectedGrantRevision: input.expectedGrantRevision,
    expectedTargetRevision: input.expectedTargetRevision,
    authorityMode: input.authorityMode,
    approvedToolAccess: input.approvedToolAccess,
    approvedToolRefs: [...input.approvedToolRefs],
    connectionTarget: input.connectionTarget,
    proof: input.proof,
    operationKey,
    correlationId: operationKey,
  }
  const sourceWrite = await sourceWriteAdmissionFromRequest({
    request: input.request,
    command,
    body: input.body,
    scope: 'agent_identity',
    operationKey,
    correlationId: operationKey,
  })
  const transport = await createAuthenticatedSourceTransport({ authObject: input.authObject })
  return await transport.mutation(reserveConsent, {
    ...command,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    sourceWrite,
  })
}

export function createConvexAgentAccessOAuthStore(
  request: Request,
  body: string | Uint8Array,
): AgentAccessOAuthStore & AgentAccessOAuthRefreshStore {
  const transport = createPublicSourceTransport()
  const sourceWriteFor = async (
    command: Readonly<{ operationKey: string; correlationId: string }>,
  ): Promise<SourceWriteArgs> => {
    const sourceWrite = await sourceWriteAdmissionFromRequest({
      request,
      command,
      body,
      scope: 'agent_identity',
      operationKey: command.operationKey,
      correlationId: command.correlationId,
    })
    return {
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
    }
  }
  return {
    insertGrant: async (grant) => {
      const command = {
        grant: grantForConvex(grant),
        operationKey: `oauth:grant:${grant.grantRef}:insert`,
        correlationId: `oauth:grant:${grant.grantRef}:insert`,
      }
      await transport.mutation(insertGrant, { ...command, ...await sourceWriteFor(command) })
    },
    getGrantByHash: async (kind, hash) => {
      const operationKey = `oauth:grant:${kind}:${hash}:read`
      const command = { kind, hash, operationKey, correlationId: operationKey }
      return await transport.query(getGrantByHash, { ...command, ...await sourceWriteFor(command) })
    },
    getGrantByRef: async (grantRef) => {
      const operationKey = `oauth:grant:${grantRef}:read`
      const command = { grantRef, operationKey, correlationId: operationKey }
      return await transport.query(getGrantByRef, { ...command, ...await sourceWriteFor(command) })
    },
    updateGrant: async (grantRef, expectedStatus, expectedRevision, patch, expectedIssuanceStartedAt) => {
      const operationKey = `oauth:grant:${grantRef}:update:${expectedStatus}:revision:${expectedRevision}:${patch.status ?? 'fields'}`
      const command = {
        grantRef,
        expectedStatus,
        expectedRevision,
        ...(expectedIssuanceStartedAt === undefined ? {} : { expectedIssuanceStartedAt }),
        patch: patchForConvex(patch),
        operationKey,
        correlationId: operationKey,
      }
      return await transport.mutation(updateGrant, { ...command, ...await sourceWriteFor(command) })
    },
    insertClient: async (client) => {
      const command = {
        client: clientForConvex(client),
        operationKey: `oauth:client:${client.clientId}:insert`,
        correlationId: `oauth:client:${client.clientId}:insert`,
      }
      await transport.mutation(insertClient, { ...command, ...await sourceWriteFor(command) })
    },
    getClient: async (clientId) => await transport.query(getClient, { clientId }),
    createRefreshFamily: async (input) => {
      const operationKey = `oauth:refresh:${input.grantRef}:create`
      const command = { ...input, operationKey, correlationId: operationKey }
      return await transport.mutation(createRefreshFamily, { ...command, ...await sourceWriteFor(command) })
    },
    claimRefreshFamily: async (input) => {
      const operationKey = `oauth:refresh:${input.claimRef}:claim`
      const command = { ...input, operationKey, correlationId: operationKey }
      return await transport.mutation(claimRefreshFamily, { ...command, ...await sourceWriteFor(command) })
    },
    commitRefreshFamilyRotation: async (input) => {
      const operationKey = `oauth:refresh:${input.familyRef}:commit:${input.expectedRevision}`
      const command = { ...input, operationKey, correlationId: operationKey }
      return await transport.mutation(commitRefreshFamilyRotation, { ...command, ...await sourceWriteFor(command) })
    },
    revokeRefreshFamily: async (input) => {
      const operationKey = `oauth:refresh:${input.clientId}:revoke:${input.tokenHash}`
      const command = { ...input, operationKey, correlationId: operationKey }
      return await transport.mutation(revokeRefreshFamily, { ...command, ...await sourceWriteFor(command) })
    },
    revokeRefreshFamilyByAccessToken: async (input) => {
      const operationKey = `oauth:refresh:${input.clientId}:revoke-access:${input.tokenHash}`
      const command = { ...input, operationKey, correlationId: operationKey }
      return await transport.mutation(revokeRefreshFamilyByAccessToken, { ...command, ...await sourceWriteFor(command) })
    },
  }
}

function grantForConvex(grant: AgentAccessOAuthGrant): GrantArgs['grant'] {
  return {
    grantRef: grant.grantRef,
    revision: grant.revision,
    flow: grant.flow,
    clientId: grant.clientId,
    requestedScopes: [...grant.requestedScopes],
    ...(grant.offlineAccess === undefined ? {} : { offlineAccess: true }),
    requestedAccess: requestedAccessForConvex(grant.requestedAccess),
    approvedAccess: requestedAccessForConvex(grant.approvedAccess),
    status: grant.status,
    createdAt: grant.createdAt,
    expiresAt: grant.expiresAt,
    displayName: grant.displayName,
    ...(grant.redirectUri === undefined ? {} : { redirectUri: grant.redirectUri }),
    ...(grant.codeChallenge === undefined ? {} : { codeChallenge: grant.codeChallenge }),
    ...(grant.codeChallengeMethod === undefined ? {} : { codeChallengeMethod: grant.codeChallengeMethod }),
    ...(grant.deviceCodeHash === undefined ? {} : { deviceCodeHash: grant.deviceCodeHash }),
    ...(grant.userCodeHash === undefined ? {} : { userCodeHash: grant.userCodeHash }),
    ...(grant.authorizationCodeHash === undefined ? {} : { authorizationCodeHash: grant.authorizationCodeHash }),
    ...(grant.ownerId === undefined ? {} : { ownerId: grant.ownerId }),
    ...(grant.keyId === undefined ? {} : { keyId: grant.keyId }),
    ...(grant.approvedAt === undefined ? {} : { approvedAt: grant.approvedAt }),
    ...(grant.issuanceKey === undefined ? {} : { issuanceKey: grant.issuanceKey }),
    ...(grant.issuanceStartedAt === undefined ? {} : { issuanceStartedAt: grant.issuanceStartedAt }),
    ...(grant.consumedAt === undefined ? {} : { consumedAt: grant.consumedAt }),
    ...(grant.nextPollAt === undefined ? {} : { nextPollAt: grant.nextPollAt }),
    ...(grant.deliveryClaimToken === undefined ? {} : { deliveryClaimToken: grant.deliveryClaimToken }),
    ...(grant.deliveryCredentialHash === undefined ? {} : { deliveryCredentialHash: grant.deliveryCredentialHash }),
    ...(grant.deliveryReplayUntil === undefined ? {} : { deliveryReplayUntil: grant.deliveryReplayUntil }),
    ...(grant.denialReason === undefined ? {} : { denialReason: grant.denialReason }),
    ...(grant.connectionTarget === undefined ? {} : { connectionTarget: grant.connectionTarget }),
    ...(grant.replacement === undefined ? {} : { replacement: grant.replacement }),
  }
}

function requestedAccessForConvex(
  requestedAccess: AgentAccessOAuthRequestedAccess,
): GrantArgs['grant']['requestedAccess'] {
  return {
    environment: requestedAccess.environment,
    toolAccess: requestedAccess.toolAccess,
    toolRefs: [...requestedAccess.toolRefs],
    expiresInSeconds: requestedAccess.expiresInSeconds,
    ...(requestedAccess.maximumSpendPerCall === undefined
      ? {}
      : { maximumSpendPerCall: { ...requestedAccess.maximumSpendPerCall } }),
    ...(requestedAccess.maximumDailySpend === undefined
      ? {}
      : { maximumDailySpend: { ...requestedAccess.maximumDailySpend } }),
    ...(requestedAccess.maximumMonthlySpend === undefined
      ? {}
      : { maximumMonthlySpend: { ...requestedAccess.maximumMonthlySpend } }),
    ...(requestedAccess.maximumConcurrentCalls === undefined
      ? {}
      : { maximumConcurrentCalls: requestedAccess.maximumConcurrentCalls }),
    ...(requestedAccess.maximumCallsPerMinute === undefined
      ? {}
      : { maximumCallsPerMinute: requestedAccess.maximumCallsPerMinute }),
    ...(requestedAccess.maximumCallsPerHour === undefined
      ? {}
      : { maximumCallsPerHour: requestedAccess.maximumCallsPerHour }),
  }
}

function patchForConvex(patch: AgentAccessOAuthGrantPatch): GrantUpdateArgs['patch'] {
  return {
    ...(patch.status === undefined ? {} : { status: patch.status }),
    ...(patch.approvedAccess === undefined ? {} : { approvedAccess: requestedAccessForConvex(patch.approvedAccess) }),
    ...(patch.redirectUri === undefined ? {} : { redirectUri: patch.redirectUri }),
    ...(patch.requestedScopes === undefined ? {} : { requestedScopes: [...patch.requestedScopes] }),
    ...(patch.offlineAccess === undefined ? {} : { offlineAccess: true }),
    ...(patch.codeChallenge === undefined ? {} : { codeChallenge: patch.codeChallenge }),
    ...(patch.codeChallengeMethod === undefined ? {} : { codeChallengeMethod: patch.codeChallengeMethod }),
    ...(patch.deviceCodeHash === undefined ? {} : { deviceCodeHash: patch.deviceCodeHash }),
    ...(patch.userCodeHash === undefined ? {} : { userCodeHash: patch.userCodeHash }),
    ...(patch.authorizationCodeHash === undefined ? {} : { authorizationCodeHash: patch.authorizationCodeHash }),
    ...(patch.ownerId === undefined ? {} : { ownerId: patch.ownerId }),
    ...(patch.keyId === undefined ? {} : { keyId: patch.keyId }),
    ...(patch.createdAt === undefined ? {} : { createdAt: patch.createdAt }),
    ...(patch.expiresAt === undefined ? {} : { expiresAt: patch.expiresAt }),
    ...(patch.approvedAt === undefined ? {} : { approvedAt: patch.approvedAt }),
    ...(patch.issuanceKey === undefined ? {} : { issuanceKey: patch.issuanceKey }),
    ...(patch.issuanceStartedAt === undefined ? {} : { issuanceStartedAt: patch.issuanceStartedAt }),
    ...(patch.consumedAt === undefined ? {} : { consumedAt: patch.consumedAt }),
    ...(patch.nextPollAt === undefined ? {} : { nextPollAt: patch.nextPollAt }),
    ...(patch.deliveryClaimToken === undefined ? {} : { deliveryClaimToken: patch.deliveryClaimToken }),
    ...(patch.deliveryCredentialHash === undefined ? {} : { deliveryCredentialHash: patch.deliveryCredentialHash }),
    ...(patch.deliveryReplayUntil === undefined ? {} : { deliveryReplayUntil: patch.deliveryReplayUntil }),
    ...(patch.displayName === undefined ? {} : { displayName: patch.displayName }),
    ...(patch.denialReason === undefined ? {} : { denialReason: patch.denialReason }),
    ...(patch.connectionTarget === undefined ? {} : { connectionTarget: patch.connectionTarget }),
    ...(patch.replacement === undefined ? {} : { replacement: patch.replacement }),
  }
}

function clientForConvex(client: AgentAccessOAuthClient): ClientArgs['client'] {
  return {
    clientId: client.clientId,
    clientName: client.clientName,
    redirectUris: [...client.redirectUris],
    grantTypes: [...client.grantTypes],
    tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
    createdAt: client.createdAt,
    ...(client.lastUsedAt === undefined ? {} : { lastUsedAt: client.lastUsedAt }),
  }
}
