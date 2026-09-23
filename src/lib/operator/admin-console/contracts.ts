import type { CallRef, QuoteRef } from '@/modules/capability-execution/call-contracts'
import type { PublicToolRef } from '@/modules/capability-supply/public'
import type { Slug } from '@/modules/common/ids'
import type { CommercialPolicyControl } from '@/modules/money/public'
import type { AccountRef } from '@/modules/principal-account/account/public'
import type { PrincipalRef } from '@/modules/principal-account/principal/public'
import type {
  AdminAction,
  AdminAuthorityResult,
  AdminRole,
  SourceWriteAdmissionFailureReason,
} from '@/modules/security/public'

export type AdminObjectRef =
  | { kind: 'call'; ref: CallRef }
  | { kind: 'quote'; ref: QuoteRef }
  | { kind: 'tool_version'; ref: PublicToolRef }
  | { kind: 'workspace'; ref: AccountRef }
  | { kind: 'agent'; ref: PrincipalRef }
  | { kind: 'provider'; ref: Slug }

export type AdminObjectKind = AdminObjectRef['kind']

export type AdminParseErrorCode =
  | 'empty'
  | 'malformed_call_ref'
  | 'malformed_quote_ref'
  | 'malformed_tool_ref'
  | 'malformed_account_ref'
  | 'malformed_principal_ref'
  | 'malformed_slug'

export type AdminParseResult =
  | { kind: 'valid'; ref: AdminObjectRef }
  | { kind: 'malformed'; code: AdminParseErrorCode }

export type AdminCommandAction =
  | 'set_business_suppression'
  | 'close_removal_dispute'
  | 'grant_admin_membership'
  | 'revoke_admin_membership'
  | 'verify_capability_source_authority'
  | 'change_commercial_policy'

export const ADMIN_ACTION_PERMISSION = {
  set_business_suppression: 'suppress_business',
  close_removal_dispute: 'close_dispute',
  grant_admin_membership: 'manage_admin_membership',
  revoke_admin_membership: 'manage_admin_membership',
  verify_capability_source_authority: 'register_capability_supply',
  change_commercial_policy: 'manage_commercial_policy',
} as const satisfies Record<AdminCommandAction, AdminAction>

export type AdminProposableAction =
  | 'set_business_suppression'
  | 'change_commercial_policy'
  | 'grant_admin_membership'
  | 'revoke_admin_membership'

export type AdminReasonCodeByAction = {
  set_business_suppression:
    | 'policy_violation'
    | 'legal_notice'
    | 'provider_request'
    | 'fraud_suspected'
    | 'suppression_lifted_after_review'
  close_removal_dispute: 'upheld' | 'refused' | 'withdrawn_by_requester'
  grant_admin_membership: 'onboarding' | 'role_change'
  revoke_admin_membership: 'offboarding' | 'role_change' | 'compromise_suspected'
  verify_capability_source_authority: 'evidence_verified' | 'evidence_insufficient'
  change_commercial_policy: 'pricing_update' | 'correction'
}

export type AdminActionInput = {
  set_business_suppression: {
    businessId: string
    intent: 'suppress' | 'unsuppress'
  }
  close_removal_dispute: {
    disputeId: string
  }
  grant_admin_membership: {
    targetClerkUserId: string
    targetTokenIdentifier: string
    role: AdminRole
  }
  revoke_admin_membership: {
    targetClerkUserId: string
    targetTokenIdentifier?: string
  }
  verify_capability_source_authority: {
    publicationRef: string
    expectedRevision: number
    expectedSourceDigest: string
  }
  change_commercial_policy: {
    changeKind: 'activate' | 'replace' | 'suspend'
    family:
      | 'commercial_perimeter'
      | 'tax'
      | 'accounting_client_money'
      | 'privacy_retention'
      | 'treasury_custody'
      | 'operations'
    environment: 'sandbox' | 'production'
    policyRef: string
    expectedCurrentPolicyRef?: string
    revision: number
    effectiveAt: number
    expiresAt: number
    control: CommercialPolicyControl
  }
}

