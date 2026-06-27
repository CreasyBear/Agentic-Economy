import type { BusinessId, ClaimId, CorrelationId, OperationKey, OwnerId, Slug, SourceHash } from '@/modules/common/ids'
import type { ModuleResult } from '@/modules/common/result'
import {
  claimBusiness as claimBusinessImpl,
  createEmptyBusinessSourceState as createEmptyBusinessSourceStateImpl,
} from './internal/claim'

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
  operationKey: OperationKey
  correlationId: CorrelationId
  now: number
}

export type ClaimBusinessErrorCode =
  | 'claim_unauthenticated'
  | 'claim_invalid_facts'
  | 'claim_slug_conflict'

export type ClaimBusinessResult = ModuleResult<
  'claim_created',
  ClaimBusinessErrorCode,
  { owner: BusinessOwnerRecord; business: BusinessRecord; claim: ClaimRecord; context: BusinessContextRecord },
  { reason: string }
>

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

export const createEmptyBusinessSourceState = createEmptyBusinessSourceStateImpl

export const claimBusiness = claimBusinessImpl
