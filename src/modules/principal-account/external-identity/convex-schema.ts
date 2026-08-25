import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const externalProviderStateValue = v.union(
  v.object({
    kind: v.literal('known'),
    value: v.union(v.literal('active'), v.literal('disabled'), v.literal('revoked')),
  }),
  v.object({ kind: v.literal('unknown'), value: v.string() }),
)

export const externalIdentityBindingLifecycleValue = v.union(
  v.literal('active'),
  v.literal('revoked'),
)

export const externalIdentityBindingValue = v.object({
  bindingRef: v.string(),
  principalRef: v.string(),
  providerNamespace: v.string(),
  providerIdentifier: v.string(),
  providerState: externalProviderStateValue,
  lifecycle: externalIdentityBindingLifecycleValue,
  credentialGeneration: v.number(),
  bindIdempotencyRef: v.string(),
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  revokedAt: v.optional(v.number()),
})

export const credentialTypeValue = v.union(
  v.literal('provider_token'),
  v.literal('api_key'),
  v.literal('workload_assertion'),
)

export const credentialLifecycleValue = v.union(
  v.literal('active'),
  v.literal('stale'),
  v.literal('revoked'),
)

export const credentialValue = v.object({
  credentialRef: v.string(),
  bindingRef: v.string(),
  principalRef: v.string(),
  type: credentialTypeValue,
  lifecycle: credentialLifecycleValue,
  generation: v.number(),
  issueIdempotencyRef: v.string(),
  revision: v.number(),
  issuedAt: v.number(),
  expiresAt: v.number(),
  updatedAt: v.number(),
  predecessorCredentialRef: v.optional(v.string()),
  staleAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
})

export const externalIdentityTables = {
  externalIdentityBindings: defineTable(externalIdentityBindingValue)
    .index('by_bindingRef', ['bindingRef'])
    .index('by_providerNamespace_and_providerIdentifier', ['providerNamespace', 'providerIdentifier'])
    .index('by_principalRef_and_lifecycle', ['principalRef', 'lifecycle'])
    .index('by_principalRef_and_bindIdempotencyRef', ['principalRef', 'bindIdempotencyRef']),
  credentials: defineTable(credentialValue)
    .index('by_credentialRef', ['credentialRef'])
    .index('by_bindingRef_and_generation_and_lifecycle', ['bindingRef', 'generation', 'lifecycle'])
    .index('by_principalRef_and_lifecycle', ['principalRef', 'lifecycle'])
    .index('by_principalRef_and_issueIdempotencyRef', ['principalRef', 'issueIdempotencyRef'])
    .index('by_predecessorCredentialRef', ['predecessorCredentialRef']),
} as const
