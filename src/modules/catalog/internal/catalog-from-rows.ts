import type {
  BusinessContextRecord,
  BusinessRecord,
} from '@/modules/business/public'
import type { BusinessId, ServiceId, Slug, SourceHash } from '@/modules/common/ids'

import {
  buildPublicCatalogDto,
  type BuildPublicCatalogInput,
  type BusinessServiceRecord,
  type CapabilityKind,
  type PublicCatalogContract,
  type PublicFirstRequestDisclosure,
  type ServiceCapabilityRecord,
  type ServiceCapabilityStatus,
} from './catalog-model'
import type { DiscoveryStatus } from '@/modules/discovery/public'
import type { IndexStatus } from '@/modules/registry/public'

/** Loose row bag shared by Convex registry + discovery hosts. */
export type CatalogFromRowsInput = Readonly<{
  businessId: string
  slug: string
  name: string
  category: string
  suburb: string
  stateTerritory: string
  sourceHash: string
  updatedAt: number
  trustTier: BusinessRecord['trustTier']
  indexStatus: IndexStatus
  discoveryStatus: DiscoveryStatus
  publishedPhone?: string
  postcode?: string
  photos?: readonly Readonly<{ url: string; alt: string }>[]
  responseTimeMinutes?: number
  services: readonly CatalogFromRowsService[]
  capabilities: readonly CatalogFromRowsCapability[]
}>

export type CatalogFromRowsService = Readonly<{
  serviceId: string
  serviceSlug: string
  name: string
  category: string
  summary: string
  serviceArea: string
  hoursOrUnknown: string
  sortOrder: number
  sourceHash: string
  status?: 'draft' | 'published' | 'suppressed'
  createdAt?: number
  updatedAt?: number
}>

export type CatalogFromRowsCapability = Readonly<{
  serviceId: string
  kind: string
  status: string
  firstRequest: Readonly<{
    mode: PublicFirstRequestDisclosure['mode']
    publicDisclosure: string
    publicChannel: PublicFirstRequestDisclosure['publicChannel']
    noContactReason?: string
  }>
  reason?: string
  sourceHash: string
  createdAt?: number
  updatedAt?: number
}>

export type RegistryCatalogApiItem = Readonly<{
  businessId: string
  slug: string
  name: string
  category: string
  suburb: string
  stateTerritory: string
  publishedPhone?: string
  postcode?: string
  publicUrl: string
  trustTier: PublicCatalogContract['trustTier']
  publicStatus: 'published'
  indexStatus: IndexStatus
  discoveryStatus: DiscoveryStatus
  schemaVersion: 'public-business-catalog-api:v1'
  updatedAt: number
  photos: readonly Readonly<{ url: string; alt: string }>[]
  responseTimeMinutes?: number
  services: readonly Readonly<{
    slug: string
    name: string
    category: string
    summary: string
    serviceArea: string
    hoursOrUnknown: string
    firstRequest: Readonly<{
      mode: PublicFirstRequestDisclosure['mode']
      publicDisclosure: string
      publicChannel: PublicFirstRequestDisclosure['publicChannel']
      noContactReason?: string
    }>
    status: 'published'
    capabilities: readonly Readonly<{ kind: string; status: string }>[]
  }>[]
}>

export type DiscoveryPublicCatalogProjection = Readonly<{
  businessId: string
  slug: string
  name: string
  category: string
  suburb: string
  stateTerritory: string
  postcode?: string
  publicStatus: 'published'
  trustTier: PublicCatalogContract['trustTier']
  indexStatus: IndexStatus
  discoveryStatus: DiscoveryStatus
  services: readonly Readonly<{
    serviceId: string
    serviceSlug: string
    name: string
    category: string
    summary: string
    serviceArea: string
    hoursOrUnknown: string
    firstRequest: Readonly<{
      mode: PublicFirstRequestDisclosure['mode']
      publicDisclosure: string
      publicChannel: PublicFirstRequestDisclosure['publicChannel']
      noContactReason?: string
    }>
    capabilities: readonly Readonly<{
      kind: string
      status: string
      firstRequest: Readonly<{
        mode: PublicFirstRequestDisclosure['mode']
        publicDisclosure: string
        publicChannel: PublicFirstRequestDisclosure['publicChannel']
        noContactReason?: string
      }>
      callable: boolean
      paymentRequired: boolean
      reason?: string
    }>[]
    sourceHash: string
  }>[]
  sourceHash: string
  updatedAt: number
}>

