import type {
  BusinessContextRecord,
  BusinessMutationActor,
  BusinessRecord,
  BusinessSourceState,
  ClaimRecord,
} from '@/modules/business/public'
import type { AuditEventContract } from '@/modules/common/audit-events'
import type { CorrelationId, OperationKey, Slug } from '@/modules/common/ids'
import {
  buildBusinessSupplyProjection,
  type BusinessOfferingRecord,
  type BusinessOfferingRevisionRecord,
  type BusinessSupplyProjection,
  type OfferingAccessPathRecord,
} from './offering-supply'
import type { DiscoveryManifestAttemptContract, DiscoveryStatus } from '@/modules/discovery/public'
import type { OperationKeyRecord } from '@/modules/observability/public'
import type { IndexStatus, RegistryProjectionAttemptContract } from '@/modules/registry/public'
import type { CsrfCheckInput, SuppressionRuleRecord } from '@/modules/security/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

export const FirstRequestModeValues = ['inquiry_available', 'quote_request_available', 'not_available_yet'] as const
export type FirstRequestMode = (typeof FirstRequestModeValues)[number]

export const PublicFirstRequestChannelValues = [
  'public_business_contact',
  'ae_status_only',
  'not_available',
] as const
export type PublicFirstRequestChannel = (typeof PublicFirstRequestChannelValues)[number]


export function normalizeFirstRequestMode(value: unknown): FirstRequestMode {
  return value === 'inquiry_available' || value === 'quote_request_available'
    ? value
    : 'not_available_yet'
}

export function normalizePublicFirstRequestChannel(value: unknown): PublicFirstRequestChannel {
  return value === 'public_business_contact' || value === 'ae_status_only'
    ? value
    : 'not_available'
}


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


export type CatalogSourceState = {
  offerings: BusinessOfferingRecord[]
  revisions: BusinessOfferingRevisionRecord[]
  accessPaths: OfferingAccessPathRecord[]
}

export type CatalogPublishSourceState = CatalogSourceState & {
  operationKeys: OperationKeyRecord[]
  auditEvents: AuditEventContract[]
  registryProjectionAttempts: RegistryProjectionAttemptContract[]
  discoveryManifestAttempts: DiscoveryManifestAttemptContract[]
}

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
      catalog: PublicBusinessCatalogApiV2Dto
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
    offerings: [],
    revisions: [],
    accessPaths: [],
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
export function buildOfferingSupplyProjection(input: Readonly<{
  business: BusinessRecord
  context: BusinessContextRecord
  offerings: readonly BusinessOfferingRecord[]
  revisions: readonly BusinessOfferingRevisionRecord[]
  accessPaths: readonly OfferingAccessPathRecord[]
  indexStatus: IndexStatus
  discoveryStatus: DiscoveryStatus
  observedAt?: number
}>): BusinessSupplyProjection | undefined {
  if (input.business.publicStatus !== 'published') return undefined
  const publishedOfferings = input.offerings.filter((offering) => offering.status === 'published')
  if (publishedOfferings.length === 0) return undefined
  const sourceRevision = Math.max(
    input.business.updatedAt,
    ...publishedOfferings.map((offering) => offering.updatedAt),
    ...input.revisions.map((revision) => revision.createdAt),
  )
  const offeringInputs = publishedOfferings.flatMap((offering) => {
    const revision = input.revisions.find((candidate) => candidate.offeringRef === offering.offeringRef && candidate.revision === offering.currentRevision)
    if (revision === undefined) return []
    return [{
      offering,
      revision,
      accessPaths: input.accessPaths.filter((path) => path.offeringRef === offering.offeringRef && path.status === 'published'),
      support: { integrated: false, routeable: false, reasons: ['not_integrated'] as const },
    }]
  })
  if (offeringInputs.length === 0) return undefined
  const result = buildBusinessSupplyProjection({
    business: {
      businessId: input.business.businessId,
      slug: input.business.slug,
      name: input.business.name,
      category: input.context.category,
      suburb: input.context.suburb,
      stateTerritory: input.context.stateTerritory,
      ...(input.business.publishedPhone === undefined ? {} : { publishedPhone: input.business.publishedPhone }),
      ...(input.context.postcode === undefined ? {} : { postcode: input.context.postcode }),
      publicUrl: `/${input.business.slug}`,
      trustTier: input.business.trustTier,
      ...(input.context.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: input.context.responseTimeMinutes }),
      photos: input.context.photos ?? [],
    },
    businessIsPublic: true,
    offerings: offeringInputs,
    sourceRevision,
    observedAt: input.observedAt ?? sourceRevision,
    disposition:
      input.indexStatus === 'failed'
      || input.indexStatus === 'stale'
      || input.discoveryStatus === 'stale'
        ? 'stale'
        : input.discoveryStatus === 'degraded'
          ? 'partial'
          : 'current',
  })
  return result.kind === 'available' ? result.projection : undefined
}
