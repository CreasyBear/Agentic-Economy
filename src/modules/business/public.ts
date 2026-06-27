import type { BusinessId, ClaimId, CorrelationId, OperationKey, OwnerId, Slug, SourceHash } from '@/modules/common/ids'
import type { ModuleResult } from '@/modules/common/result'
import type {
  AbuseRateLimitBucketRecord,
  AdminMembership,
  ClaimFingerprintRecord,
  CsrfCheckInput,
  RateLimitClaimInput,
  SuppressionRuleRecord,
} from '@/modules/security/public'
import {
  claimBusiness as claimBusinessImpl,
  createEmptyBusinessSourceState as createEmptyBusinessSourceStateImpl,
} from './internal/claim'
import {
  isPubliclyDiscoverable as isPubliclyDiscoverableImpl,
  suppressBusiness as suppressBusinessImpl,
  unsuppressBusiness as unsuppressBusinessImpl,
} from './internal/visibility'
import type { AuditEventContract, InvalidationIntent } from '@/modules/observability/public'
import type { BusinessServiceRecord } from '@/modules/catalog/public'

export const ClaimStatusValues = ['draft', 'authenticated', 'published', 'contested', 'disputed', 'suppressed'] as const
export type ClaimStatus = (typeof ClaimStatusValues)[number]

export const PublicStatusValues = ['unpublished', 'published', 'suppressed'] as const
export type PublicStatus = (typeof PublicStatusValues)[number]

export const TrustTierValues = ['claimed', 'contact_confirmed', 'listed', 'registry_verified'] as const
export type TrustTier = (typeof TrustTierValues)[number]

export const VisibilityTargetTypeValues = ['business', 'service', 'capability'] as const
export type VisibilityTargetType = (typeof VisibilityTargetTypeValues)[number]

export type BusinessIdentity = {
  businessId: BusinessId
  ownerId: OwnerId
  slug: Slug
  name: string
  category: string
  suburb: string
  publicStatus: PublicStatus
  trustTier: TrustTier
  sourceHash: SourceHash
}

export type BusinessOwnerRecord = {
  ownerId: OwnerId
  clerkUserId: string
  displayName?: string
  emailHash?: string
  createdAt: number
  updatedAt: number
}

export type BusinessSourceRef = {
  label: string
  evidenceRef: string
  sourceHash: SourceHash
}

export type BusinessContextRecord = {
  businessId: BusinessId
  category: string
  suburb: string
  stateTerritory: string
  ownerMessage?: string
  sourceRefs: readonly BusinessSourceRef[]
  sourceHash: SourceHash
  approvedAt: number
}

export type BusinessRecord = {
  businessId: BusinessId
  ownerId: OwnerId
  slug: Slug
  name: string
  normalizedName: string
  category: string
  suburb: string
  stateTerritory: string
  publicStatus: PublicStatus
  trustTier: TrustTier
  claimStatus: ClaimStatus
  sourceHash: SourceHash
  createdAt: number
  updatedAt: number
  suppressedAt?: number
}

export type ClaimRecord = {
  claimId: ClaimId
  ownerId: OwnerId
  businessId?: BusinessId
  slug: Slug
  status: ClaimStatus
  submittedFactsHash: SourceHash
  createdAt: number
  updatedAt: number
}

export type ClaimContract = {
  claimId: ClaimId
  businessId?: BusinessId
  ownerId: OwnerId
  slug: Slug
  status: ClaimStatus
  submittedFactsHash: SourceHash
}

export type BusinessSourceState = {
  owners: BusinessOwnerRecord[]
  businesses: BusinessRecord[]
  businessContexts: BusinessContextRecord[]
  claims: ClaimRecord[]
  claimFingerprints: ClaimFingerprintRecord[]
  abuseRateLimitBuckets: AbuseRateLimitBucketRecord[]
}

export type BusinessSuppressionState = BusinessSourceState & {
  businessServices: BusinessServiceRecord[]
  suppressionRules: SuppressionRuleRecord[]
  auditEvents: AuditEventContract[]
  invalidationIntents: InvalidationIntent[]
}

