import type { BusinessId, ClaimId, OwnerId, Slug, SourceHash } from '@/modules/common/ids'
import type { ModuleResult } from '@/modules/common/result'

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

export type ClaimContract = {
  claimId: ClaimId
  businessId?: BusinessId
  ownerId: OwnerId
  slug: Slug
  status: ClaimStatus
  submittedFactsHash: SourceHash
}

export type VisibilityContract = {
  targetType: VisibilityTargetType
  targetRef: string
  publicStatus: PublicStatus
  suppressedAt?: number
}

export type BusinessContractResult = ModuleResult<
  'business_contract_ready',
  'business_contract_invalid',
  { business: BusinessIdentity },
  { reason: string }
>
