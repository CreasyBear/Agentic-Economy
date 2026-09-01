import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const requestedAccessAmount = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})
const requestedAccess = v.object({
  environment: v.union(v.literal('sandbox'), v.literal('production')),
  operationAccess: v.union(v.literal('all_admitted'), v.literal('selected_operations')),
  operationRefs: v.array(v.string()),
  maximumSpendPerInvocation: v.optional(requestedAccessAmount),
  maximumDailySpend: v.optional(requestedAccessAmount),
  maximumMonthlySpend: v.optional(requestedAccessAmount),
  maximumConcurrentInvocations: v.optional(v.number()),
  maximumCallsPerMinute: v.optional(v.number()),
  maximumCallsPerHour: v.optional(v.number()),
  expiresInSeconds: v.number(),
})
const connectionTarget = v.union(
  v.object({ kind: v.literal('new_agent'), displayName: v.string() }),
  v.object({
    kind: v.literal('replace_credential'),
    principalRef: v.string(),
    replacementMode: v.union(v.literal('planned'), v.literal('compromise')),
  }),
)
const replacement = v.object({
  principalRef: v.string(),
  generation: v.number(),
  successorCredentialRef: v.string(),
  predecessorCredentialRef: v.string(),
  predecessorKeyId: v.string(),
  successorGrantRef: v.string(),
})

const agentAccessPredecessorSnapshotValue = v.object({
  credentialId: v.string(),
  applicationRef: v.string(),
  environment: v.union(v.literal('sandbox'), v.literal('production')),
  grantRef: v.string(),
  grantGeneration: v.number(),
  policyDigest: v.string(),
  bindingRef: v.string(),
  bindingRevision: v.number(),
  bindingCredentialGeneration: v.number(),
  credentialRef: v.string(),
  credentialRevision: v.number(),
  credentialGeneration: v.number(),
})

export const agentAccessConsentReservationValue = v.object({
  action: v.union(v.literal('agent_access.create'), v.literal('agent_access.replace_credential')),
  commandDigest: v.string(),
  reverificationId: v.string(),
  targetRevision: v.number(),
  actorPrincipalRef: v.string(),
  ownerPrincipalRevision: v.number(),
  activeAccountRef: v.string(),
  accountRevision: v.number(),
  authoritySource: v.object({
    kind: v.literal('account_ownership'),
    ownershipRef: v.string(),
    ownershipRevision: v.number(),
  }),
  predecessor: v.optional(agentAccessPredecessorSnapshotValue),
  correlationRef: v.string(),
  idempotencyRef: v.string(),
  reservedAt: v.number(),
})

export const agentAccessOAuthTables = {
  agentAccessOAuthGrants: defineTable({
    grantRef: v.string(),
    revision: v.number(),
    flow: v.union(v.literal('device_code'), v.literal('authorization_code')),
    clientId: v.string(),
    redirectUri: v.optional(v.string()),
    requestedScopes: v.array(v.string()),
    requestedAccess,
    approvedAccess: requestedAccess,
    codeChallenge: v.optional(v.string()),
    codeChallengeMethod: v.optional(v.literal('S256')),
    deviceCodeHash: v.optional(v.string()),
    userCodeHash: v.optional(v.string()),
    authorizationCodeHash: v.optional(v.string()),
    status: v.union(
      v.literal('pending'),
      v.literal('issuing'),
      v.literal('approved'),
      v.literal('denied'),
      v.literal('delivery_claimed'),
      v.literal('consumed'),
      v.literal('expired'),
    ),
    ownerId: v.optional(v.string()),
    keyId: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
    approvedAt: v.optional(v.number()),
    issuanceKey: v.optional(v.string()),
    issuanceStartedAt: v.optional(v.number()),
    consumedAt: v.optional(v.number()),
    nextPollAt: v.optional(v.number()),
    deliveryClaimToken: v.optional(v.string()),
    deliveryCredentialHash: v.optional(v.string()),
    deliveryReplayUntil: v.optional(v.number()),
    displayName: v.string(),
    denialReason: v.optional(v.literal('access_denied')),
    connectionTarget: v.optional(connectionTarget),
    replacement: v.optional(replacement),
    consequenceReservation: v.optional(agentAccessConsentReservationValue),
  })
    .index('by_grantRef', ['grantRef'])
    .index('by_deviceCodeHash', ['deviceCodeHash'])
    .index('by_userCodeHash', ['userCodeHash'])
    .index('by_authorizationCodeHash', ['authorizationCodeHash'])
    .index('by_clientId_and_status', ['clientId', 'status'])
    .index('by_status_and_expiresAt', ['status', 'expiresAt']),

  agentAccessOAuthClients: defineTable({
    clientId: v.string(),
    clientName: v.string(),
    redirectUris: v.array(v.string()),
    grantTypes: v.array(v.union(
      v.literal('authorization_code'),
      v.literal('urn:ietf:params:oauth:grant-type:device_code'),
    )),
    tokenEndpointAuthMethod: v.literal('none'),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  }).index('by_clientId', ['clientId']),
} as const