export type BusinessMutationActor =
  | {
      kind: 'authenticated_owner'
      clerkUserId: string
      displayName?: string
      emailHash?: string
      sessionRef?: string
    }
  | {
      kind: 'anonymous'
      anonymousBucket: string
    }

export type ClaimBusinessFacts = {
  name: string
  category: string
  suburb: string
  stateTerritory: string
  requestedSlug: string
  ownerMessage?: string
  sourceRefs: readonly BusinessSourceRef[]
}

export type ClaimBusinessCommand = {
  actor: BusinessMutationActor
  facts: ClaimBusinessFacts
  security: {
    csrf: CsrfCheckInput
    rateLimit: RateLimitClaimInput
  }
  operationKey: OperationKey
  correlationId: CorrelationId
  now: number
}

export type ClaimBusinessErrorCode =
  | 'claim_unauthenticated'
  | 'claim_invalid_facts'
  | 'claim_slug_conflict'
  | 'claim_duplicate_conflict'
  | 'claim_pending_review'
  | 'claim_csrf_rejected'
  | 'claim_rate_limited'

export type ClaimBusinessResult = ModuleResult<
  'claim_created',
  ClaimBusinessErrorCode,
  { owner: BusinessOwnerRecord; business: BusinessRecord; claim: ClaimRecord; context: BusinessContextRecord },
  { reason: string; claim?: ClaimRecord; publicReason?: 'duplicate_or_impersonation_review' }
>

export type VisibilityContract = {
  targetType: VisibilityTargetType
  targetRef: string
  publicStatus: PublicStatus
  suppressedAt?: number
}

export type SuppressBusinessCommand = {
  adminMembership: AdminMembership | undefined
  businessId: BusinessId
  security: {
    csrf: CsrfCheckInput
  }
  reasonCode: string
  evidenceRefs: readonly string[]
  operationKey: OperationKey
  correlationId: CorrelationId
  now: number
}

export type SuppressBusinessResult =
  | {
      kind: 'ok'
      code: 'business_suppressed' | 'business_suppression_replayed'
      business: BusinessRecord
      auditEvent: AuditEventContract
      invalidationIntent: InvalidationIntent
    }
  | {
      kind: 'error'
      code:
        | 'business_suppress_csrf_rejected'
        | 'business_suppress_admin_denied'
        | 'business_suppress_not_found'
        | 'business_suppress_invalid_reason'
        | 'business_suppress_missing_evidence'
      retryable: boolean
      reason: string
    }

export type UnsuppressBusinessCommand = {
  adminMembership: AdminMembership | undefined
  businessId: BusinessId
  security: {
    csrf: CsrfCheckInput
  }
  reasonCode: string
  evidenceRefs: readonly string[]
  operationKey: OperationKey
  correlationId: CorrelationId
  now: number
}

export type UnsuppressBusinessResult =
  | {
      kind: 'ok'
      code: 'business_unsuppressed' | 'business_unsuppression_replayed'
      business: BusinessRecord
      auditEvent: AuditEventContract
      invalidationIntent: InvalidationIntent
    }
  | {
      kind: 'error'
      code:
        | 'business_unsuppress_csrf_rejected'
        | 'business_unsuppress_admin_denied'
        | 'business_unsuppress_not_found'
        | 'business_unsuppress_invalid_reason'
        | 'business_unsuppress_missing_evidence'
      retryable: boolean
      reason: string
    }

export type BusinessContractResult = ModuleResult<
  'business_contract_ready',
  'business_contract_invalid',
  { business: BusinessIdentity },
  { reason: string }
>

export const createEmptyBusinessSourceState = createEmptyBusinessSourceStateImpl

export const claimBusiness = claimBusinessImpl

export const isPubliclyDiscoverable = isPubliclyDiscoverableImpl

export const suppressBusiness = suppressBusinessImpl

export const unsuppressBusiness = unsuppressBusinessImpl
