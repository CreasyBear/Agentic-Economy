import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import {
  PublicStatusValues,
  TrustTierValues,
  businessContext,
} from '@/modules/business/public'

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
    businessContext,
    publicStatus: literalUnion(PublicStatusValues),
    trustTier: literalUnion(TrustTierValues),
    sourceHash: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    suppressedAt: v.optional(v.number()),
  })
    .index('by_slug', ['slug'])
    .index('by_owner_updatedAt', ['ownerId', 'updatedAt'])
    .index('by_publicStatus_slug', ['publicStatus', 'slug']),
} as const
