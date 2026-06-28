import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import { ClaimStatusValues, PublicStatusValues, TrustTierValues } from '@/modules/business/public'

const sourceRef = v.object({
  label: v.string(),
  evidenceRef: v.string(),
  sourceHash: v.string(),
})

export const businessTables = {
  owners: defineTable({
    clerkUserId: v.string(),
    displayName: v.optional(v.string()),
    emailHash: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_clerkUserId', ['clerkUserId']),

  businesses: defineTable({
    ownerId: v.id('owners'),
    slug: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    category: v.string(),
    suburb: v.string(),
    stateTerritory: v.string(),
    publicStatus: literalUnion(PublicStatusValues),
    trustTier: literalUnion(TrustTierValues),
    claimStatus: literalUnion(ClaimStatusValues),
    sourceHash: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    suppressedAt: v.optional(v.number()),
  })
    .index('by_slug', ['slug'])
    .index('by_publicStatus_slug', ['publicStatus', 'slug']),

  businessContexts: defineTable({
    businessId: v.id('businesses'),
    category: v.string(),
    suburb: v.string(),
    stateTerritory: v.string(),
    postcode: v.optional(v.string()),
    ownerMessage: v.optional(v.string()),
    sourceRefs: v.array(sourceRef),
    sourceHash: v.string(),
    approvedAt: v.number(),
  }),

  claims: defineTable({
    ownerId: v.id('owners'),
    businessId: v.optional(v.id('businesses')),
    slug: v.string(),
    status: literalUnion(ClaimStatusValues),
    submittedFactsHash: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_owner_status', ['ownerId', 'status'])
    .index('by_business_status', ['businessId', 'status']),
} as const