/**
 * One catalog-from-rows adapter for registry + discovery hosts.
 * Prefers buildPublicCatalogDto; does not own search ranking or UCP manifests.
 */
export function catalogFromRows(input: CatalogFromRowsInput): PublicCatalogContract | undefined {
  const result = buildPublicCatalogDto(toBuildPublicCatalogInput(input))
  return result.kind === 'available' ? result.catalog : undefined
}

export function projectRegistryCatalogApiItem(
  catalog: PublicCatalogContract,
): RegistryCatalogApiItem {
  return {
    businessId: catalog.businessId,
    slug: catalog.slug,
    name: catalog.name,
    category: catalog.category,
    suburb: catalog.suburb,
    stateTerritory: catalog.stateTerritory,
    ...(catalog.publishedPhone === undefined ? {} : { publishedPhone: catalog.publishedPhone }),
    ...(catalog.postcode === undefined ? {} : { postcode: catalog.postcode }),
    publicUrl: catalog.publicUrl,
    trustTier: catalog.trustTier,
    publicStatus: 'published',
    indexStatus: catalog.indexStatus,
    discoveryStatus: catalog.discoveryStatus,
    schemaVersion: 'public-business-catalog-api:v1',
    updatedAt: catalog.updatedAt,
    photos: catalog.photos.map((photo) => ({ url: photo.url, alt: photo.alt })),
    ...(catalog.responseTimeMinutes === undefined
      ? {}
      : { responseTimeMinutes: catalog.responseTimeMinutes }),
    services: catalog.services.map((service) => ({
      slug: service.serviceSlug,
      name: service.name,
      category: service.category,
      summary: service.summary,
      serviceArea: service.serviceArea,
      hoursOrUnknown: service.hoursOrUnknown,
      firstRequest: projectFirstRequest(service.firstRequest),
      status: 'published' as const,
      capabilities: service.capabilities.map((capability) => ({
        kind: capability.kind,
        status: capability.status,
      })),
    })),
  }
}

export function projectDiscoveryPublicCatalog(
  catalog: PublicCatalogContract,
): DiscoveryPublicCatalogProjection {
  return {
    businessId: catalog.businessId,
    slug: catalog.slug,
    name: catalog.name,
    category: catalog.category,
    suburb: catalog.suburb,
    stateTerritory: catalog.stateTerritory,
    ...(catalog.postcode === undefined ? {} : { postcode: catalog.postcode }),
    publicStatus: 'published',
    trustTier: catalog.trustTier,
    indexStatus: catalog.indexStatus,
    discoveryStatus: catalog.discoveryStatus,
    services: catalog.services.map((service) => ({
      serviceId: service.serviceId,
      serviceSlug: service.serviceSlug,
      name: service.name,
      category: service.category,
      summary: service.summary,
      serviceArea: service.serviceArea,
      hoursOrUnknown: service.hoursOrUnknown,
      firstRequest: projectFirstRequest(service.firstRequest),
      capabilities: service.capabilities.map((capability) => ({
        kind: capability.kind,
        status: capability.status,
        firstRequest: projectFirstRequest(capability.firstRequest),
        callable: false as const,
        paymentRequired: false as const,
        ...(capability.reason === undefined ? {} : { reason: capability.reason }),
      })),
      sourceHash: service.sourceHash,
    })),
    sourceHash: catalog.sourceHash,
    updatedAt: catalog.updatedAt,
  }
}

function projectFirstRequest(firstRequest: PublicFirstRequestDisclosure) {
  return {
    mode: firstRequest.mode,
    publicDisclosure: firstRequest.publicDisclosure,
    publicChannel: firstRequest.publicChannel,
    ...(firstRequest.noContactReason === undefined
      ? {}
      : { noContactReason: firstRequest.noContactReason }),
  }
}

