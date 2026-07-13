import {
  plainAvailabilityLabel,
  plainHoursLabel,
  plainNextStepLabel,
  plainTrustLabel,
  plainResponseTimeLabel,
  plainFreshnessLabel,
  formatProviderTrustCue,
} from '@/lib/ui/status-presentation'
import type { PublicBusinessCatalogApiDto } from '@/modules/registry/public'
import type { DiscoveryStatus } from '@/modules/discovery/public'
import type { FirstRequestMode } from '@/modules/catalog/public'
import type { TrustTier } from '@/modules/business/public'

import { buildDetailUrl } from '../answer-synthesizer'

/**
 * Single owner of the public catalog DTO → AnswerSource mapping.
 *
 * The registry AE action returns the raw `PublicBusinessCatalogApiPage` /
 * detail DTO subset. Answer-side callers (the TanStack answer tool and the
 * evidence assembler) map those DTOs into citation-bearing `AnswerSource`
 * records through this one function, so the mapping is not duplicated.
 *
 * The return shape is inferred (mutable `services`) so it satisfies both the
 * TanStack tool output schema and the evidence assembler's `readonly AnswerSource[]`.
 */
export function toAnswerSource(
  dto: PublicBusinessCatalogApiDto,
  citationIndex: number,
) {
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
    availabilityLabel: plainAvailabilityLabel({
      discoveryStatus,
      firstRequestMode,
    }),
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
