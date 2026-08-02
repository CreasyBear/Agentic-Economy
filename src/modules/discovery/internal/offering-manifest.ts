import type { OfferingPrice } from '@/modules/catalog/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import {
  PUBLIC_PHONE_CHANNEL_DISCLOSURE,
  PUBLIC_WEBSITE_CHANNEL_DISCLOSURE,
} from '@/modules/inquiries/public-copy'
import type {
  PublicBusinessCatalogApiV2Dto,
  PublicOfferingAccessPathDto,
} from '@/modules/registry/public'
import type { BusinessToolDescriptor } from '@/modules/business-tools/public'

import { projectManifestCatalog, safePublicText } from './manifest-projection'

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
    price?: OfferingPrice
    accessPaths: readonly PublicOfferingAccessPathDto[]
    support: Readonly<{
      integrated: boolean
      aeSupportedAction: boolean
      observedAt?: number
      validUntil?: number
    }>
  }>[]
  /**
   * What an agent may do with this business, not merely what it is. Present
   * and non-empty only when the underlying route would accept the call.
   */
  tools: readonly BusinessToolDescriptor[]
}>

export type BuildOfferingDiscoveryManifestResult =
  | Readonly<{ kind: 'available'; manifest: OfferingDiscoveryManifestContract }>
  | Readonly<{ kind: 'hidden'; reason: 'not_public' }>

export function buildOfferingDiscoveryManifest(input: Readonly<{
  business?: PublicBusinessCatalogApiV2Dto
  canonicalBaseUrl: string
  now: number
  /**
   * Whether the inquiry route would actually accept a first contact for this
   * business. The human page already withdraws first-contact copy when it
   * would not (`projectPublicInquiryAvailability`); the machine manifest was
   * bypassing that projection and telling agents to "use the inquiry form"
   * for businesses the route refuses. Absent means unknown, treated as not
   * admitted, because inviting a refused send is the worse failure.
   */
  inquiryAdmitted?: boolean
  /**
   * Built by the caller so this stays a pure projection; the descriptor
   * builder reaches into the action registry, which does not belong in a
   * discovery document builder.
   */
  tools?: readonly BusinessToolDescriptor[]
}>): BuildOfferingDiscoveryManifestResult {
  if (input.business === undefined) return { kind: 'hidden', reason: 'not_public' }

  const business = input.business
  const inquiryAdmitted = input.inquiryAdmitted === true
  const projection = projectManifestCatalog(business, (offering, projectedOffering) => ({
    ...projectedOffering,
    ...(projectedOffering.price === undefined ? {} : { price: safeManifestPrice(projectedOffering.price) }),
    accessPaths: projectManifestAccessPaths(offering.accessPaths, inquiryAdmitted),
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
    location: projection.location,
    publicUrl,
    manifestUrl: `${publicUrl}/ucp`,
    disposition: business.disposition,
    observedAt: business.observedAt,
    generatedAt: input.now,
    offerings: projection.offerings,
  }

  // `generatedHash` identifies the business projection. Tool descriptors are
  // derived from action code rather than source data, so hashing them would
  // churn the business fingerprint on unrelated releases.
  return {
    kind: 'available',
    manifest: {
      ...body,
      generatedHash: canonicalDigest(body),
      tools: inquiryAdmitted ? (input.tools ?? []) : [],
    },
  }
}

/**
 * Mirrors `projectPublicInquiryOfferingSupply` for the machine manifest. When
 * the inquiry route would refuse, the AE inquiry path is withdrawn rather than
 * advertised without a working destination, and the remaining human channels
 * are described by their own channel instead of stored first-contact copy that
 * points at a form the send would be rejected by.
 */
function projectManifestAccessPaths(
  paths: readonly PublicOfferingAccessPathDto[],
  inquiryAdmitted: boolean,
): readonly PublicOfferingAccessPathDto[] {
  if (inquiryAdmitted) return paths.map(sanitizeAccessPath)
  return paths.flatMap((path): readonly PublicOfferingAccessPathDto[] => {
    if (path.kind !== 'human_request') return [sanitizeAccessPath(path)]
    if (path.channel === 'ae_inquiry') return []
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
 * Every field but `currency` is a bounded enum or an integer, so the only place
 * an unpublished control character could ride into the manifest is the currency
 * code. It gets the same treatment as the neighbouring prose fields.
 */
function safeManifestPrice(price: OfferingPrice): OfferingPrice {
  return { ...price, currency: safePublicText(price.currency) }
}
