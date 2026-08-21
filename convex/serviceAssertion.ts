import { v } from 'convex/values'

/** Signed server-to-server agent-access assertion. */
export const serviceAssertion = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  scopes: v.array(v.string()),
  authorityMode: v.optional(
    v.union(
      v.literal('inspect_only'),
      v.literal('approve_each'),
      v.literal('bounded_mandate'),
      v.literal('full_yolo'),
    ),
  ),
  issuedAt: v.number(),
  signature: v.string(),
})