export type AdminSuccessCodeByAction = {
  set_business_suppression: 'business_suppressed' | 'business_unsuppressed'
  close_removal_dispute: 'dispute_closed'
  grant_admin_membership: 'membership_granted'
  revoke_admin_membership: 'membership_revoked'
  verify_capability_source_authority: 'source_authority_verified' | 'source_authority_insufficient'
  change_commercial_policy: 'commercial_policy_changed'
}

export type AdminAuthorityDenialReason = Extract<
  AdminAuthorityResult,
  { kind: 'denied' }
>['reason']
export type AllowedAdminAuthority = Extract<AdminAuthorityResult, { kind: 'allowed' }>

export type SharedAdminRefusalCode =
  | AdminAuthorityDenialReason
  | SourceWriteAdmissionFailureReason
  | 'mfa_reverification_required'
  | 'idempotency_conflict'
  | 'target_changed'
  | 'admin_invalid_reason'
  | 'admin_missing_evidence'

export type AdminActionRefusalCodes = {
  set_business_suppression: 'business_not_found' | 'suppression_unchanged'
  close_removal_dispute: 'dispute_not_found' | 'dispute_already_closed'
  grant_admin_membership: 'principal_not_found' | 'membership_already_active'
  revoke_admin_membership: 'membership_not_found' | 'last_owner_admin'
  verify_capability_source_authority: 'publication_not_found' | 'source_authority_not_reviewable'
  change_commercial_policy: 'policy_not_found' | 'proof_stale' | 'proof_replayed' | 'authority_mismatch'
}

export type AdminApprovalRefusalCode =
  | 'approval_required'
  | 'approval_not_found'
  | 'approval_same_actor'
  | 'approval_digest_mismatch'
  | 'approval_expired'
  | 'approval_already_resolved'
  | 'approval_actor_not_owner_admin'

export type AdminRefusalCode<A extends AdminCommandAction> =
  | SharedAdminRefusalCode
  | AdminActionRefusalCodes[A]
  | AdminApprovalRefusalCode

export type AnyAdminRefusalCode = {
  [A in AdminCommandAction]: AdminRefusalCode<A>
}[AdminCommandAction]

export type ClerkConsequenceProof = Readonly<{
  reverificationId: string
  firstFactorAgeMinutes: number
  secondFactorAgeMinutes: number
}>

export type AdminApprovalIntent =
  | { kind: 'execute' }
  | { kind: 'propose' }
  | { kind: 'approve'; proposalRef: string }

export type AdminCommandArgs<A extends AdminCommandAction> = Readonly<{
  operationKey: string
  correlationId: string
  action: A
  input: AdminActionInput[A]
  reasonCode: AdminReasonCodeByAction[A]
  evidenceRefs: readonly string[]
  expectedStateDigest?: string
  approval: AdminApprovalIntent
  proof?: ClerkConsequenceProof
}>

export type AdminCommandReceipt<A extends AdminCommandAction> =
  | {
      kind: 'completed'
      action: A
      code: AdminSuccessCodeByAction[A]
      effectRefs: string[]
      auditEventRef: string
      correlationId: string
    }
  | {
      kind: 'proposed'
      action: A
      proposalRef: string
      expiresAt: number
      correlationId: string
    }
  | {
      kind: 'refused'
      action: A
      code: AdminRefusalCode<A>
      correlationId: string
    }

export type AdminException =
  | { kind: 'uncertain_call'; callRef: CallRef; since: number }
  | { kind: 'removal_dispute'; disputeRef: string; businessSlug: Slug; since: number }
  | {
      kind: 'source_authority_review'
      publicationRef: PublicToolRef
      businessSlug: Slug
      since: number
    }
  | { kind: 'admission_case'; caseRef: string; businessSlug: Slug; since: number }

export type AdminExceptionKind = AdminException['kind']
export type AdminExceptionFeed = {
  readonly items: readonly AdminException[]
  readonly total: number
  readonly truncated: boolean
  readonly counts: Readonly<Record<AdminExceptionKind, number>>
  readonly unavailable: readonly AdminExceptionKind[]
}
