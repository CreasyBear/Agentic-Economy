import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const secretPointerOperationValue = v.union(
  v.literal('provision'),
  v.literal('rotate'),
  v.literal('reconcile'),
)

export const secretPointerAuthorityValue = v.object({
  operation: secretPointerOperationValue,
  snapshotRef: v.string(),
  accountRef: v.string(),
  actorPrincipalRef: v.string(),
  grantRef: v.string(),
  grantGeneration: v.number(),
  correlationRef: v.string(),
  idempotencyRef: v.string(),
  occurredAt: v.number(),
})

export const secretLifecycleStateValue = v.union(
  v.literal('prepared'),
  v.literal('active'),
  v.literal('failed_validation'),
  v.literal('external_effect_unknown'),
  v.literal('pointer_conflict'),
)

export const secretReferenceTables = {
  secretPointers: defineTable({
    secretRef: v.string(),
    owningAccountRef: v.string(),
    activeGeneration: v.string(),
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastAction: secretPointerAuthorityValue,
  })
    .index('by_secretRef', ['secretRef']),
  secretPointerCommands: defineTable({
    secretRef: v.string(),
    operation: secretPointerOperationValue,
    previousGeneration: v.optional(v.string()),
    newGeneration: v.string(),
    previousRevision: v.number(),
    newRevision: v.number(),
    action: secretPointerAuthorityValue,
  })
    .index('by_accountRef_and_idempotencyRef', [
      'action.accountRef',
      'action.idempotencyRef',
    ])
    .index('by_secretRef_and_newRevision', ['secretRef', 'newRevision']),
  secretLifecycleJournal: defineTable({
    operationRef: v.string(),
    idempotencyRef: v.string(),
    operation: v.union(v.literal('provision'), v.literal('rotate')),
    secretRef: v.string(),
    targetGeneration: v.string(),
    previousGeneration: v.optional(v.string()),
    previousRevision: v.number(),
    state: secretLifecycleStateValue,
    createdAt: v.number(),
    updatedAt: v.number(),
    authority: secretPointerAuthorityValue,
  })
    .index('by_idempotencyRef', ['idempotencyRef'])
    .index('by_operationRef', ['operationRef']),
} as const
