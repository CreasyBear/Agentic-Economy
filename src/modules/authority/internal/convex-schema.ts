import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { accountActionContextValue } from '../../principal-account/public'

const delegationLifecycleValue = v.union(v.literal('active'), v.literal('revoked'))

const delegationGrantFields = {
  grantRef: v.string(),
  accountRef: v.string(),
  actorPrincipalRef: v.string(),
  subjectPrincipalRef: v.string(),
  parentGrantRef: v.optional(v.string()),
  parentGeneration: v.optional(v.number()),
  scopes: v.array(v.string()),
  resourceRefs: v.array(v.string()),
  budgetLimit: v.number(),
  budgetUsed: v.number(),
  expiresAt: v.number(),
  generation: v.number(),
  revision: v.number(),
  lifecycle: delegationLifecycleValue,
  createdAt: v.number(),
  createdBy: accountActionContextValue,
  revokedAt: v.optional(v.number()),
  revokedBy: v.optional(accountActionContextValue),
}

const delegationSnapshotAncestorFields = {
  grantRef: v.string(),
  generation: v.number(),
  accountRef: v.string(),
  actorPrincipalRef: v.string(),
  subjectPrincipalRef: v.string(),
  scopes: v.array(v.string()),
  resourceRefs: v.array(v.string()),
  budgetLimit: v.number(),
  budgetUsedBefore: v.number(),
  expiresAt: v.number(),
}

export const authorityDelegationTables = {
  authorityDelegationGrants: defineTable(delegationGrantFields)
    .index('by_grantRef', ['grantRef'])
    .index('by_subjectPrincipalRef_and_lifecycle', ['subjectPrincipalRef', 'lifecycle'])
    .index('by_accountRef_and_lifecycle', ['accountRef', 'lifecycle'])
    .index('by_accountRef_and_actorPrincipalRef_and_createdBy_idempotencyRef', [
      'accountRef',
      'actorPrincipalRef',
      'createdBy.idempotencyRef',
    ]),
  authorityDelegationSnapshots: defineTable({
    snapshotRef: v.string(),
    grantRef: v.string(),
    generation: v.number(),
    accountRef: v.string(),
    accountRevision: v.number(),
    actorPrincipalRef: v.string(),
    subjectPrincipalRef: v.string(),
    scopes: v.array(v.string()),
    resourceRefs: v.array(v.string()),
    budgetAmount: v.number(),
    admittedAt: v.number(),
    expiresAt: v.number(),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
    ancestryCount: v.number(),
  })
    .index('by_snapshotRef', ['snapshotRef'])
    .index('by_accountRef_and_actorPrincipalRef_and_idempotencyRef', [
      'accountRef',
      'actorPrincipalRef',
      'idempotencyRef',
    ]),
  authorityDelegationSnapshotAncestors: defineTable({
    snapshotRef: v.string(),
    position: v.number(),
    ...delegationSnapshotAncestorFields,
  })
    .index('by_snapshotRef_and_position', ['snapshotRef', 'position']),
} as const
