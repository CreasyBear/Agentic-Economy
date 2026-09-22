import { mutationGeneric } from 'convex/server'
import { v } from 'convex/values'

import { sourceWriteArgs } from './sourceWriteAdmission'
import { literalUnion } from '../src/modules/common/convex-literals'
import { RemovalDisputeReasonCodeValues } from '../src/modules/security/public'
import {
  bootstrapOwnerAdminHandler,
  grantAdminMembershipHandler,
  revokeAdminMembershipHandler,
} from './securityAdminMembership'
import {
  closeRemovalDisputeHandler,
  openRemovalDisputeHandler,
} from './securityRemovalDisputes'

const adminRole = v.union(v.literal('owner_admin'), v.literal('support'), v.literal('reviewer'))
const adminMembershipState = v.union(v.literal('active'), v.literal('revoked'), v.literal('suspended'))
const visibilityTargetType = v.union(v.literal('business'), v.literal('service'), v.literal('capability'))
const removalReason = literalUnion(RemovalDisputeReasonCodeValues)
const disputeStatus = v.union(v.literal('opened'), v.literal('updated'), v.literal('closed'), v.literal('contested'))

const adminMembershipResult = v.object({
  clerkUserId: v.string(),
  tokenIdentifier: v.string(),
  role: adminRole,
  state: adminMembershipState,
  grantedBy: v.string(),
  grantedAt: v.number(),
  revokedBy: v.optional(v.string()),
  revokedAt: v.optional(v.number()),
  evidenceRef: v.optional(v.string()),
})

const auditSummaryResult = v.object({
  eventType: v.union(
    v.literal('admin.membership_bootstrapped'),
    v.literal('admin.membership_granted'),
    v.literal('admin.membership_revoked'),
    v.literal('admin.action_denied'),
    v.literal('dispute.closed'),
    v.literal('business.suppressed'),
    v.literal('business.unsuppressed'),
  ),
  actorRef: v.string(),
  targetRef: v.string(),
  beforeState: v.optional(v.string()),
  afterState: v.optional(v.string()),
  reasonCode: v.optional(v.string()),
})

const membershipAuditSummaryResult = v.object({
  eventType: v.union(
    v.literal('membership_bootstrapped'),
    v.literal('membership_granted'),
    v.literal('membership_revoked'),
    v.literal('action_denied')
  ),
  actorRef: v.string(),
  targetRef: v.string(),
  reasonCode: v.string(),
})

const adminMutationErrorResult = v.object({
  kind: v.literal('error'),
  code: v.union(
    v.literal('admin_bootstrap_denied'),
    v.literal('admin_action_denied'),
    v.literal('admin_membership_not_found'),
    v.literal('admin_invalid_reason'),
    v.literal('admin_missing_evidence')
  ),
  retryable: v.boolean(),
  reason: v.string(),
  auditEvent: v.optional(auditSummaryResult),
  membershipAuditEvent: v.optional(membershipAuditSummaryResult),
})

const adminMutationOkResult = v.object({
  kind: v.literal('ok'),
  code: v.union(
    v.literal('admin_membership_bootstrapped'),
    v.literal('admin_membership_granted'),
    v.literal('admin_membership_revoked')
  ),
  membership: adminMembershipResult,
  auditEvent: auditSummaryResult,
  membershipAuditEvent: membershipAuditSummaryResult,
})

const adminMutationResult = v.union(adminMutationOkResult, adminMutationErrorResult)


const disputeReceiptResult = v.object({
  disputeId: v.string(),
  status: disputeStatus,
  targetType: visibilityTargetType,
  targetRef: v.string(),
  reasonCode: removalReason,
  evidenceHash: v.string(),
  requestCount: v.number(),
  updatedAt: v.number(),
})

const openDisputeResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.union(
      v.literal('dispute_opened'),
      v.literal('dispute_open_replayed'),
      v.literal('dispute_open_updated')
    ),
    receipt: disputeReceiptResult,
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(
      v.literal('dispute_csrf_rejected'),
      v.literal('dispute_rate_limited'),
      v.literal('dispute_invalid_contact'),
      v.literal('dispute_invalid_target'),
      v.literal('dispute_invalid_reason'),
      v.literal('dispute_invalid_evidence')
    ),
    retryable: v.boolean(),
    reason: v.string(),
  })
)

const closeDisputeResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.literal('dispute_closed'),
    receipt: disputeReceiptResult,
    auditEvent: auditSummaryResult,
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(
      v.literal('admin_action_denied'),
      v.literal('admin_invalid_reason'),
      v.literal('admin_missing_evidence'),
      v.literal('dispute_not_found')
    ),
    retryable: v.boolean(),
    reason: v.string(),
    auditEvent: v.optional(auditSummaryResult),
    membershipAuditEvent: v.optional(membershipAuditSummaryResult),
  })
)

export const bootstrapOwnerAdmin = mutationGeneric({
  args: {
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: adminMutationResult,
  handler: bootstrapOwnerAdminHandler,
})

export const grantAdminMembership = mutationGeneric({
  args: {
    targetClerkUserId: v.string(),
    targetTokenIdentifier: v.string(),
    role: adminRole,
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: adminMutationResult,
  handler: grantAdminMembershipHandler,
})

export const revokeAdminMembership = mutationGeneric({
  args: {
    targetClerkUserId: v.string(),
    targetTokenIdentifier: v.optional(v.string()),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: adminMutationResult,
  handler: revokeAdminMembershipHandler,
})



export const openRemovalDispute = mutationGeneric({
  args: {
    businessId: v.string(),
    targetType: visibilityTargetType,
    targetRef: v.string(),
    reasonCode: removalReason,
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    contactName: v.optional(v.string()),
    evidence: v.array(
      v.object({
        label: v.string(),
        mediaType: v.union(
          v.literal('text/plain'),
          v.literal('image/jpeg'),
          v.literal('image/png'),
          v.literal('application/pdf')
        ),
        byteLength: v.number(),
        privateRef: v.string(),
      })
    ),
    publicMessage: v.optional(v.string()),
    csrfToken: v.optional(v.string()),
    csrfCookie: v.optional(v.string()),
    origin: v.optional(v.string()),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: openDisputeResult,
  handler: openRemovalDisputeHandler,
})

export const closeRemovalDispute = mutationGeneric({
  args: {
    disputeId: v.string(),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: closeDisputeResult,
  handler: closeRemovalDisputeHandler,
})

export type {
  AdminAction,
  AdminAuthorityState,
  AdminDecisionAudit,
  AdminMembership,
  AdminRole,
  DisputeOpenCommand,
  DisputeRecord,
  DisputeSourceState,
} from '../src/modules/security/public'
