import {
  formatProviderTrustCue,
  plainAvailabilityLabel,
  plainFreshnessLabel,
  plainHoursLabel,
  plainNextStepLabel,
  plainResponseTimeLabel,
  plainTrustLabel,
} from '@/lib/ui/status-presentation'
import type { DiscoveryStatus } from '@/modules/discovery/public'
import type { FirstRequestMode } from '@/modules/catalog/public'
import type { TrustTier } from '@/modules/business/public'
import type {
  PublicBusinessCatalogApiDto,
  PublicBusinessCatalogApiV2Dto,
} from '@/modules/registry/public'

import {
  buildDetailUrl,
  type AnswerSource,
  type OfferingAnswerSource,
} from '../answer-synthesizer'

/**
 * @offering-consumer-disposition split_legacy_v1_and_offering_v2
 *
 * The two branches are deliberately different contracts. Offering-v2 stays a
 * native, exact-revision source. Only an explicit catalogue-v1 input may enter
 * the legacy service/trust/contact projection still consumed by older Answer
 * artifacts.
 */
export function toAnswerSource(
  dto: PublicBusinessCatalogApiV2Dto,
  citationIndex: number,
): OfferingAnswerSource
export function toAnswerSource(
  dto: PublicBusinessCatalogApiDto,
  citationIndex: number,
): AnswerSource
export function toAnswerSource(
  dto: PublicBusinessCatalogApiDto | PublicBusinessCatalogApiV2Dto,
  citationIndex: number,
): AnswerSource | OfferingAnswerSource {
  return dto.schemaVersion === 'public-business-catalog-api:v2'
    ? toOfferingAnswerSource(dto, citationIndex)
    : toLegacyAnswerSource(dto, citationIndex)
}

function toOfferingAnswerSource(
  dto: PublicBusinessCatalogApiV2Dto,
  citationIndex: number,
): OfferingAnswerSource {
  return {
    sourceKind: 'offering_v2',
    citationIndex,
    business: {
      businessId: dto.businessId,
      slug: dto.slug,
      name: dto.name,
      category: dto.category,
      suburb: dto.suburb,
      stateTerritory: dto.stateTerritory,
      publicUrl: dto.publicUrl,
      observedAt: dto.observedAt,
      disposition: dto.disposition,
      accessSummary: dto.accessSummary,
    },
    offerings: dto.offerings,
    detailUrl: buildDetailUrl(dto.slug),
  }
}

function toLegacyAnswerSource(
  dto: PublicBusinessCatalogApiDto,
  citationIndex: number,
): AnswerSource {
  const primaryService = dto.services[0]
  const discoveryStatus = dto.discoveryStatus as DiscoveryStatus
  const firstRequestMode = (primaryService?.firstRequest.mode ??
    'not_available_yet') as FirstRequestMode
  const trustTier = dto.trustTier as TrustTier
  const trustLabel = plainTrustLabel(trustTier)
  const responseTimeLabel = plainResponseTimeLabel(dto.responseTimeMinutes)
  const primaryPhoto = dto.photos?.[0]

  return {
    citationIndex,
    slug: dto.slug,
    name: dto.name,
    category: dto.category,
    suburb: dto.suburb,
    stateTerritory: dto.stateTerritory,
    serviceArea:
      primaryService?.serviceArea ??
      dto.services.flatMap((service) => (service.serviceArea ? [service.serviceArea] : []))[0] ??
      '',
    hoursLabel: plainHoursLabel(primaryService?.hoursOrUnknown),
    availabilityLabel: plainAvailabilityLabel({ discoveryStatus, firstRequestMode }),
    trustLabel,
    responseTimeLabel,
    trustCue: formatProviderTrustCue({
      trustLabel,
      ...(dto.responseTimeMinutes === undefined
        ? {}
        : { responseTimeMinutes: dto.responseTimeMinutes }),
    }),
    ...(primaryPhoto === undefined ? {} : { photoUrl: primaryPhoto.url }),
    ...(dto.publishedPhone === undefined ? {} : { publishedPhone: dto.publishedPhone }),
    freshnessLabel: plainFreshnessLabel(dto.updatedAt),
    nextStepLabel:
      firstRequestMode === 'inquiry_available'
        ? 'Send inquiry'
        : plainNextStepLabel(firstRequestMode),
    detailUrl: buildDetailUrl(dto.slug),
    ...(firstRequestMode === 'inquiry_available'
      ? { inquiryUrl: `/${dto.slug}/inquiry` }
      : {}),
    services: dto.services.map((service) => ({
      name: service.name,
      category: service.category,
      summary: service.summary,
    })),
  }
}
