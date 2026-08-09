import { validateOfferingAccessPath } from '@/modules/catalog/public'
import type {
  BusinessSupplyProjection,
  OfferingAccessPathValidation,
  OfferingPrice,
  PublicAccessPath,
} from '@/modules/catalog/public'

import { normalizeTrustTier } from '@/modules/business/public'

// Stays v2 across the `price` addition: an optional field a consumer can ignore
// is not worth forcing every pinned reader to re-pin for.
export const PublicBusinessCatalogApiSchemaVersion = 'public-business-catalog-api:v2' as const

export type PublicOfferingAccessPathDto =
  | Readonly<{
      accessPathRef: string
      offeringRevision: number
      kind: 'human_request'
      channel: 'phone' | 'website' | 'ae_inquiry'
      disclosure: string
      url?: string
    }>
  | Readonly<{
      accessPathRef: string
      offeringRevision: number
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
  /** The comparable form of the same fact. Never derived from `pricingSummary`. */
  price?: OfferingPrice
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
  trustTier: BusinessSupplyProjection['business']['trustTier']
  responseTimeMinutes?: number
  photos: readonly Readonly<{ url: string; alt: string }>[]
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
  page: readonly PublicBusinessCatalogApiV2Dto[]
  isDone: boolean
  continueCursor: string
}>

export type PublicBusinessCatalogApiV2SearchPage = Readonly<{
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
  /**
   * The legacy expansion cannot see the business profile, so it derives a
   * `phone` channel from the service's public-contact flag alone. When the
   * profile publishes no number there is nothing to dial, and a rendered
   * "Call" affordance is a way to get started that does not exist. The v1
   * adapter below already applies this rule; both projections owe the same one.
   */
  const dialable = (projection.business.publishedPhone ?? '').trim().length > 0
  const offerings = projection.offerings.map((item): PublicOfferingDto => {
    const accessPaths = sanitizeAccessPaths(item.accessPaths)
    return {
      offeringRef: item.offering.offeringRef,
      revision: item.offering.revision,
      name: item.offering.name,
      category: item.offering.category,
      summary: item.offering.summary,
      ...(item.offering.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: item.offering.serviceAreaSummary }),
      ...spreadAvailability(item.offering.availabilitySummary),
      ...(item.offering.pricingSummary === undefined ? {} : { pricingSummary: item.offering.pricingSummary }),
      ...(item.offering.price === undefined ? {} : { price: item.offering.price }),
      accessPaths: accessPaths.reduce<PublicOfferingAccessPathDto[]>((acc, path) => {
        if (dialable || path.descriptor.kind !== 'human_request' || path.descriptor.channel !== 'phone') acc.push(projectAccessPath(path))
        return acc
      }, []),
      support: {
        integrated: item.support.integrated,
        aeSupportedAction: item.support.routeable
          && item.support.validUntil !== undefined
          && item.support.validUntil > now,
        ...(item.support.observedAt === undefined ? {} : { observedAt: item.support.observedAt }),
        ...(item.support.validUntil === undefined ? {} : { validUntil: item.support.validUntil }),
      },
    }
  })
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
    trustTier: normalizeTrustTier(projection.business.trustTier),
    ...(projection.business.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: projection.business.responseTimeMinutes }),
    photos: normalizePhotos(projection.business.photos),
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

/**
 * The retained v1 service model requires a non-empty `hoursOrUnknown`, so
 * "this business has not published hours" could only ever be spelled as one of
 * a handful of sentinel strings. Passing those through as `availabilitySummary`
 * makes every consumer — the business page, the answer thread, an agent reading
 * /api/businesses — render a placeholder as a published fact. The public
 * boundary drops them instead: an unpublished fact is absent, never named.
 *
 * Kept local rather than shared with `@/lib/ui/status-presentation`, which owns
 * the same list for display purposes: that module is UI copy and pulls the
 * registry types back in, and this projection is bundled into Convex.
 */
const UNPUBLISHED_AVAILABILITY_SENTINELS: Readonly<Record<string, true>> = {
  'unknown': true,
  'hours unknown': true,
  'hours supplied by owner': true,
  'owner supplied hours': true,
  'owner confirmed hours are not listed yet': true,
  'after-hours availability supplied by owner': true,
}

