import type { BusinessId, ServiceId, Slug, SourceHash } from '@/modules/common/ids'
import type { BusinessContextRecord, BusinessRecord } from '@/modules/business/public'
import type { BusinessMutationActor, BusinessSourceState, ClaimRecord } from '@/modules/business/public'
import { isPubliclyDiscoverable } from '@/modules/business/public'
import type { SuppressionRuleRecord } from '@/modules/security/public'
import type { DiscoveryStatus } from '@/modules/discovery/public'
import type { DiscoveryManifestAttemptContract } from '@/modules/discovery/public'
import type { PublicStatus, TrustTier } from '@/modules/business/public'
import type { IndexStatus, RegistryProjectionAttemptContract } from '@/modules/registry/public'
import type { AuditEventContract, OperationKeyRecord } from '@/modules/observability/public'
import type { CorrelationId, OperationKey } from '@/modules/common/ids'
import type { CsrfCheckInput } from '@/modules/security/public'
import {
  buildPublicCatalogDto as buildPublicCatalogDtoImpl,
  createEmptyCatalogSourceState as createEmptyCatalogSourceStateImpl,
} from './internal/public-catalog-dto'
import {
  buildPublicOwnerStatusReadback as buildPublicOwnerStatusReadbackImpl,
  getDefaultPublicOwnerStatusReadback as getDefaultPublicOwnerStatusReadbackImpl,
  getPublicBusinessPageReadback as getPublicBusinessPageReadbackImpl,
  getPublicOwnerStatusReadbackBySlug as getPublicOwnerStatusReadbackBySlugImpl,
  publicOwnerDefaultClaimInput as publicOwnerDefaultClaimInputImpl,
  resetPublicOwnerRouteReadbacksForTest as resetPublicOwnerRouteReadbacksForTestImpl,
  submitDurablePublicOwnerClaimFlow as submitDurablePublicOwnerClaimFlowImpl,
  submitPublicOwnerClaimFlow as submitPublicOwnerClaimFlowImpl,
  validatePublicOwnerClaimFlowInput as validatePublicOwnerClaimFlowInputImpl,
} from './internal/owner-public-flow'
import type {
  PublicBusinessPageReadbackResult,
  PublicOwnerClaimField,
  PublicOwnerClaimFlowInput,
  PublicOwnerClaimFlowResult,
  PublicOwnerClaimValidationError,
  PublicOwnerClaimValidationResult,
  PublicOwnerStatusReadback,
  PublicOwnerUnavailableCapability,
} from './internal/owner-public-flow'
import { validateServiceCatalogInput as validateServiceCatalogInputImpl } from './internal/first-request'
import { publishBusinessCatalog as publishBusinessCatalogImpl } from './internal/publish'

export const FirstRequestModeValues = ['inquiry_available', 'quote_request_available', 'not_available_yet'] as const
export type FirstRequestMode = (typeof FirstRequestModeValues)[number]

export const PublicFirstRequestChannelValues = [
  'public_business_contact',
  'ae_status_only',
  'not_available',
] as const
export type PublicFirstRequestChannel = (typeof PublicFirstRequestChannelValues)[number]

export const ServiceCapabilityStatusValues = ['available', 'degraded', 'unavailable', 'stale'] as const
export type ServiceCapabilityStatus = (typeof ServiceCapabilityStatusValues)[number]

export const CapabilityKindValues = [
  'phone_inquiry',
  'quote_request',
  'emergency_callout_interest',
  'ae_hosted_discovery',
] as const
export type CapabilityKind = (typeof CapabilityKindValues)[number]

export const BusinessServiceStatusValues = ['draft', 'published', 'suppressed'] as const
export type BusinessServiceStatus = (typeof BusinessServiceStatusValues)[number]

export type PublicFirstRequestDisclosure = {
  mode: FirstRequestMode
  publicDisclosure: string
  publicChannel: PublicFirstRequestChannel
  noContactReason?: string
  rawContactExcluded: true
}

export type FirstRequestDisclosureInput =
  | {
      mode: Extract<FirstRequestMode, 'inquiry_available' | 'quote_request_available'>
      publicDisclosure: string
      publicChannel: Extract<PublicFirstRequestChannel, 'public_business_contact' | 'ae_status_only'>
      rawContactValue?: string
    }
  | {
      mode: Extract<FirstRequestMode, 'not_available_yet'>
      publicDisclosure?: string
      publicChannel: Extract<PublicFirstRequestChannel, 'ae_status_only' | 'not_available'>
      noContactReason: string
    }

