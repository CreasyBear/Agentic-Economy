import { v } from 'convex/values'

/** Signed server-to-server agent-access assertion. */
export const serviceAssertion = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  scopes: v.array(v.string()),
  authorityMode: v.optional(
    v.union(
      v.literal('read_only'),
      v.literal('approval_required'),
      v.literal('spending_policy'),
      v.literal('unrestricted_test_only'),
    ),
  ),
  issuedAt: v.number(),
  signature: v.string(),
})
