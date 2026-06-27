import type { AuditEventId, CorrelationId, OperationKey } from '@/modules/common/ids'

export const AdminRoleValues = ['owner_admin', 'support', 'reviewer'] as const
export type AdminRole = (typeof AdminRoleValues)[number]

export const AdminMembershipStateValues = ['active', 'revoked', 'suspended'] as const
export type AdminMembershipState = (typeof AdminMembershipStateValues)[number]

export const AdminActionValues = [
  'read_admin_readbacks',
  'annotate_triage',
  'manage_admin_membership',
  'use_break_glass',
  'change_public_visibility',
  'close_dispute',
  'set_operator_control',
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

export const SuppressionRuleStatusValues = ['active', 'lifted'] as const
export type SuppressionRuleStatus = (typeof SuppressionRuleStatusValues)[number]

export const DisputeStatusValues = ['opened', 'updated', 'closed', 'contested'] as const
export type DisputeStatus = (typeof DisputeStatusValues)[number]

export const AbuseBucketStateValues = ['open', 'limited', 'blocked'] as const
export type AbuseBucketState = (typeof AbuseBucketStateValues)[number]

export const ClaimFingerprintStatusValues = ['clear', 'duplicate_suspected', 'contested'] as const
export type ClaimFingerprintStatus = (typeof ClaimFingerprintStatusValues)[number]

export type AdminMembership = {
  clerkUserId: string
  role: AdminRole
  state: AdminMembershipState
  grantedBy: string
  grantedAt: number
  revokedBy?: string
  revokedAt?: number
  evidenceRef?: string
}

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
