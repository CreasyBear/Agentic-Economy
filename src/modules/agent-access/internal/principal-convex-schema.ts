import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const environment = v.union(v.literal('sandbox'), v.literal('production'))
const authorityMode = v.union(v.literal('inspect_only'), v.literal('approve_each'), v.literal('bounded_mandate'), v.literal('full_yolo'))
const lifecycle = v.union(v.literal('active'), v.literal('revoked'), v.literal('expired'))

export const agentAccessPrincipalTables = {
  agentAccessPrincipals: defineTable({
    principalId: v.string(),
    ownerId: v.string(),
    ownerTokenIdentifier: v.optional(v.string()),
    credentialId: v.string(),
    applicationRef: v.string(),
    environment,
    scopes: v.array(v.string()),
    authorityMode,
    grantGeneration: v.number(),
    policyDigest: v.string(),
    lifecycle,
    expiresAt: v.optional(v.number()),
    recordedAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index('by_principalId', ['principalId'])
    .index('by_credentialId', ['credentialId'])
    .index('by_ownerId', ['ownerId'])
    .index('by_ownerId_and_lastSeenAt', ['ownerId', 'lastSeenAt'])
    .index('by_ownerId_and_lifecycle', ['ownerId', 'lifecycle'])
    .index('by_credentialId_and_lifecycle', ['credentialId', 'lifecycle']),
} as const
