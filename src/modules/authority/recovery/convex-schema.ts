import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { accountActionContextValue } from '../../principal-account/public'

export const recoveryActionValue = v.union(
  v.literal('freeze'),
  v.literal('isolate'),
  v.literal('inspect_secret_canary'),
)

export const recoveryApprovalLifecycleValue = v.union(
  v.literal('verified'),
  v.literal('revoked'),
  v.literal('consumed'),
)

export const recoveryApprovalValue = v.object({
  approvalRef: v.string(),
  accountRef: v.string(),
  subjectPrincipalRef: v.string(),
  operatorPrincipalRef: v.string(),
  action: recoveryActionValue,
  recoveryPolicyRevision: v.number(),
  frozenAccountRevision: v.number(),
  verificationRef: v.string(),
  lifecycle: recoveryApprovalLifecycleValue,
  verifiedAt: v.number(),
  expiresAt: v.number(),
  consumedAt: v.optional(v.number()),
  consumedByAdmissionRef: v.optional(v.string()),
})

export const recoveryAdmissionValue = v.object({
  admissionRef: v.string(),
  accountRef: v.string(),
  subjectPrincipalRef: v.string(),
  operatorPrincipalRef: v.string(),
  action: recoveryActionValue,
  recoveryPolicyKind: v.union(v.literal('threshold'), v.literal('no_transfer')),
  recoveryPolicyRevision: v.number(),
  frozenAccountRevision: v.number(),
  authoritySnapshotRef: v.string(),
  grantRef: v.string(),
  grantGeneration: v.number(),
  approvalRefs: v.array(v.string()),
  verificationRefs: v.array(v.string()),
  availableAt: v.number(),
  admittedAt: v.number(),
  expiresAt: v.number(),
  lifecycle: v.literal('consumed'),
  context: accountActionContextValue,
})

export const recoveryProductionTables = {
  recoveryBreakGlassApprovals: defineTable(recoveryApprovalValue)
    .index('by_approvalRef', ['approvalRef'])
    .index('by_verificationRef', ['verificationRef'])
    .index('by_accountRef_and_lifecycle', ['accountRef', 'lifecycle']),
  recoveryBreakGlassAdmissions: defineTable(recoveryAdmissionValue)
    .index('by_admissionRef', ['admissionRef'])
    .index('by_accountRef_and_operatorPrincipalRef_and_idempotencyRef', [
      'accountRef',
      'operatorPrincipalRef',
      'context.idempotencyRef',
    ]),
} as const
