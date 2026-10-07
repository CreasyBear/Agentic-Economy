import { v } from 'convex/values'

export const statusValue = v.object({
  schemaVersion: v.literal('provider_offboarding:v1'),
  caseRef: v.string(),
  businessRef: v.string(),
  providerRef: v.string(),
  revision: v.number(),
  state: v.union(
    v.literal('Cancelled'),
    v.literal('Freezing'),
    v.literal('Draining'),
    v.literal('Waiting for obligations'),
    v.literal('Revoking connections'),
    v.literal('Verifying cleanup'),
    v.literal('Action required'),
    v.literal('Retired'),
  ),
  routeabilityFrozen: v.boolean(),
  blockerCodes: v.array(v.string()),
  observedAt: v.number(),
  retentionPolicyVersion: v.string(),
  continuation: v.optional(v.object({
    action: v.literal('supply.offboarding.status'),
    args: v.object({ businessRef: v.string() }),
  })),
  ownerHandoff: v.optional(v.object({
    actor: v.literal('business_owner'),
    reason: v.literal('offboarding_action_required'),
    destination: v.literal('/owner/operations#offboarding'),
    caseRef: v.string(),
    businessRef: v.string(),
  })),
})

export const resultValue = v.union(
  v.object({ kind: v.literal('available'), status: statusValue }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('refused'), reason: v.string() }),
)
