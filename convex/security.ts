import { mutationGeneric, queryGeneric } from 'convex/server'
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
  readAdminAuditEventsHandler,
  readAdminIndexHealthHandler,
} from './securityAdminReadbacks'
import {
  closeRemovalDisputeHandler,
  openRemovalDisputeHandler,
} from './securityRemovalDisputes'

const adminRole = v.union(v.literal('owner_admin'), v.literal('support'), v.literal('reviewer'))
const adminMembershipState = v.union(v.literal('active'), v.literal('revoked'), v.literal('suspended'))
const visibilityTargetType = v.union(v.literal('business'), v.literal('service'), v.literal('capability'))
const removalReason = literalUnion(RemovalDisputeReasonCodeValues)
const disputeStatus = v.union(v.literal('opened'), v.literal('updated'), v.literal('closed'), v.literal('contested'))
const adminReadbackSurface = v.union(
  v.literal('audit_events'),
  v.literal('index_health')
)
const adminReadbackDeniedReason = v.union(
  v.literal('missing_membership'),
  v.literal('inactive_membership'),
  v.literal('action_not_allowed')
)
const adminReadbackRowType = v.union(v.literal('audit_event'), v.literal('index_surface'))
const adminReadbackRowState = v.union(
  v.literal('no_source_rows'),
  v.literal('guarded'),
  v.literal('queued'),
  v.literal('indexed'),
  v.literal('degraded'),
  v.literal('stale'),
  v.literal('suppressed')
)
const adminReadbackRepairAction = v.union(
  v.literal('inspect_audit'),
  v.literal('regenerate_projection'),
  v.literal('source_auth_required'),
  v.literal('no_repair_available')
)

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
    v.literal('dispute.closed')
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

const adminReadbackRowResult = v.object({
  rowId: v.string(),
  rowType: adminReadbackRowType,
  objectRef: v.string(),
  rowState: adminReadbackRowState,
  surface: adminReadbackSurface,
  readbackState: v.union(
    v.literal('not_queued'),
    v.literal('available'),
    v.literal('guarded'),
    v.literal('unavailable')
  ),
  repairAction: adminReadbackRepairAction,
  repairResult: v.optional(v.union(v.literal('not_run'), v.literal('succeeded'), v.literal('failed'))),
  affectedPublicSurfaces: v.optional(v.array(v.string())),
  correlationId: v.optional(v.string()),
  attemptRef: v.optional(v.string()),
  updatedAt: v.number(),
})

const adminReadbackDeniedResult = v.object({
  kind: v.literal('denied'),
  httpStatus: v.union(v.literal(401), v.literal(403)),
  reason: adminReadbackDeniedReason,
  surface: adminReadbackSurface,
  generatedAt: v.number(),
  publicMessage: v.string(),
  rows: v.array(adminReadbackRowResult),
})

const adminReadbackAllowedResult = v.object({
  kind: v.literal('allowed'),
  httpStatus: v.literal(200),
  surface: adminReadbackSurface,
  generatedAt: v.number(),
  actorRef: v.string(),
  summary: v.object({
    queued: v.number(),
    attention: v.number(),
    stale: v.number(),
    suppressed: v.number(),
  }),
  rows: v.array(adminReadbackRowResult),
})

const adminReadbackResult = v.union(adminReadbackDeniedResult, adminReadbackAllowedResult)

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

export const readAdminAuditEvents = queryGeneric({
  args: {},
  returns: adminReadbackResult,
  handler: readAdminAuditEventsHandler,
})

export const readAdminIndexHealth = queryGeneric({
  args: {},
  returns: adminReadbackResult,
  handler: readAdminIndexHealthHandler,
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