function toBuildPublicCatalogInput(input: CatalogFromRowsInput): BuildPublicCatalogInput {
  const capabilities = ensureServiceFirstRequestCapabilities(input)
  const business = {
    businessId: input.businessId as BusinessId,
    ownerId: input.businessId as BusinessRecord['ownerId'],
    slug: input.slug as Slug,
    name: input.name,
    normalizedName: input.name.toLowerCase(),
    category: input.category,
    suburb: input.suburb,
    stateTerritory: input.stateTerritory,
    ...(input.publishedPhone === undefined ? {} : { publishedPhone: input.publishedPhone }),
    publicStatus: 'published' as const,
    trustTier: input.trustTier,
    claimStatus: 'published' as const,
    sourceHash: input.sourceHash as SourceHash,
    createdAt: input.updatedAt,
    updatedAt: input.updatedAt,
  } satisfies BusinessRecord

  const context = {
    businessId: input.businessId as BusinessId,
    category: input.category,
    suburb: input.suburb,
    stateTerritory: input.stateTerritory,
    ...(input.postcode === undefined ? {} : { postcode: input.postcode }),
    ...(input.photos === undefined ? {} : { photos: input.photos }),
    ...(input.responseTimeMinutes === undefined
      ? {}
      : { responseTimeMinutes: input.responseTimeMinutes }),
    sourceRefs: [],
    sourceHash: input.sourceHash as SourceHash,
    approvedAt: input.updatedAt,
  } satisfies BusinessContextRecord

  const services: BusinessServiceRecord[] = input.services.map((service) => ({
    serviceId: service.serviceId as ServiceId,
    serviceSlug: service.serviceSlug as Slug,
    businessId: input.businessId as BusinessId,
    name: service.name,
    category: service.category,
    summary: service.summary,
    serviceArea: service.serviceArea,
    hoursOrUnknown: service.hoursOrUnknown,
    status: service.status ?? 'published',
    sortOrder: service.sortOrder,
    sourceHash: service.sourceHash as SourceHash,
    createdAt: service.createdAt ?? input.updatedAt,
    updatedAt: service.updatedAt ?? input.updatedAt,
  }))

  const capabilityRecords: ServiceCapabilityRecord[] = capabilities.map((capability) => ({
    businessId: input.businessId as BusinessId,
    serviceId: capability.serviceId as ServiceId,
    kind: normalizeCapabilityKind(capability.kind),
    status: normalizeCapabilityStatus(capability.status),
    firstRequest: {
      mode: capability.firstRequest.mode,
      publicDisclosure: capability.firstRequest.publicDisclosure,
      publicChannel: capability.firstRequest.publicChannel,
      ...(capability.firstRequest.noContactReason === undefined
        ? {}
        : { noContactReason: capability.firstRequest.noContactReason }),
      rawContactExcluded: true as const,
    },
    callable: false as const,
    paymentRequired: false as const,
    ...(capability.reason === undefined ? {} : { reason: capability.reason }),
    sourceHash: capability.sourceHash as SourceHash,
    createdAt: capability.createdAt ?? input.updatedAt,
    updatedAt: capability.updatedAt ?? input.updatedAt,
  }))

  return {
    business,
    context,
    services,
    capabilities: capabilityRecords,
    indexStatus: input.indexStatus,
    discoveryStatus: input.discoveryStatus,
  }
}

function ensureServiceFirstRequestCapabilities(
  input: CatalogFromRowsInput,
): readonly CatalogFromRowsCapability[] {
  const capabilities = [...input.capabilities]
  for (const service of input.services) {
    if (capabilities.some((capability) => capability.serviceId === service.serviceId)) {
      continue
    }
    capabilities.push({
      serviceId: service.serviceId,
      kind: 'ae_hosted_discovery',
      status: 'unavailable',
      firstRequest: {
        mode: 'not_available_yet',
        publicDisclosure: 'This business has not published a request path.',
        publicChannel: 'not_available',
        noContactReason: 'Owner has not supplied public contact instructions.',
      },
      reason: 'Owner has not supplied public contact instructions.',
      sourceHash: service.sourceHash,
    })
  }
  return capabilities
}

function normalizeCapabilityKind(value: string): CapabilityKind {
  if (
    value === 'phone_inquiry'
    || value === 'quote_request'
    || value === 'emergency_callout_interest'
    || value === 'ae_hosted_discovery'
  ) {
    return value
  }
  // Preserve legacy Convex wire kind without widening the typed catalog union.
  if (value === 'booking_interest') {
    return value as CapabilityKind
  }
  return 'ae_hosted_discovery'
}

function normalizeCapabilityStatus(value: string): ServiceCapabilityStatus {
  if (value === 'available' || value === 'degraded' || value === 'stale' || value === 'unavailable') {
    return value
  }
  return 'unavailable'
}
