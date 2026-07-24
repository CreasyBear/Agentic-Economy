import type {
  BusinessSupplyProjection,
  PublicAccessPath,
} from '@/modules/catalog/public'

export const PublicBusinessCatalogApiSchemaVersion = 'public-business-catalog-api:v2' as const

export type PublicOfferingAccessPathDto =
  | Readonly<{
      accessPathRef: string
      kind: 'human_request'
      channel: 'phone' | 'website' | 'ae_inquiry'
      disclosure: string
      url?: string
    }>
  | Readonly<{
      accessPathRef: string
      kind: 'external_operation'
      name: string
      summary: string
      url: string
      method?: string
      documentationUrl?: string
      interfaceDescription?: Readonly<{ format: string; url?: string }>
      authenticationSummary?: string
      pricingSummary?: string
      provenance: 'business_declared' | 'publicly_observed'
    }>

export type PublicOfferingDto = Readonly<{
  offeringRef: string
  revision: number
  name: string
  category: string
  summary: string
  serviceAreaSummary?: string
  availabilitySummary?: string
  pricingSummary?: string
  accessPaths: readonly PublicOfferingAccessPathDto[]
  support: Readonly<{
    integrated: boolean
    aeSupportedAction: boolean
    observedAt?: number
    validUntil?: number
  }>
}>

export type PublicBusinessCatalogApiV2Dto = Readonly<{
  schemaVersion: typeof PublicBusinessCatalogApiSchemaVersion
  businessId: string
  slug: string
  name: string
  category: string
  suburb: string
  stateTerritory: string
  publishedPhone?: string
  postcode?: string
  publicUrl: string
  observedAt: number
  disposition: BusinessSupplyProjection['disposition']
  offerings: readonly PublicOfferingDto[]
  accessSummary: Readonly<{
    humanRequest: boolean
    externalOperation: boolean
    aeSupportedAction: boolean
  }>
}>

export type PublicBusinessCatalogApiV2Page = Readonly<{
  kind: 'ok'
  schemaVersion: typeof PublicBusinessCatalogApiSchemaVersion
  query?: string
  items: readonly PublicBusinessCatalogApiV2Dto[]
  pagination: Readonly<{
    cursor?: string
    nextCursor?: string
    limit: number
    total: number
    hasMore: boolean
  }>
}>

export type PublicBusinessCatalogV2DetailResult =
  | Readonly<{
      kind: 'found'
      schemaVersion: typeof PublicBusinessCatalogApiSchemaVersion
      business: PublicBusinessCatalogApiV2Dto
    }>
  | Readonly<{ kind: 'not_found'; code: 'business_not_found'; reason: string }>

/**
 * The only public registry projection for canonical Offering supply.
 * Source digests, lineage hashes, credentials, adapter configuration and
 * internal support reasons deliberately have no destination in this DTO.
 */
export function projectBusinessSupplyToPublicApi(
  projection: BusinessSupplyProjection,
  now = projection.observedAt,
): PublicBusinessCatalogApiV2Dto {
  const offerings = projection.offerings.map((item): PublicOfferingDto => ({
    offeringRef: item.offering.offeringRef,
    revision: item.offering.revision,
    name: item.offering.name,
    category: item.offering.category,
    summary: item.offering.summary,
    ...(item.offering.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: item.offering.serviceAreaSummary }),
    ...(item.offering.availabilitySummary === undefined ? {} : { availabilitySummary: item.offering.availabilitySummary }),
    ...(item.offering.pricingSummary === undefined ? {} : { pricingSummary: item.offering.pricingSummary }),
    accessPaths: item.accessPaths.map(projectAccessPath),
    support: {
      integrated: item.support.integrated,
      aeSupportedAction: item.support.routeable
        && item.support.validUntil !== undefined
        && item.support.validUntil > now,
      ...(item.support.observedAt === undefined ? {} : { observedAt: item.support.observedAt }),
      ...(item.support.validUntil === undefined ? {} : { validUntil: item.support.validUntil }),
    },
  }))
  const paths = offerings.flatMap((offering) => offering.accessPaths)

  return {
    schemaVersion: PublicBusinessCatalogApiSchemaVersion,
    businessId: projection.business.businessId,
    slug: projection.business.slug,
    name: projection.business.name,
    category: projection.business.category,
    suburb: projection.business.suburb,
    stateTerritory: projection.business.stateTerritory,
    ...(projection.business.publishedPhone === undefined ? {} : { publishedPhone: projection.business.publishedPhone }),
    ...(projection.business.postcode === undefined ? {} : { postcode: projection.business.postcode }),
    publicUrl: projection.business.publicUrl,
    observedAt: projection.observedAt,
    disposition: projection.disposition,
    offerings,
    accessSummary: {
      humanRequest: paths.some((path) => path.kind === 'human_request'),
      externalOperation: paths.some((path) => path.kind === 'external_operation'),
      aeSupportedAction: offerings.some((offering) => offering.support.aeSupportedAction),
    },
  }
}

