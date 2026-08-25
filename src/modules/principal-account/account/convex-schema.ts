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
export const recoveryParticipantApprovalLifecycleValue = v.union(v.literal('verified'), v.literal('revoked'))
export const successionAuthorizationLifecycleValue = v.union(v.literal('active'), v.literal('consumed'))
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

export const verifiedRecoveryParticipantApprovalValue = v.object({
  approvalRef: v.string(),
  accountRef: v.string(),
  participantPrincipalRef: v.string(),
  incumbentOwnerPrincipalRef: v.string(),
  successorOwnerPrincipalRef: v.string(),
  recoveryPolicyRevision: v.number(),
  frozenAccountRevision: v.number(),
  frozenAt: v.number(),
  verifiedAt: v.number(),
  expiresAt: v.number(),
  verificationRef: v.string(),
  lifecycle: recoveryParticipantApprovalLifecycleValue,
})

export const successionAuthorizationValue = v.object({
  authorizationRef: v.string(),
  accountRef: v.string(),
  incumbentOwnerPrincipalRef: v.string(),
  successorOwnerPrincipalRef: v.string(),
  recoveryPolicyRevision: v.number(),
  frozenAccountRevision: v.number(),
  frozenAt: v.number(),
  availableAt: v.number(),
  authorizedAt: v.number(),
  expiresAt: v.number(),
  verifiedParticipantCount: v.number(),
  lifecycle: successionAuthorizationLifecycleValue,
  revision: v.number(),
  createdAt: v.number(),
  consumedAt: v.optional(v.number()),
  consumedBy: v.optional(accountActionContextValue),
  successorOwnershipRef: v.optional(v.string()),
})

export const successionAuthorizationParticipantValue = v.object({
  authorizationRef: v.string(),
  accountRef: v.string(),
  approvalRef: v.string(),
  participantPrincipalRef: v.string(),
  verificationRef: v.string(),
  verifiedAt: v.number(),
  createdAt: v.number(),
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
  accountRecoveryParticipantApprovals: defineTable(verifiedRecoveryParticipantApprovalValue)
    .index('by_approvalRef', ['approvalRef'])
    .index('by_accountRef_and_lifecycle', ['accountRef', 'lifecycle'])
    .index('by_participantPrincipalRef_and_lifecycle', ['participantPrincipalRef', 'lifecycle']),
  accountSuccessionAuthorizations: defineTable(successionAuthorizationValue)
    .index('by_authorizationRef', ['authorizationRef'])
    .index('by_accountRef_and_lifecycle', ['accountRef', 'lifecycle'])
    .index('by_accountRef_and_successorOwnerPrincipalRef_and_lifecycle', ['accountRef', 'successorOwnerPrincipalRef', 'lifecycle']),
  accountSuccessionAuthorizationParticipants: defineTable(successionAuthorizationParticipantValue)
    .index('by_authorizationRef', ['authorizationRef'])
    .index('by_accountRef_and_createdAt', ['accountRef', 'createdAt'])
    .index('by_participantPrincipalRef_and_createdAt', ['participantPrincipalRef', 'createdAt']),
} as const
