import {
  plainAvailabilityLabel,
  plainHoursLabel,
  plainNextStepLabel,
  plainTrustLabel,
  plainResponseTimeLabel,
  plainFreshnessLabel,
  formatProviderTrustCue,
} from '@/lib/ui/status-presentation'
import type {
  PublicBusinessCatalogApiV2Dto,
  PublicOfferingDto,
} from '@/modules/registry/public'

import { buildDetailUrl } from '../answer-synthesizer'

/**
 * Single owner of the public Offering catalog DTO → AnswerSource mapping.
 *
 * The input is {@link PublicBusinessCatalogApiV2Dto}, the only public registry
 * projection. Answer-side callers (the TanStack answer tool and the evidence
 * assembler) map those DTOs into citation-bearing `AnswerSource` records through
 * this one function, so the mapping is not duplicated.
 *
 * V2 carries no `discoveryStatus` and no `firstRequest.mode`. Both the
 * availability pill and the next step are derived from published `human_request`
 * access paths instead — the same fact V1 encoded as a first-request mode. V2
 * also carries `pricingSummary` and `availabilitySummary`, which V1 could not
 * express at all; both are passed through verbatim, never reworded.
 *
 * The return shape is inferred (mutable `services`) so it satisfies both the
 * TanStack tool output schema and the evidence assembler's `readonly AnswerSource[]`.
 */
export function toAnswerSource(
  dto: PublicBusinessCatalogApiV2Dto,
  citationIndex: number,
) {
  // V1 `firstRequest.mode === 'inquiry_available'` ⟷ an AE-inquiry human request
  // path. Any other human request path (phone / website) is still a published
  // first-contact route, just not one AE hosts.
  const hasAeInquiryPath = dto.offerings.some((offering) =>
    offering.accessPaths.some(
      (path) => path.kind === 'human_request' && path.channel === 'ae_inquiry',
    ),
  )
  const firstRequestMode = dto.accessSummary.humanRequest
    ? 'inquiry_available'
    : 'not_available_yet'

  const trustLabel = plainTrustLabel(dto.trustTier)
  const primaryPhoto = dto.photos[0]
  const serviceArea = firstPublished(dto.offerings, (offering) => offering.serviceAreaSummary)
  const pricingSummary = firstPublished(dto.offerings, (offering) => offering.pricingSummary)
  const availabilitySummary = firstPublished(dto.offerings, (offering) =>
    realAvailability(offering.availabilitySummary),
  )

  return {
    citationIndex,
    slug: dto.slug,
    name: dto.name,
    category: dto.category,
    suburb: dto.suburb,
    stateTerritory: dto.stateTerritory,
    serviceArea: serviceArea ?? '',
    hoursLabel: plainHoursLabel(availabilitySummary ?? dto.offerings[0]?.availabilitySummary),
    availabilityLabel: plainAvailabilityLabel({
      // V2 publishes no discovery status. `available` is the pass-through branch
      // of the helper, so the label stays fully determined by the access paths.
      discoveryStatus: 'available',
      firstRequestMode,
    }),
    trustLabel,
    responseTimeLabel: plainResponseTimeLabel(dto.responseTimeMinutes),
    trustCue: formatProviderTrustCue({
      trustLabel,
      ...(dto.responseTimeMinutes === undefined
        ? {}
        : { responseTimeMinutes: dto.responseTimeMinutes }),
    }),
    ...(primaryPhoto === undefined ? {} : { photoUrl: primaryPhoto.url }),
    ...(dto.publishedPhone === undefined ? {} : { publishedPhone: dto.publishedPhone }),
    ...(pricingSummary === undefined ? {} : { pricingSummary }),
    ...(availabilitySummary === undefined ? {} : { availabilitySummary }),
    freshnessLabel: plainFreshnessLabel(dto.observedAt),
    nextStepLabel: hasAeInquiryPath ? 'Send inquiry' : plainNextStepLabel(firstRequestMode),
    detailUrl: buildDetailUrl(dto.slug),
    ...(hasAeInquiryPath ? { inquiryUrl: `/${dto.slug}/inquiry` } : {}),
    services: dto.offerings.map((offering) => {
      const offeringAvailability = realAvailability(offering.availabilitySummary)
      const offeringPricing = offering.pricingSummary?.trim()
      return {
        name: offering.name,
        category: offering.category,
        summary: offering.summary,
        ...(offeringPricing === undefined || offeringPricing.length === 0
          ? {}
          : { pricingSummary: offeringPricing }),
        ...(offeringAvailability === undefined
          ? {}
          : { availabilitySummary: offeringAvailability }),
      }
    }),
  }
}

/** First offering that actually publishes the fact, trimmed. */
function firstPublished(
  offerings: readonly PublicOfferingDto[],
  pick: (offering: PublicOfferingDto) => string | undefined,
): string | undefined {
  for (const offering of offerings) {
    const value = pick(offering)?.trim()
    if (value !== undefined && value.length > 0) {
      return value
    }
  }
  return undefined
}

/**
 * Real published availability, or `undefined` for the seeded placeholder strings
 * ("Hours supplied by owner" and friends). `plainHoursLabel` already owns that
 * placeholder list: it echoes a real string and replaces a placeholder with
 * "Check hours", so an unchanged echo is the test for a real string.
 */
function realAvailability(availabilitySummary: string | undefined): string | undefined {
  const trimmed = availabilitySummary?.trim()
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined
  }
  return plainHoursLabel(trimmed) === trimmed ? trimmed : undefined
}
