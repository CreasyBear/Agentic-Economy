import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const environment = v.union(v.literal('sandbox'), v.literal('production'))
const authorityMode = v.union(v.literal('read_only'), v.literal('approval_required'), v.literal('spending_policy'), v.literal('unrestricted_test_only'))
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
    spendingPolicyDigest: v.string(),
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
  agentAccessProviderRevocations: defineTable({
    revocationRef: v.string(),
    principalRef: v.string(),
    credentialRef: v.string(),
    providerCredentialId: v.string(),
    lifecycle: v.union(v.literal('pending'), v.literal('completed')),
    correlationRef: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_revocationRef', ['revocationRef'])
    .index('by_credentialRef', ['credentialRef'])
    .index('by_principalRef_and_lifecycle', ['principalRef', 'lifecycle']),
} as const
