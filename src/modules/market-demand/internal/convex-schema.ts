import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const marketDemandTables = {
  marketDemandSignals: defineTable({
    schemaVersion: v.literal('market-demand-signal:v1'),
    requestRef: v.string(),
    principalId: v.string(),
    ownerId: v.string(),
    credentialId: v.string(),
    applicationRef: v.string(),
    environment: v.union(v.literal('sandbox'), v.literal('production')),
    query: v.string(),
    queryDigest: v.string(),
    idempotencyKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_requestRef', ['requestRef'])
    .index('by_credentialId_and_idempotencyKey', ['credentialId', 'idempotencyKey'])
    .index('by_principalId_and_credentialId_and_createdAt', ['principalId', 'credentialId', 'createdAt']),
} as const
