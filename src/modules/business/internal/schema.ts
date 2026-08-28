import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import {
  PublicStatusValues,
  TrustTierValues,
  businessContext,
} from '@/modules/business/public'

export const businessTables = {
  businesses: defineTable({
    owningAccountRef: v.string(),
    slug: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    category: v.string(),
    businessContext,
    publicStatus: literalUnion(PublicStatusValues),
    trustTier: literalUnion(TrustTierValues),
    sourceHash: v.string(),
    // Legacy development rows may retain the pre-publicStatus claim field.
    // Keep it optional until every deployment has completed the data migration.
    claimStatus: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    suppressedAt: v.optional(v.number()),
  })
    .index('by_slug', ['slug'])
    .index('by_owningAccountRef_and_updatedAt', ['owningAccountRef', 'updatedAt'])
    .index('by_publicStatus_slug', ['publicStatus', 'slug']),
} as const
