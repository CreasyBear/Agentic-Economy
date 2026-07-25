import type {
  BusinessContextRecord,
  BusinessMutationActor,
  BusinessRecord,
  BusinessSourceState,
  ClaimRecord,
  PublicBusinessPhoto,
  PublicStatus,
  TrustTier,
} from '@/modules/business/public'
import type { BusinessId, CorrelationId, OperationKey, ServiceId, Slug, SourceHash } from '@/modules/common/ids'
import type { DiscoveryManifestAttemptContract } from '@/modules/discovery/public'
import type { DiscoveryStatus } from '@/modules/discovery/public'
import type { AuditEventContract, OperationKeyRecord } from '@/modules/observability/public'
import type { IndexStatus, RegistryProjectionAttemptContract } from '@/modules/registry/public'
import type { CsrfCheckInput, SuppressionRuleRecord } from '@/modules/security/public'

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
  callable: boolean
  paymentRequired: boolean
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
  callable: boolean
  paymentRequired: boolean
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
  publishedPhone?: string
  postcode?: string
  publicUrl: string
  publicStatus: Extract<PublicStatus, 'published'>
  trustTier: TrustTier
  indexStatus: IndexStatus
  discoveryStatus: DiscoveryStatus
  photos: readonly PublicBusinessPhoto[]
  responseTimeMinutes?: number
  services: readonly PublicServiceContract[]
  sourceHash: SourceHash
  schemaVersion: 'public-catalog:v1'
  updatedAt: number
}

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
  | { kind: 'hidden'; reason: 'not_published' }

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

export function createEmptyCatalogSourceState(): CatalogSourceState {
  return {
    businessServices: [],
    serviceCapabilities: [],
  }
}

export function validateServiceCatalogInput(
  services: readonly ServiceCatalogInput[]
): ServiceCatalogValidationResult {
  const validatedServices: ValidatedServiceCatalogInput[] = []
  for (const service of services) {
    const name = cleanText(service.name)
    const category = cleanText(service.category)
    const summary = cleanText(service.summary)
    const serviceArea = cleanText(service.serviceArea)
    const hoursOrUnknown = cleanText(service.hoursOrUnknown)

    if (
      name.length === 0 ||
      category.length === 0 ||
      summary.length === 0 ||
      serviceArea.length === 0 ||
      hoursOrUnknown.length === 0
    ) {
      return { kind: 'invalid', reason: 'invalid_service' }
    }

    const firstRequest = buildFirstRequestDisclosure(service.firstRequest)
    if (firstRequest === undefined) {
      return { kind: 'invalid', reason: 'invalid_first_request' }
    }

    validatedServices.push({
      name,
      category,
      summary,
      serviceArea,
      hoursOrUnknown,
      firstRequest,
    })
  }

  return { kind: 'valid', services: validatedServices }
}

export function buildPublicCatalogDto(input: BuildPublicCatalogInput): BuildPublicCatalogResult {
  if (input.business.publicStatus !== 'published') {
    return { kind: 'hidden', reason: 'not_published' }
  }

  const services = input.services
    .filter((service) => service.status === 'published')
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((service): PublicServiceContract => {
      const capabilities: ServiceCapabilityContract[] = []
      for (const capability of input.capabilities) {
        if (capability.serviceId !== service.serviceId) {
          continue
        }
        const base = {
          serviceId: capability.serviceId,
          kind: capability.kind,
          status: capability.status,
          firstRequest: capability.firstRequest,
          callable: false as const,
          paymentRequired: false as const,
          sourceHash: capability.sourceHash,
        }
        capabilities.push(capability.reason === undefined ? base : { ...base, reason: capability.reason })
      }

      const firstCapability = capabilities.at(0)
      const firstRequest = firstCapability?.firstRequest

      if (firstRequest === undefined) {
        throw new Error('Published services require first-request disclosure.')
      }

      return {
        serviceId: service.serviceId,
        serviceSlug: service.serviceSlug,
        businessId: service.businessId,
        name: service.name,
        category: service.category,
        summary: service.summary,
        serviceArea: service.serviceArea,
        hoursOrUnknown: service.hoursOrUnknown,
        firstRequest,
        status: 'published',
        capabilities,
        sourceHash: service.sourceHash,
      }
    })

  const catalog: PublicCatalogContract = {
    businessId: input.business.businessId,
    slug: input.business.slug,
    name: input.business.name,
    category: input.context.category,
    suburb: input.context.suburb,
    stateTerritory: input.context.stateTerritory,
    ...(input.business.publishedPhone === undefined ? {} : { publishedPhone: input.business.publishedPhone }),
    ...(input.context.postcode === undefined ? {} : { postcode: input.context.postcode }),
    publicUrl: `/${input.business.slug}`,
    publicStatus: 'published',
    trustTier: input.business.trustTier,
    indexStatus: input.indexStatus,
    discoveryStatus: input.discoveryStatus,
    photos: input.context.photos ?? [],
    ...(input.context.responseTimeMinutes === undefined
      ? {}
      : { responseTimeMinutes: input.context.responseTimeMinutes }),
    services,
    sourceHash: input.business.sourceHash,
    schemaVersion: 'public-catalog:v1',
    updatedAt: input.business.updatedAt,
  }

  return { kind: 'available', catalog }
}

function buildFirstRequestDisclosure(input: FirstRequestDisclosureInput): PublicFirstRequestDisclosure | undefined {
  if (input.mode === 'not_available_yet') {
    const noContactReason = cleanText(input.noContactReason)
    if (noContactReason.length === 0) {
      return undefined
    }

    const fallbackDisclosure = input.publicDisclosure === undefined ? 'This business has not published a request path.' : input.publicDisclosure
    const publicDisclosure = cleanText(fallbackDisclosure)
    return {
      mode: input.mode,
      publicDisclosure,
      publicChannel: input.publicChannel,
      noContactReason,
      rawContactExcluded: true,
    }
  }

  const publicDisclosure = cleanText(input.publicDisclosure)
  if (publicDisclosure.length === 0) {
    return undefined
  }

  return {
    mode: input.mode,
    publicDisclosure,
    publicChannel: input.publicChannel,
    rawContactExcluded: true,
  }
}

function cleanText(value: string): string {
  return value.replaceAll(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 280)
}