export type ServiceCatalogInput = {
  name: string
  category: string
  summary: string
  serviceArea: string
  hoursOrUnknown: string
  firstRequest: FirstRequestDisclosureInput
}

export type ValidatedServiceCatalogInput = {
  name: string
  category: string
  summary: string
  serviceArea: string
  hoursOrUnknown: string
  firstRequest: PublicFirstRequestDisclosure
}

export type ServiceCatalogValidationResult =
  | { kind: 'valid'; services: readonly ValidatedServiceCatalogInput[] }
  | { kind: 'invalid'; reason: 'empty_services' | 'invalid_service' | 'invalid_first_request' }

export type BusinessServiceRecord = {
  serviceId: ServiceId
  serviceSlug: Slug
  businessId: BusinessId
  name: string
  category: string
  summary: string
  serviceArea: string
  hoursOrUnknown: string
  status: BusinessServiceStatus
  sortOrder: number
  sourceHash: SourceHash
  createdAt: number
  updatedAt: number
}

export type ServiceCapabilityRecord = {
  businessId: BusinessId
  serviceId: ServiceId
  kind: CapabilityKind
  status: ServiceCapabilityStatus
  firstRequest: PublicFirstRequestDisclosure
  callable: false
  paymentRequired: false
  reason?: string
  sourceHash: SourceHash
  createdAt: number
  updatedAt: number
}

export type CatalogSourceState = {
  businessServices: BusinessServiceRecord[]
  serviceCapabilities: ServiceCapabilityRecord[]
}

export type CatalogPublishSourceState = CatalogSourceState & {
  operationKeys: OperationKeyRecord[]
  auditEvents: AuditEventContract[]
  registryProjectionAttempts: RegistryProjectionAttemptContract[]
  discoveryManifestAttempts: DiscoveryManifestAttemptContract[]
}

export type ServiceCapabilityContract = {
  serviceId: ServiceId
  kind: CapabilityKind
  status: ServiceCapabilityStatus
  firstRequest: PublicFirstRequestDisclosure
  callable: false
  paymentRequired: false
  reason?: string
  sourceHash: SourceHash
}

export type PublicServiceContract = {
  serviceId: ServiceId
  serviceSlug: Slug
  businessId: BusinessId
  name: string
  category: string
  summary: string
  serviceArea: string
  hoursOrUnknown: string
  firstRequest: PublicFirstRequestDisclosure
  status: Extract<BusinessServiceStatus, 'published'>
  capabilities: readonly ServiceCapabilityContract[]
  sourceHash: SourceHash
}

export type PublicCatalogContract = {
  businessId: BusinessId
  slug: Slug
  name: string
  category: string
  suburb: string
  stateTerritory: string
  postcode?: string
  publicUrl: string
  publicStatus: Extract<PublicStatus, 'published'>
  trustTier: TrustTier
  indexStatus: IndexStatus
  discoveryStatus: DiscoveryStatus
  services: readonly PublicServiceContract[]
  sourceHash: SourceHash
  schemaVersion: 'public-catalog:v1'
  updatedAt: number
}

export type PublicRouteCapabilityContract = Omit<PublicCatalogContract['services'][number]['capabilities'][number], 'sourceHash'>

export type PublicRouteServiceContract = Omit<PublicCatalogContract['services'][number], 'sourceHash' | 'capabilities'> & {
  capabilities: readonly PublicRouteCapabilityContract[]
}

export type PublicRouteCatalogContract = Omit<PublicCatalogContract, 'sourceHash' | 'services'> & {
  services: readonly PublicRouteServiceContract[]
}

export type PublicOwnerStatusRouteReadback = Omit<PublicOwnerStatusReadback, 'catalog'> & {
  catalog: PublicRouteCatalogContract
}

export type PublicOwnerStatusRouteReadbackResult =
  | { kind: 'available'; readback: PublicOwnerStatusRouteReadback }
  | { kind: 'not_found'; reason: 'not_public' }
  | { kind: 'unavailable'; reason: 'source_unavailable'; retryable: true }

export type PublicOwnerClaimFlowRouteResult =
  | Extract<PublicOwnerClaimFlowResult, { kind: 'error' }>
  | {
      kind: 'ok'
      code: 'claim_flow_published'
      catalog: PublicRouteCatalogContract
      readback: PublicOwnerStatusRouteReadback
    }

export type PublicBusinessPageRouteReadbackResult =
  | { kind: 'available'; catalog: PublicRouteCatalogContract }
  | Exclude<PublicBusinessPageReadbackResult, { kind: 'available' }>

