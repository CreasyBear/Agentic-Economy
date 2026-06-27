import { mutationGeneric } from 'convex/server'
import { v } from 'convex/values'

export const claimBusiness = mutationGeneric({
  args: {
    name: v.string(),
    category: v.string(),
    suburb: v.string(),
    stateTerritory: v.string(),
    requestedSlug: v.string(),
    ownerMessage: v.optional(v.string()),
    csrfToken: v.optional(v.string()),
    csrfCookie: v.optional(v.string()),
    origin: v.optional(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: v.object({
    kind: v.union(v.literal('error')),
    code: v.union(v.literal('claim_unauthenticated')),
    retryable: v.boolean(),
    reason: v.string(),
  }),
  handler: async () => ({
    kind: 'error' as const,
    code: 'claim_unauthenticated' as const,
    retryable: false,
    reason: 'Convex claim mutations require generated auth wiring in the deployment boundary.',
  }),
})

export type {
  BusinessIdentity,
  BusinessSourceState,
  ClaimBusinessCommand,
  ClaimBusinessResult,
  ClaimContract,
  ClaimStatus,
  PublicStatus,
  TrustTier,
} from '../src/modules/business/public'
