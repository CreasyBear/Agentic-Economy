import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const requestedAccessAmount = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})
const requestedAccess = v.object({
  environment: v.union(v.literal('sandbox'), v.literal('production')),
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
  v.object({ kind: v.literal('replace_credential'), principalRef: v.string() }),
)
const replacement = v.object({
  principalRef: v.string(),
  generation: v.number(),
  successorCredentialRef: v.string(),
  predecessorCredentialRef: v.string(),
  predecessorKeyId: v.string(),
  successorGrantRef: v.string(),
})

export const agentAccessOAuthTables = {
  agentAccessOAuthGrants: defineTable({
    grantRef: v.string(),
    flow: v.union(v.literal('device_code'), v.literal('authorization_code')),
    clientId: v.string(),
    redirectUri: v.optional(v.string()),
    requestedScopes: v.array(v.string()),
    requestedAccess,
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
