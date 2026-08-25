import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const connectionOperationValue = v.union(
  v.literal('install'),
  v.literal('share'),
  v.literal('lease'),
  v.literal('refresh'),
  v.literal('revoke'),
  v.literal('delete'),
  v.literal('begin_effect'),
)

const connectionActionValue = v.object({
  operation: connectionOperationValue,
  snapshotRef: v.string(),
  actorPrincipalRef: v.string(),
  activeAccountRef: v.string(),
  grantRef: v.string(),
  grantGeneration: v.number(),
  correlationRef: v.string(),
  idempotencyRef: v.string(),
  resourceRefs: v.array(v.string()),
  occurredAt: v.number(),
})

const connectionExternalStateValue = v.union(
  v.object({
    kind: v.literal('known'),
    value: v.union(
      v.literal('ready'),
      v.literal('unavailable'),
      v.literal('revoked'),
      v.literal('deleted'),
    ),
  }),
  v.object({ kind: v.literal('unknown'), value: v.string() }),
)

const connectionFields = {
  connectionRef: v.string(),
  owningAccountRef: v.string(),
  installedByPrincipalRef: v.string(),
  providerNamespace: v.string(),
  providerLocator: v.optional(v.string()),
  secretRef: v.optional(v.string()),
  installedExternalState: connectionExternalStateValue,
  externalState: connectionExternalStateValue,
  lifecycle: v.union(v.literal('active'), v.literal('revoked'), v.literal('deleted')),
  generation: v.number(),
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  installAction: connectionActionValue,
  action: connectionActionValue,
}

export const connectionTables = {
  connections: defineTable(connectionFields)
    .index('by_connectionRef', ['connectionRef'])
    .index('by_owningAccountRef_and_installAction_idempotencyRef', [
      'owningAccountRef',
      'installAction.idempotencyRef',
    ]),
  connectionShares: defineTable({
    shareRef: v.string(),
    connectionRef: v.string(),
    connectionGeneration: v.number(),
    owningAccountRef: v.string(),
    granteeAccountRef: v.string(),
    lifecycle: v.literal('active'),
    createdAt: v.number(),
    action: connectionActionValue,
  })
    .index('by_shareRef', ['shareRef'])
    .index('by_connectionRef_and_granteeAccountRef_and_lifecycle', [
      'connectionRef',
      'granteeAccountRef',
      'lifecycle',
    ])
    .index('by_owningAccountRef_and_action_idempotencyRef', [
      'owningAccountRef',
      'action.idempotencyRef',
    ]),
  connectionLeases: defineTable({
    leaseRef: v.string(),
    connectionRef: v.string(),
    connectionGeneration: v.number(),
    owningAccountRef: v.string(),
    activeAccountRef: v.string(),
    actorPrincipalRef: v.string(),
    grantRef: v.string(),
    grantGeneration: v.number(),
    expiresAt: v.number(),
    createdAt: v.number(),
    action: connectionActionValue,
  })
    .index('by_leaseRef', ['leaseRef'])
    .index('by_activeAccountRef_and_action_idempotencyRef', [
      'activeAccountRef',
      'action.idempotencyRef',
    ]),
  connectionEffectAdmissions: defineTable({
    effectRef: v.string(),
    leaseRef: v.string(),
    connectionRef: v.string(),
    connectionGeneration: v.number(),
    owningAccountRef: v.string(),
    activeAccountRef: v.string(),
    actorPrincipalRef: v.string(),
    grantRef: v.string(),
    grantGeneration: v.number(),
    admittedAt: v.number(),
    action: connectionActionValue,
  })
    .index('by_effectRef', ['effectRef'])
    .index('by_activeAccountRef_and_action_idempotencyRef', [
      'activeAccountRef',
      'action.idempotencyRef',
    ]),
  connectionLifecycleCommands: defineTable({
    operation: v.union(v.literal('refresh'), v.literal('revoke'), v.literal('delete')),
    connectionRef: v.string(),
    expectedGeneration: v.number(),
    requestedExternalState: connectionExternalStateValue,
    action: connectionActionValue,
    result: v.object(connectionFields),
  })
    .index('by_action_activeAccountRef_and_action_idempotencyRef', [
      'action.activeAccountRef',
      'action.idempotencyRef',
    ]),
} as const
