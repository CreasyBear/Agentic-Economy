import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const accountLifecycleValue = v.union(
  v.literal('pending_activation'),
  v.literal('active'),
  v.literal('suspended'),
  v.literal('closed'),
)

export const ownershipLifecycleValue = v.union(v.literal('active'), v.literal('ended'))
export const membershipLifecycleValue = v.union(v.literal('active'), v.literal('ended'))
export const ownershipChangeKindValue = v.union(
  v.literal('creation'),
  v.literal('transfer'),
  v.literal('succession'),
)

export const recoveryPolicyValue = v.union(
  v.object({ kind: v.literal('no_transfer'), revision: v.number() }),
  v.object({
    kind: v.literal('threshold'),
    threshold: v.number(),
    participantCount: v.number(),
    delayMs: v.number(),
    freezeRequired: v.literal(true),
    revision: v.number(),
  }),
)

export const accountActionContextValue = v.object({
  actorPrincipalRef: v.string(),
  activeAccountRef: v.string(),
  correlationRef: v.string(),
  idempotencyRef: v.string(),
})

export const accountValue = v.object({
  accountRef: v.string(),
  displayName: v.string(),
  lifecycle: accountLifecycleValue,
  recoveryPolicy: recoveryPolicyValue,
  creationActorPrincipalRef: v.string(),
  creationIdempotencyRef: v.string(),
  initialOwnershipRef: v.string(),
  currentOwnershipRef: v.string(),
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastAction: accountActionContextValue,
})

export const accountOwnershipValue = v.object({
  ownershipRef: v.string(),
  accountRef: v.string(),
  ownerPrincipalRef: v.string(),
  lifecycle: ownershipLifecycleValue,
  changeKind: ownershipChangeKindValue,
  revision: v.number(),
  createdAt: v.number(),
  createdBy: accountActionContextValue,
  predecessorOwnershipRef: v.optional(v.string()),
  successionAuthorizationRef: v.optional(v.string()),
  endedAt: v.optional(v.number()),
  endedBy: v.optional(accountActionContextValue),
  successorOwnershipRef: v.optional(v.string()),
})

export const membershipValue = v.object({
  membershipRef: v.string(),
  accountRef: v.string(),
  memberPrincipalRef: v.string(),
  lifecycle: membershipLifecycleValue,
  revision: v.number(),
  createdAt: v.number(),
  createdBy: accountActionContextValue,
  endedAt: v.optional(v.number()),
  endedBy: v.optional(accountActionContextValue),
})

export const accountTables = {
  accounts: defineTable(accountValue)
    .index('by_accountRef', ['accountRef'])
    .index('by_creationActorPrincipalRef_and_creationIdempotencyRef', ['creationActorPrincipalRef', 'creationIdempotencyRef'])
    .index('by_lifecycle_and_updatedAt', ['lifecycle', 'updatedAt']),
  accountOwnerships: defineTable(accountOwnershipValue)
    .index('by_ownershipRef', ['ownershipRef'])
    .index('by_accountRef_and_lifecycle', ['accountRef', 'lifecycle'])
    .index('by_ownerPrincipalRef_and_lifecycle', ['ownerPrincipalRef', 'lifecycle'])
    .index('by_accountRef_and_ownerPrincipalRef_and_lifecycle', ['accountRef', 'ownerPrincipalRef', 'lifecycle']),
  memberships: defineTable(membershipValue)
    .index('by_membershipRef', ['membershipRef'])
    .index('by_accountRef_and_lifecycle', ['accountRef', 'lifecycle'])
    .index('by_memberPrincipalRef_and_lifecycle', ['memberPrincipalRef', 'lifecycle'])
    .index('by_accountRef_and_memberPrincipalRef_and_lifecycle', ['accountRef', 'memberPrincipalRef', 'lifecycle']),
} as const
