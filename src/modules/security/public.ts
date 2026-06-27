import type { AuditEventId, CorrelationId, OperationKey } from '@/modules/common/ids'
import type { ClaimId, OwnerId, Slug } from '@/modules/common/ids'
import {
  allocateDeterministicSlug as allocateDeterministicSlugImpl,
  detectDuplicateClaim as detectDuplicateClaimImpl,
  normalizeClaimFingerprint as normalizeClaimFingerprintImpl,
} from './internal/duplicates'

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

export type ClaimFingerprintRecord = {
  fingerprint: string
  status: ClaimFingerprintStatus
  businessSlug: Slug
  ownerId: OwnerId
  claimId?: ClaimId
  createdAt: number
  updatedAt: number
}

export type ClaimFingerprintInput = {
  name: string
  category: string
  suburb: string
  stateTerritory: string
}

export type DuplicateClaimDecision =
  | { kind: 'clear'; fingerprint: string }
  | { kind: 'same_owner_conflict'; fingerprint: string; claimId?: ClaimId }
  | { kind: 'pending_review'; fingerprint: string; publicReason: 'duplicate_or_impersonation_review' }

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

export const allocateDeterministicSlug = allocateDeterministicSlugImpl

export const detectDuplicateClaim = detectDuplicateClaimImpl

export const normalizeClaimFingerprint = normalizeClaimFingerprintImpl
