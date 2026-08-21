import type { AuditEventId, BusinessId, CorrelationId, OperationKey } from '@/modules/common/ids'
import type { VisibilityTargetType } from '@/modules/business/public'
import { assertCsrf as assertCsrfImpl } from './internal/csrf'
import {
  createEmptyDisputeSourceState as createEmptyDisputeSourceStateImpl,
  openRemovalDispute as openRemovalDisputeImpl,
} from './internal/disputes'
import {
  bootstrapOwnerAdmin as bootstrapOwnerAdminImpl,
  createEmptyAdminAuthorityState as createEmptyAdminAuthorityStateImpl,
  grantAdminMembership as grantAdminMembershipImpl,
  recordAdminActionDenied as recordAdminActionDeniedImpl,
  requireAdminAuthority as requireAdminAuthorityImpl,
  revokeAdminMembership as revokeAdminMembershipImpl,
} from './internal/admin-authority'
import { readAdminRouteShell as readAdminRouteShellImpl } from './internal/admin-readbacks'
import type {
  AdminActionDeniedCommand,
  AdminAuthorityMutationResult,
  AdminAuthorityResult,
  AdminAuthorityState,
  AdminBootstrapCommand,
  AdminGrantMembershipCommand,
  AdminRevokeMembershipCommand,
} from './internal/admin-authority'
import type {
  AdminAllowedReadback,
  AdminDeniedReadback,
  AdminReadbackDeniedReason,
  AdminReadbackRepairAction,
  AdminReadbackRepairResult,
  AdminReadbackRequest,
  AdminReadbackRow,
  AdminReadbackRowState,
  AdminReadbackRowType,
  AdminReadbackSummary,
  AdminReadbackSurface,
  AdminShellReadback,
} from './internal/admin-readbacks'
import type { AuditEventContract, AuditEventSink } from '@/modules/common/audit-events'

export const AdminRoleValues = ['owner_admin', 'support', 'reviewer'] as const
export type AdminRole = (typeof AdminRoleValues)[number]

export const AdminMembershipStateValues = ['active', 'revoked', 'suspended'] as const
export type AdminMembershipState = (typeof AdminMembershipStateValues)[number]

export const AdminActionValues = [
  'read_admin_readbacks',
  'annotate_triage',
  'manage_admin_membership',
  'use_break_glass',
  'close_dispute',
  'register_capability_binding',
  'register_capability_contract',
  'register_capability_supply',
  'control_kernel_incidents',
] as const
export type AdminAction = (typeof AdminActionValues)[number]

export const AdminMembershipAuditEventTypeValues = [
  'membership_bootstrapped',
  'membership_granted',
  'membership_revoked',
  'break_glass_used',
  'action_denied',
] as const
export type AdminMembershipAuditEventType = (typeof AdminMembershipAuditEventTypeValues)[number]

export const DisputeStatusValues = ['opened', 'updated', 'closed', 'contested'] as const
export type DisputeStatus = (typeof DisputeStatusValues)[number]
export const AbuseBucketStateValues = ['open', 'limited', 'blocked'] as const
export type AbuseBucketState = (typeof AbuseBucketStateValues)[number]


export const RemovalDisputeReasonCodeValues = [
  'privacy_removal_requested',
  'ownership_contested',
  'duplicate_or_impersonation',
  'unsafe_or_inaccurate',
] as const
export type RemovalDisputeReasonCode = (typeof RemovalDisputeReasonCodeValues)[number]

export const DisputeEvidenceMediaTypeValues = ['text/plain', 'image/jpeg', 'image/png', 'application/pdf'] as const
export type DisputeEvidenceMediaType = (typeof DisputeEvidenceMediaTypeValues)[number]


export type AdminMembership = {
  clerkUserId: string
  tokenIdentifier: string
  role: AdminRole
  state: AdminMembershipState
  grantedBy: string
  grantedAt: number
  revokedBy?: string
  revokedAt?: number
  evidenceRef?: string
}

export type AbuseRateLimitBucketRecord = {
  scope: string
  key: string
  window: string
  count: number
  state: AbuseBucketState
  resetAt: number
  updatedAt: number
}

