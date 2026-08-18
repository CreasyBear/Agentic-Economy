import { v } from 'convex/values'

/** Agent-access service assertion. Lived on the retired Customer Request mandate host. */
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
