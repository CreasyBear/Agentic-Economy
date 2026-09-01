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
    requestedAccess: AgentAccessOAuthRequestedAccess
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
    redirectUri?: string
    requestedScopes?: string[]
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
  grantTypes: ('authorization_code' | 'urn:ietf:params:oauth:grant-type:device_code')[]
  tokenEndpointAuthMethod: 'none'
  createdAt: number
  lastUsedAt?: number
} }
type ClientReadArgs = { clientId: string }
const insertGrant = sourceMutation<GrantArgs, null>('agentAccessOAuth:insertGrant')
const getGrantByHash = sourceQuery<GrantReadArgs, AgentAccessOAuthGrant | null>('agentAccessOAuth:getGrantByHash')
const getGrantByRef = sourceQuery<GrantRefArgs, AgentAccessOAuthGrant | null>('agentAccessOAuth:getGrantByRef')
const updateGrant = sourceMutation<GrantUpdateArgs, AgentAccessOAuthGrant | null>('agentAccessOAuth:updateGrant')
const insertClient = sourceMutation<ClientArgs, null>('agentAccessOAuth:insertClient')
const getClient = sourceQuery<ClientReadArgs, AgentAccessOAuthClient | null>('agentAccessOAuth:getClient')
export type AgentAccessConsentReservationResult =
  | Readonly<{ kind: 'reserved' | 'replayed'; grantRef: string; grantRevision: number; commandDigest: string; correlationRef: string }>
  | Readonly<{ kind: 'refused'; code: 'authentication_required' | 'reauthentication_required' | 'proof_stale' | 'proof_replayed' | 'command_changed' }>
  | Readonly<{ kind: 'conflict'; code: 'stale_grant' | 'stale_target' | 'invalid_state' | 'authority_mismatch' }>
  | Readonly<{ kind: 'rate_limited'; retryAfter: number }>

type ReserveConsentCommand = Readonly<{
  grantRef: string
  expectedGrantRevision: number
  expectedTargetRevision: number
  authorityMode: 'inspect_only' | 'approve_each' | 'bounded_mandate' | 'full_yolo'
  connectionTarget: Readonly<{ kind: 'new_agent' }> | Readonly<{ kind: 'replace_credential'; principalRef: string }>
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
  connectionTarget: ReserveConsentCommand['connectionTarget']
  proof: ReserveConsentCommand['proof']
}>): Promise<AgentAccessConsentReservationResult> {
  const operationKey = `oauth:grant:${input.grantRef}:reserve:${input.expectedGrantRevision}`
  const command: ReserveConsentCommand = {
    grantRef: input.grantRef,
    expectedGrantRevision: input.expectedGrantRevision,
    expectedTargetRevision: input.expectedTargetRevision,
    authorityMode: input.authorityMode,
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
): AgentAccessOAuthStore {
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
  }
}

function grantForConvex(grant: AgentAccessOAuthGrant): GrantArgs['grant'] {
  return {
    grantRef: grant.grantRef,
    revision: grant.revision,
    flow: grant.flow,
    clientId: grant.clientId,
    requestedScopes: [...grant.requestedScopes],
    requestedAccess: requestedAccessForConvex(grant.requestedAccess),
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
    expiresInSeconds: requestedAccess.expiresInSeconds,
    ...(requestedAccess.maximumSpendPerInvocation === undefined
      ? {}
      : { maximumSpendPerInvocation: { ...requestedAccess.maximumSpendPerInvocation } }),
    ...(requestedAccess.maximumDailySpend === undefined
      ? {}
      : { maximumDailySpend: { ...requestedAccess.maximumDailySpend } }),
    ...(requestedAccess.maximumMonthlySpend === undefined
      ? {}
      : { maximumMonthlySpend: { ...requestedAccess.maximumMonthlySpend } }),
    ...(requestedAccess.maximumConcurrentInvocations === undefined
      ? {}
      : { maximumConcurrentInvocations: requestedAccess.maximumConcurrentInvocations }),
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
    ...(patch.redirectUri === undefined ? {} : { redirectUri: patch.redirectUri }),
    ...(patch.requestedScopes === undefined ? {} : { requestedScopes: [...patch.requestedScopes] }),
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