export type CsrfCheckInput = {
  csrfToken?: string
  csrfCookie?: string
  origin?: string
  allowedOrigins: readonly string[]
}

export type CsrfDecision =
  | { kind: 'accepted'; mode: 'csrf_token' | 'same_site_origin' }
  | { kind: 'rejected'; reason: 'missing_csrf' | 'foreign_origin' }


export type AdminDecisionAudit = {
  auditEventId: AuditEventId
  eventType: AdminMembershipAuditEventType
  actorRef: string
  targetRef: string
  reasonCode: string
  evidenceRefs: readonly string[]
  operationKey: OperationKey
  correlationId: CorrelationId
  createdAt: number
}

export type DisputeEvidenceInput = {
  label: string
  mediaType: DisputeEvidenceMediaType
  byteLength: number
  privateRef: string
}

export type DisputeRecord = {
  disputeId: string
  businessId: BusinessId
  status: DisputeStatus
  openedByContactHash: string
  targetType: VisibilityTargetType
  targetRef: string
  reasonCode: RemovalDisputeReasonCode
  evidenceHash: string
  evidenceRefs: string[]
  publicMessageHash: string
  operationKey: OperationKey
  operationKeys: OperationKey[]
  correlationId: CorrelationId
  requestCount: number
  createdAt: number
  updatedAt: number
}

export type DisputeSourceState = AuditEventSink & {
  disputes: DisputeRecord[]
}

export type DisputeOpenCommand = {
  businessId: BusinessId
  targetType: VisibilityTargetType
  targetRef: string
  reasonCode: RemovalDisputeReasonCode
  contact: {
    email?: string
    phone?: string
    name?: string
  }
  evidence: readonly DisputeEvidenceInput[]
  publicMessage?: string
  security: {
    csrf: CsrfCheckInput
  }
  operationKey: OperationKey
  correlationId: CorrelationId
  now: number
}

export type RemovalDisputeReceipt = {
  disputeId: string
  status: DisputeStatus
  targetType: VisibilityTargetType
  targetRef: string
  reasonCode: RemovalDisputeReasonCode
  evidenceHash: string
  requestCount: number
  updatedAt: number
}

export type DisputeOpenResult =
  | {
      kind: 'ok'
      code: 'dispute_opened' | 'dispute_open_replayed' | 'dispute_open_updated'
      dispute: DisputeRecord
      receipt: RemovalDisputeReceipt
      auditEvent?: AuditEventContract
    }
  | {
      kind: 'error'
      code:
        | 'dispute_csrf_rejected'
        | 'dispute_invalid_contact'
        | 'dispute_invalid_target'
        | 'dispute_invalid_reason'
        | 'dispute_invalid_evidence'
      retryable: boolean
      reason: string
    }

export type {
  AdminAllowedReadback,
  AdminActionDeniedCommand,
  AdminAuthorityMutationResult,
  AdminAuthorityResult,
  AdminAuthorityState,
  AdminBootstrapCommand,
  AdminDeniedReadback,
  AdminGrantMembershipCommand,
  AdminReadbackDeniedReason,
  AdminReadbackRepairAction,
  AdminReadbackRepairResult,
  AdminReadbackRequest,
  AdminReadbackRow,
  AdminReadbackRowState,
  AdminReadbackRowType,
  AdminReadbackSummary,
  AdminReadbackSurface,
  AdminRevokeMembershipCommand,
  AdminShellReadback,
}

export const assertCsrf = assertCsrfImpl


export const requireAdminAuthority = requireAdminAuthorityImpl

export const bootstrapOwnerAdmin = bootstrapOwnerAdminImpl

export const createEmptyAdminAuthorityState = createEmptyAdminAuthorityStateImpl

export const grantAdminMembership = grantAdminMembershipImpl

export const recordAdminActionDenied = recordAdminActionDeniedImpl

export const revokeAdminMembership = revokeAdminMembershipImpl

export const readAdminRouteShell = readAdminRouteShellImpl

export const createEmptyDisputeSourceState = createEmptyDisputeSourceStateImpl

export const openRemovalDispute = openRemovalDisputeImpl