function spreadAvailability(value: string | undefined): { availabilitySummary?: string } {
  const trimmed = value?.trim() ?? ''
  return trimmed.length === 0 || UNPUBLISHED_AVAILABILITY_SENTINELS[trimmed.toLowerCase()] === true
    ? {}
    : { availabilitySummary: trimmed }
}

/**
 * Supply snapshots are stored as JSON and are read back by code that may be
 * newer than the row. A snapshot written before the business profile carried
 * `trustTier` / `photos` still has to project into a valid public DTO, so the
 * boundary defaults them instead of trusting the compile-time shape of a
 * value that came off disk.
 */

function normalizePhotos(value: unknown): readonly Readonly<{ url: string; alt: string }>[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const url = 'url' in entry ? entry.url : undefined
    const alt = 'alt' in entry ? entry.alt : undefined
    return typeof url === 'string' && typeof alt === 'string' ? [{ url, alt }] : []
  })
}
function sanitizeAccessPaths(value: unknown): PublicAccessPath[] {
  if (!Array.isArray(value)) return []
  const byRef = new Map<string, { path: PublicAccessPath; fingerprint: string } | null>()

  for (const valuePath of value) {
    if (typeof valuePath !== 'object' || valuePath === null) continue
    const accessPathRef = 'accessPathRef' in valuePath ? valuePath.accessPathRef : undefined
    const offeringRevision = 'offeringRevision' in valuePath ? valuePath.offeringRevision : undefined
    const offeringSourceHash = 'offeringSourceHash' in valuePath ? valuePath.offeringSourceHash : undefined
    const sourceHash = 'sourceHash' in valuePath ? valuePath.sourceHash : undefined
    const descriptor = 'descriptor' in valuePath ? valuePath.descriptor : undefined
    if (
      typeof offeringRevision !== 'number'
      || !Number.isSafeInteger(offeringRevision)
      || offeringRevision < 0
      || typeof offeringSourceHash !== 'string'
      || offeringSourceHash.trim().length === 0
      || typeof sourceHash !== 'string'
      || sourceHash.trim().length === 0
      || typeof descriptor !== 'object'
      || !('kind' in descriptor)
      || descriptor.kind !== 'human_request' && descriptor.kind !== 'external_operation'
    ) continue

    const descriptorInput = descriptor as PublicAccessPath['descriptor']
    if (
      descriptorInput.kind === 'external_operation'
      && descriptorInput.provenance !== 'business_declared'
      && descriptorInput.provenance !== 'publicly_observed'
    ) continue
    let validation: OfferingAccessPathValidation
    try {
      validation = validateOfferingAccessPath(descriptorInput)
    } catch {
      continue
    }
    if (validation.kind !== 'valid') continue

    const path: PublicAccessPath = {
      accessPathRef: accessPathRef.trim() as PublicAccessPath['accessPathRef'],
      offeringRevision,
      offeringSourceHash: offeringSourceHash.trim() as PublicAccessPath['offeringSourceHash'],
      sourceHash: sourceHash.trim() as PublicAccessPath['sourceHash'],
      descriptor: validation.descriptor,
    }
    const fingerprint = JSON.stringify([
      path.accessPathRef,
      path.offeringRevision,
      path.offeringSourceHash,
      path.sourceHash,
      path.descriptor,
    ])
    const existing = byRef.get(path.accessPathRef)
    if (existing === undefined) byRef.set(path.accessPathRef, { path, fingerprint })
    else if (existing !== null && existing.fingerprint !== fingerprint) byRef.set(path.accessPathRef, null)
  }

  return [...byRef.values()].flatMap((entry) => entry === null ? [] : [entry.path])
}





function projectAccessPath(path: PublicAccessPath): PublicOfferingAccessPathDto {
  return path.descriptor.kind === 'human_request'
    ? {
        accessPathRef: path.accessPathRef,
        offeringRevision: path.offeringRevision,
        kind: 'human_request',
        channel: path.descriptor.channel,
        disclosure: path.descriptor.disclosure,
        ...(path.descriptor.url === undefined ? {} : { url: path.descriptor.url }),
      }
    : {
        accessPathRef: path.accessPathRef,
        offeringRevision: path.offeringRevision,
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
