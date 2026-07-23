import { stableHash } from '@/modules/common/stable-hash'
import type {
  PublicBusinessCatalogApiV2Dto,
  PublicOfferingAccessPathDto,
} from '@/modules/registry/public'

import { safePublicText } from './ucp-manifest'

export const OfferingDiscoveryManifestSchemaVersion = 'ae-ucp-fallback:v2' as const

export type OfferingDiscoveryManifestContract = Readonly<{
  schemaVersion: typeof OfferingDiscoveryManifestSchemaVersion
  businessCatalogSchemaVersion: 'public-business-catalog-api:v2'
  businessId: string
  slug: string
  businessName: string
  category: string
  location: Readonly<{ suburb: string; stateTerritory: string; postcode?: string }>
  publicUrl: string
  manifestUrl: string
  disposition: 'current' | 'partial' | 'stale'
  observedAt: number
  generatedAt: number
  generatedHash: string
  offerings: readonly Readonly<{
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
  }>[]
}>

export type BuildOfferingDiscoveryManifestResult =
  | Readonly<{ kind: 'available'; manifest: OfferingDiscoveryManifestContract }>
  | Readonly<{ kind: 'hidden'; reason: 'not_public' }>

export function buildOfferingDiscoveryManifest(input: Readonly<{
  business?: PublicBusinessCatalogApiV2Dto
  canonicalBaseUrl: string
  now: number
}>): BuildOfferingDiscoveryManifestResult {
  if (input.business === undefined) return { kind: 'hidden', reason: 'not_public' }

  const business = input.business
  const baseUrl = input.canonicalBaseUrl.replace(/\/+$/u, '')
  const publicUrl = `${baseUrl}/${encodeURIComponent(business.slug)}`
  const body = {
    schemaVersion: OfferingDiscoveryManifestSchemaVersion,
    businessCatalogSchemaVersion: business.schemaVersion,
    businessId: business.businessId,
    slug: business.slug,
    businessName: safePublicText(business.name),
    category: safePublicText(business.category),
    location: {
      suburb: safePublicText(business.suburb),
      stateTerritory: safePublicText(business.stateTerritory),
      ...(business.postcode === undefined ? {} : { postcode: safePublicText(business.postcode) }),
    },
    publicUrl,
    manifestUrl: `${publicUrl}/ucp`,
    disposition: business.disposition,
    observedAt: business.observedAt,
    generatedAt: input.now,
    offerings: business.offerings.map((offering) => ({
      offeringRef: offering.offeringRef,
      revision: offering.revision,
      name: safePublicText(offering.name),
      category: safePublicText(offering.category),
      summary: safePublicText(offering.summary),
      ...(offering.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: safePublicText(offering.serviceAreaSummary) }),
      ...(offering.availabilitySummary === undefined ? {} : { availabilitySummary: safePublicText(offering.availabilitySummary) }),
      ...(offering.pricingSummary === undefined ? {} : { pricingSummary: safePublicText(offering.pricingSummary) }),
      accessPaths: offering.accessPaths.map(sanitizeAccessPath),
      support: offering.support,
    })),
  }

  return {
    kind: 'available',
    manifest: { ...body, generatedHash: stableHash(body) },
  }
}

function sanitizeAccessPath(path: PublicOfferingAccessPathDto): PublicOfferingAccessPathDto {
  return path.kind === 'human_request'
    ? {
        ...path,
        disclosure: safePublicText(path.disclosure),
      }
    : {
        ...path,
        name: safePublicText(path.name),
        summary: safePublicText(path.summary),
        ...(path.authenticationSummary === undefined ? {} : { authenticationSummary: safePublicText(path.authenticationSummary) }),
        ...(path.pricingSummary === undefined ? {} : { pricingSummary: safePublicText(path.pricingSummary) }),
      }
}