export type BuildPublicCatalogInput = {
  business: BusinessRecord
  context: BusinessContextRecord
  services: readonly BusinessServiceRecord[]
  capabilities: readonly ServiceCapabilityRecord[]
  indexStatus: IndexStatus
  discoveryStatus: DiscoveryStatus
}

export type BuildPublicCatalogResult =
  | { kind: 'available'; catalog: PublicCatalogContract }
  | { kind: 'hidden'; reason: 'not_published' | 'no_published_services' }

export type PublicCatalogReadState = BusinessSourceState &
  CatalogSourceState & {
    suppressionRules: SuppressionRuleRecord[]
  }

export type GetPublicBusinessCatalogInput = {
  slug: Slug
  indexStatus: IndexStatus
  discoveryStatus: DiscoveryStatus
}

export type PublishBusinessCatalogCommand = {
  actor: BusinessMutationActor
  claimId: ClaimRecord['claimId']
  services: readonly ServiceCatalogInput[]
  security: {
    csrf: CsrfCheckInput
  }
  operationKey: OperationKey
  correlationId: CorrelationId
  now: number
}

export type PublishBusinessCatalogErrorCode =
  | 'catalog_publish_unauthenticated'
  | 'catalog_publish_csrf_rejected'
  | 'catalog_publish_claim_not_found'
  | 'catalog_publish_wrong_owner'
  | 'catalog_publish_pending_review'
  | 'catalog_publish_invalid_services'
  | 'catalog_publish_operation_conflict'

export type PublishBusinessCatalogResult =
  | {
      kind: 'ok'
      code: 'catalog_published' | 'catalog_publish_replayed'
      business: BusinessRecord
      claim: ClaimRecord
      catalog: PublicCatalogContract
      auditEvent: AuditEventContract
      registryProjectionAttempts: readonly RegistryProjectionAttemptContract[]
      discoveryManifestAttempts: readonly DiscoveryManifestAttemptContract[]
    }
  | {
      kind: 'error'
      code: PublishBusinessCatalogErrorCode
      retryable: boolean
      reason: string
    }

export type PublishBusinessCatalogState = BusinessSourceState & CatalogPublishSourceState

export const buildPublicCatalogDto = buildPublicCatalogDtoImpl

export const createEmptyCatalogSourceState = createEmptyCatalogSourceStateImpl

export const validateServiceCatalogInput = validateServiceCatalogInputImpl

export const publishBusinessCatalog = publishBusinessCatalogImpl

export const publicOwnerDefaultClaimInput = publicOwnerDefaultClaimInputImpl

export const validatePublicOwnerClaimFlowInput = validatePublicOwnerClaimFlowInputImpl

export const submitPublicOwnerClaimFlow = submitPublicOwnerClaimFlowImpl

export const submitDurablePublicOwnerClaimFlow = submitDurablePublicOwnerClaimFlowImpl

export const resetPublicOwnerRouteReadbacksForTest = resetPublicOwnerRouteReadbacksForTestImpl

export const getDefaultPublicOwnerStatusReadback = getDefaultPublicOwnerStatusReadbackImpl

export const getPublicOwnerStatusReadbackBySlug = getPublicOwnerStatusReadbackBySlugImpl

export const getPublicBusinessPageReadback = getPublicBusinessPageReadbackImpl

export const buildPublicOwnerStatusReadback = buildPublicOwnerStatusReadbackImpl

export type {
  PublicBusinessPageReadbackResult,
  PublicOwnerClaimField,
  PublicOwnerClaimFlowInput,
  PublicOwnerClaimFlowResult,
  PublicOwnerClaimValidationError,
  PublicOwnerClaimValidationResult,
  PublicOwnerStatusReadback,
  PublicOwnerUnavailableCapability,
}

export function getPublicBusinessCatalog(
  state: PublicCatalogReadState,
  input: GetPublicBusinessCatalogInput
): BuildPublicCatalogResult {
  const business = state.businesses.find((candidate) => candidate.slug === input.slug)
  if (business === undefined) {
    return { kind: 'hidden', reason: 'not_published' }
  }

  if (!isPubliclyDiscoverable(business, state.suppressionRules)) {
    return { kind: 'hidden', reason: 'not_published' }
  }

  const context = state.businessContexts.find((candidate) => candidate.businessId === business.businessId)
  if (context === undefined) {
    return { kind: 'hidden', reason: 'not_published' }
  }

  return buildPublicCatalogDtoImpl({
    business,
    context,
    services: state.businessServices.filter((service) => service.businessId === business.businessId),
    capabilities: state.serviceCapabilities.filter((capability) => capability.businessId === business.businessId),
    indexStatus: input.indexStatus,
    discoveryStatus: input.discoveryStatus,
  })
}
