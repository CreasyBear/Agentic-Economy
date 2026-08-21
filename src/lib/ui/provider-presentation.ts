import slugify from '@sindresorhus/slugify'

import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

import {
  categoryIllustrationPath,
  formatProviderTrustCue,
  plainHoursLabel,
  plainNextStepLabel,
  plainResponseTimeLabel,
  plainTrustLabel,
} from './status-presentation'

export type ProviderPresentationCatalog = PublicBusinessCatalogApiV2Dto
export type ProviderPresentationOffering = ProviderPresentationCatalog['offerings'][number]

export type ProviderOfferingChipPresentation = {
  key: string
  label: string
}

export type ProviderImagePresentation = {
  kind: 'photo' | 'illustration'
  url: string
  alt: string
}

export type ProviderPresentation = {
  locationLabel: string
  serviceArea: string
  availabilityLabel: string
  availabilitySlug: string
  responseLabel: string
  responseFallbackLabel: string
  trustCue: string
  nextStepLabel: string
  primaryOfferingName?: string
  primaryOfferingSummary?: string
  hoursLabel: string
  image: ProviderImagePresentation
  offeringChips: readonly ProviderOfferingChipPresentation[]
}

export type ProviderPresentationOptions = {
  offeringChipLimit?: number
}

export function buildProviderPresentation(
  catalog: ProviderPresentationCatalog,
  options: ProviderPresentationOptions = {},
): ProviderPresentation {
  const offerings = catalog.offerings
  const primaryOffering = offerings[0]
  const locationLabel = formatProviderLocation(catalog)
  const serviceArea = primaryOffering?.serviceAreaSummary?.trim()
  const firstRequestMode = primaryOffering !== undefined && hasContactPath(primaryOffering)
    ? 'quote_request_available' as const
    : 'not_available_yet' as const
  const availabilityLabel = plainAvailabilityLabelForCatalog(catalog, firstRequestMode)
  const responseLabel = plainResponseTimeLabel(catalog.responseTimeMinutes)
  const trustLabel = plainTrustLabel(catalog.trustTier)
  const ownerPhoto = catalog.photos.find((entry: ProviderPresentationCatalog['photos'][number]) => !entry.url.startsWith('/images/illustration/'))
  const offeringChips = readOfferingChips(offerings, options.offeringChipLimit)

  return {
    locationLabel,
    serviceArea: serviceArea === undefined || serviceArea.length === 0 ? locationLabel : serviceArea,
    availabilityLabel,
    availabilitySlug: slugify(availabilityLabel),
    responseLabel,
    responseFallbackLabel: responseLabel.length > 0 ? responseLabel : 'Response not supplied yet',
    trustCue: formatProviderTrustCue({
      trustLabel,
      ...(catalog.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: catalog.responseTimeMinutes }),
    }),
    nextStepLabel: plainNextStepLabel(firstRequestMode),
    ...(primaryOffering === undefined ? {} : { primaryOfferingName: primaryOffering.name }),
    ...(primaryOffering === undefined ? {} : { primaryOfferingSummary: primaryOffering.summary }),
    hoursLabel: plainHoursLabel(primaryOffering?.availabilitySummary),
    image: ownerPhoto === undefined
      ? {
          kind: 'illustration',
          url: categoryIllustrationPath(catalog.category),
          alt: catalog.category,
        }
      : {
          kind: 'photo',
          url: ownerPhoto.url,
          alt: ownerPhoto.alt,
        },
    offeringChips,
  }
}

function plainAvailabilityLabelForCatalog(
  catalog: ProviderPresentationCatalog,
  firstRequestMode: 'quote_request_available' | 'not_available_yet',
): string {
  if (catalog.disposition === 'stale' || catalog.disposition === 'partial') {
    return 'Needs confirmation'
  }
  return firstRequestMode === 'quote_request_available' ? 'Contact supplied' : 'No contact option yet'
}

function hasContactPath(offering: ProviderPresentationOffering): boolean {
  return offering.accessPaths.some((path) => path.kind === 'human_request')
}

function formatProviderLocation(catalog: ProviderPresentationCatalog): string {
  return catalog.businessContext.kind === 'local_human'
    ? [catalog.businessContext.suburb, catalog.businessContext.stateTerritory, catalog.businessContext.postcode]
        .filter((part): part is string => part !== undefined && part.trim().length > 0)
        .join(', ')
    : `${catalog.businessContext.providerIdentifier} · ${catalog.businessContext.website}`
}

function readOfferingChips(
  offerings: readonly ProviderPresentationOffering[],
  limit: number | undefined,
): readonly ProviderOfferingChipPresentation[] {
  const visibleOfferings = limit === undefined ? offerings : offerings.slice(0, limit)
  return visibleOfferings.map((offering): ProviderOfferingChipPresentation => ({
    key: offering.offeringRef,
    label: offering.name,
  }))
}
export type AeStatusPillTone = 'available' | 'closed' | 'appointment' | 'attention'

/**
 * Maps a plain availability label (from {@link plainAvailabilityLabel}) to one
 * of AeStatusPill's four tones. "Needs confirmation" (stale/degraded discovery
 * data) is the only case that earns the attention tone; every other
 * not-yet-actionable label reads as the neutral "closed" tone.
 */
export function pillToneForAvailabilityLabel(label: string): AeStatusPillTone {
  const normalized = label.trim().toLowerCase()
  if (normalized.includes('contact supplied') || normalized.includes('available')) {
    return 'available'
  }
  if (normalized.includes('appointment')) {
    return 'appointment'
  }
  if (normalized.includes('needs confirmation')) {
    return 'attention'
  }
  return 'closed'
}