export function summarizeOfferingAccess(dto: PublicBusinessCatalogApiV2Dto): Readonly<{
  offeringNames: readonly string[]
  access: PublicBusinessCatalogApiV2Dto['accessSummary']
}> {
  return {
    offeringNames: dto.offerings.slice(0, 2).map((offering) => offering.name),
    access: dto.accessSummary,
  }
}

/** Explicit migration adapter. Remove after every business is in Offering mode. */
export function adaptLegacyCatalogToOfferingApi(catalog: Readonly<{
  businessId?: string
  slug: string
  name: string
  category: string
  suburb: string
  stateTerritory: string
  publishedPhone?: string
  postcode?: string
  publicUrl: string
  updatedAt: number
  services: readonly Readonly<{
    slug: string
    name: string
    category: string
    summary: string
    serviceArea: string
    hoursOrUnknown: string
    firstRequest: Readonly<{
      mode: 'inquiry_available' | 'quote_request_available' | 'not_available_yet'
      publicDisclosure: string
      publicChannel: 'public_business_contact' | 'ae_status_only' | 'not_available'
    }>
  }>[]
}>): PublicBusinessCatalogApiV2Dto {
  const offerings: PublicOfferingDto[] = catalog.services.map((service) => {
    const hasRequestPath = service.firstRequest.mode !== 'not_available_yet'
    const accessPaths: PublicOfferingAccessPathDto[] = hasRequestPath
      ? [{
          accessPathRef: `legacy-access:${catalog.slug}:${service.slug}`,
          kind: 'human_request',
          channel: service.firstRequest.publicChannel === 'public_business_contact' && catalog.publishedPhone !== undefined
            ? 'phone'
            : 'ae_inquiry',
          disclosure: service.firstRequest.publicDisclosure,
        }]
      : []
    return {
      offeringRef: `legacy-offering:${catalog.slug}:${service.slug}`,
      revision: 1,
      name: service.name,
      category: service.category,
      summary: service.summary,
      serviceAreaSummary: service.serviceArea,
      availabilitySummary: service.hoursOrUnknown,
      accessPaths,
      support: { integrated: false, aeSupportedAction: false },
    }
  })
  const paths = offerings.flatMap((offering) => offering.accessPaths)
  return {
    schemaVersion: PublicBusinessCatalogApiSchemaVersion,
    businessId: catalog.businessId ?? `legacy-business:${catalog.slug}`,
    slug: catalog.slug,
    name: catalog.name,
    category: catalog.category,
    suburb: catalog.suburb,
    stateTerritory: catalog.stateTerritory,
    ...(catalog.publishedPhone === undefined ? {} : { publishedPhone: catalog.publishedPhone }),
    ...(catalog.postcode === undefined ? {} : { postcode: catalog.postcode }),
    publicUrl: catalog.publicUrl,
    observedAt: catalog.updatedAt,
    disposition: 'current',
    offerings,
    accessSummary: {
      humanRequest: paths.some((path) => path.kind === 'human_request'),
      externalOperation: false,
      aeSupportedAction: false,
    },
  }
}

function projectAccessPath(path: PublicAccessPath): PublicOfferingAccessPathDto {
  return path.descriptor.kind === 'human_request'
    ? {
        accessPathRef: path.accessPathRef,
        kind: 'human_request',
        channel: path.descriptor.channel,
        disclosure: path.descriptor.disclosure,
        ...(path.descriptor.url === undefined ? {} : { url: path.descriptor.url }),
      }
    : {
        accessPathRef: path.accessPathRef,
        kind: 'external_operation',
        name: path.descriptor.name,
        summary: path.descriptor.summary,
        url: path.descriptor.url,
        ...(path.descriptor.method === undefined ? {} : { method: path.descriptor.method }),
        ...(path.descriptor.documentationUrl === undefined ? {} : { documentationUrl: path.descriptor.documentationUrl }),
        ...(path.descriptor.interfaceDescription === undefined ? {} : { interfaceDescription: path.descriptor.interfaceDescription }),
        ...(path.descriptor.authenticationSummary === undefined ? {} : { authenticationSummary: path.descriptor.authenticationSummary }),
        ...(path.descriptor.pricingSummary === undefined ? {} : { pricingSummary: path.descriptor.pricingSummary }),
        provenance: path.descriptor.provenance,
      }
}
