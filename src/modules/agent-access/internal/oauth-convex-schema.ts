import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const agentAccessOAuthTables = {
  agentAccessOAuthGrants: defineTable({
    grantRef: v.string(),
    flow: v.union(v.literal('device_code'), v.literal('authorization_code')),
    clientId: v.string(),
    redirectUri: v.optional(v.string()),
    requestedScopes: v.array(v.string()),
    codeChallenge: v.optional(v.string()),
    codeChallengeMethod: v.optional(v.literal('S256')),
    deviceCodeHash: v.optional(v.string()),
    userCodeHash: v.optional(v.string()),
    authorizationCodeHash: v.optional(v.string()),
    status: v.union(
      v.literal('pending'), v.literal('approved'), v.literal('denied'),
      v.literal('delivery_claimed'), v.literal('consumed'), v.literal('expired'),
    ),
    ownerId: v.optional(v.string()),
    keyId: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
    approvedAt: v.optional(v.number()),
    consumedAt: v.optional(v.number()),
    nextPollAt: v.optional(v.number()),
    deliveryClaimToken: v.optional(v.string()),
    displayName: v.string(),
    denialReason: v.optional(v.literal('access_denied')),
  })
    .index('by_grantRef', ['grantRef'])
    .index('by_deviceCodeHash', ['deviceCodeHash'])
    .index('by_userCodeHash', ['userCodeHash'])
    .index('by_authorizationCodeHash', ['authorizationCodeHash'])
    .index('by_expiresAt', ['expiresAt']),

  agentAccessOAuthClients: defineTable({
    clientId: v.string(),
    clientName: v.string(),
    redirectUris: v.array(v.string()),
    grantTypes: v.array(v.union(v.literal('authorization_code'), v.literal('urn:ietf:params:oauth:grant-type:device_code'))),
    tokenEndpointAuthMethod: v.literal('none'),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  }).index('by_clientId', ['clientId']),
} as const
