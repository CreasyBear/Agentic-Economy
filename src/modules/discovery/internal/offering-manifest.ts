import type { BusinessContext } from '@/modules/business/public'
import type { OfferingPrice } from '@/modules/catalog/public'
import type { ExactAmount } from '@/modules/money/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import type {
  PublicBusinessCatalogApiV2Dto,
  PublicOfferingAccessPathDto,
} from '@/modules/registry/public'

import { projectManifestCatalog, safePublicText } from './manifest-projection'

export const OfferingDiscoveryManifestSchemaVersion = 'ae-ucp:v2' as const

export type OfferingDiscoveryManifestContract = Readonly<{
  schemaVersion: typeof OfferingDiscoveryManifestSchemaVersion
  businessCatalogSchemaVersion: 'public-business-catalog-api:v2'
  businessId: string
  slug: string
  businessName: string
  category: string
  businessContext: BusinessContext
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
    price?: OfferingPrice
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
  const projection = projectManifestCatalog(business, (offering, projectedOffering) => ({
    ...projectedOffering,
    ...(projectedOffering.price === undefined ? {} : { price: safeManifestPrice(projectedOffering.price) }),
    accessPaths: projectManifestAccessPaths(offering.accessPaths),
    support: offering.support,
  }))
  const baseUrl = trimTrailingSlashes(input.canonicalBaseUrl)
  const publicUrl = `${baseUrl}/${encodeURIComponent(projection.slug)}`
  const body = {
    schemaVersion: OfferingDiscoveryManifestSchemaVersion,
    businessCatalogSchemaVersion: business.schemaVersion,
    businessId: projection.businessId,
    slug: projection.slug,
    businessName: projection.businessName,
    category: projection.category,
    businessContext: projection.businessContext,
    publicUrl,
    manifestUrl: `${publicUrl}/ucp`,
    disposition: business.disposition,
    observedAt: business.observedAt,
    generatedAt: input.now,
    offerings: projection.offerings,
  }

  return {
    kind: 'available',
    manifest: {
      ...body,
      generatedHash: canonicalDigest(body),
    },
  }
}

const PUBLIC_PHONE_CHANNEL_DISCLOSURE = 'Call the published number on the listing.'
const PUBLIC_WEBSITE_CHANNEL_DISCLOSURE = 'Use the published website on the listing.'

function projectManifestAccessPaths(
  paths: readonly PublicOfferingAccessPathDto[],
): readonly PublicOfferingAccessPathDto[] {
  return paths.flatMap((path): readonly PublicOfferingAccessPathDto[] => {
    if (path.kind !== 'human_request') return [sanitizeAccessPath(path)]
    return [sanitizeAccessPath({
      ...path,
      disclosure: path.channel === 'phone'
        ? PUBLIC_PHONE_CHANNEL_DISCLOSURE
        : PUBLIC_WEBSITE_CHANNEL_DISCLOSURE,
    })]
  })
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

/**
 * Sanitize the only free-text money fields while reconstructing each
 * discriminated price variant. Conditional spreads keep optional `unit`
 * omitted under `exactOptionalPropertyTypes`.
 */
function safeManifestPrice(price: OfferingPrice): OfferingPrice {
  switch (price.kind) {
    case 'quote_only':
      return {
        kind: price.kind,
        currency: safePublicText(price.currency),
        taxTreatment: price.taxTreatment,
        ...(price.unit === undefined ? {} : { unit: price.unit }),
      }
    case 'fixed':
    case 'from':
      return {
        kind: price.kind,
        amount: safeManifestAmount(price.amount),
        taxTreatment: price.taxTreatment,
        ...(price.unit === undefined ? {} : { unit: price.unit }),
      }
    case 'range':
      return {
        kind: price.kind,
        minimum: safeManifestAmount(price.minimum),
        maximum: safeManifestAmount(price.maximum),
        taxTreatment: price.taxTreatment,
        ...(price.unit === undefined ? {} : { unit: price.unit }),
      }
  }
}

function safeManifestAmount(amount: ExactAmount): ExactAmount {
  return {
    currency: safePublicText(amount.currency),
    units: amount.units,
    exponent: amount.exponent,
  }
}
