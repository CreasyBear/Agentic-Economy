import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const capabilityContractRegistryTables = {
  capabilityContractDocuments: defineTable({
    capabilityId: v.string(),
    version: v.number(),
    contractDigest: v.string(),
    documentJson: v.string(),
    status: v.union(v.literal('active'), v.literal('retired')),
    registeredAt: v.number(),
    retiredAt: v.optional(v.number()),
  })
    .index('by_capabilityId_and_version', ['capabilityId', 'version'])
    .index('by_status_and_capabilityId_and_version', ['status', 'capabilityId', 'version']),
}
