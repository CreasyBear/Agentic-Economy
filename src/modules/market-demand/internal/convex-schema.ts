import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const commonFields = {
  requestRef: v.string(),
  ownerId: v.string(),
  idempotencyKey: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
} as const

const credentialFields = {
  ...commonFields,
  principalId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment: v.union(v.literal('sandbox'), v.literal('production')),
} as const

const scopeFields = {
  source: v.optional(v.union(v.literal('current'), v.literal('coinbase'))),
  filters: v.optional(v.any()),
} as const

export const marketDemandTables = {
  marketDemandSignals: defineTable(v.union(
    v.object({
      ...credentialFields,
      ...scopeFields,
      schemaVersion: v.literal('market-demand-signal:v1'),
      query: v.string(),
      queryDigest: v.string(),
    }),
    v.object({
      ...credentialFields,
      schemaVersion: v.literal('market-demand-withdrawn:v1'),
    }),
    v.object({
      ...commonFields,
      ...scopeFields,
      schemaVersion: v.literal('market-demand-owner-signal:v1'),
      query: v.string(),
      queryDigest: v.string(),
    }),
    v.object({
      ...commonFields,
      schemaVersion: v.literal('market-demand-owner-withdrawn:v1'),
    }),
    // A second concurrent Save intent retains a phrase-free key receipt.
    v.object({
      ...commonFields,
      schemaVersion: v.literal('market-demand-owner-alias:v1'),
      targetRef: v.string(),
    }),
  ))
    .index('by_requestRef', ['requestRef'])
    .index('by_credentialId_and_idempotencyKey', ['credentialId', 'idempotencyKey'])
    .index('by_ownerId_and_schemaVersion_and_createdAt', ['ownerId', 'schemaVersion', 'createdAt'])
    .index('by_ownerId_and_schemaVersion_and_queryDigest', ['ownerId', 'schemaVersion', 'queryDigest'])
    .index('by_principalId_and_credentialId_and_createdAt', ['principalId', 'credentialId', 'createdAt']),
} as const
