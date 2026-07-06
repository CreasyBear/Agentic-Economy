import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const demandTables = {
  demandSignals: defineTable({
    service: v.string(),
    suburb: v.string(),
    note: v.optional(v.string()),
    createdAt: v.number(),
    sourceSurface: v.literal('registry'),
    queryText: v.optional(v.string()),
  })
    .index('by_sourceSurface_createdAt', ['sourceSurface', 'createdAt'])
    .index('by_service_suburb_createdAt', ['service', 'suburb', 'createdAt']),
} as const
