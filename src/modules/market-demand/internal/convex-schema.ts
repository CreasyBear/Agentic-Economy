import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const requestIdentityFields = {
  requestRef: v.string(),
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment: v.union(v.literal('sandbox'), v.literal('production')),
  idempotencyKey: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
} as const

export const marketDemandTables = {
  marketDemandSignals: defineTable(v.union(
    v.object({
      ...requestIdentityFields,
      schemaVersion: v.literal('market-demand-signal:v1'),
      query: v.string(),
      queryDigest: v.string(),
    }),
    // A withdrawn request retains deduplication identity, never the need text.
    v.object({
      ...requestIdentityFields,
      schemaVersion: v.literal('market-demand-withdrawn:v1'),
    }),
  ))
    .index('by_requestRef', ['requestRef'])
    .index('by_credentialId_and_idempotencyKey', ['credentialId', 'idempotencyKey'])
    .index('by_principalId_and_credentialId_and_createdAt', ['principalId', 'credentialId', 'createdAt']),
} as const
