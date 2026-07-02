import type { PublicRouteCatalogContract } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiDto } from '@/modules/registry/public'

import {
  categoryIllustrationPath,
  formatProviderTrustCue,
  plainAvailabilityLabel,
  plainHoursLabel,
  plainNextStepLabel,
  plainResponseTimeLabel,
  plainTrustLabel,
} from './status-presentation'

export type ProviderPresentationCatalog = PublicBusinessCatalogApiDto | PublicRouteCatalogContract
export type ProviderPresentationService = ProviderPresentationCatalog['services'][number]

export type ProviderServiceChipPresentation = {
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
  primaryServiceName?: string
  primaryServiceSummary?: string
  hoursLabel: string
  image: ProviderImagePresentation
  serviceChips: readonly ProviderServiceChipPresentation[]
}

export type ProviderPresentationOptions = {
  serviceChipLimit?: number
}

export function buildProviderPresentation(
  catalog: ProviderPresentationCatalog,
  options: ProviderPresentationOptions = {},
): ProviderPresentation {
  const services = catalog.services ?? []
  const primaryService = services[0]
  const locationLabel = formatProviderLocation(catalog)
  const serviceArea = primaryService?.serviceArea.trim()
  const firstRequestMode = primaryService?.firstRequest.mode ?? 'not_available_yet'
  const availabilityLabel = plainAvailabilityLabel({
    discoveryStatus: catalog.discoveryStatus,
    firstRequestMode,
  })
  const responseLabel = plainResponseTimeLabel(catalog.responseTimeMinutes)
  const trustLabel = plainTrustLabel(catalog.trustTier)
  const photo = catalog.photos?.[0]
  const serviceChips = readServiceChips(services, options.serviceChipLimit)

  return {
    locationLabel,
    serviceArea: serviceArea === undefined || serviceArea.length === 0 ? locationLabel : serviceArea,
    availabilityLabel,
    availabilitySlug: availabilityLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    responseLabel,
    responseFallbackLabel: responseLabel.length > 0 ? responseLabel : 'Response not supplied yet',
    trustCue: formatProviderTrustCue({
      trustLabel,
      ...(catalog.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: catalog.responseTimeMinutes }),
    }),
    nextStepLabel: firstRequestMode === 'inquiry_available' ? 'Send inquiry' : plainNextStepLabel(firstRequestMode),
    ...(primaryService === undefined ? {} : { primaryServiceName: primaryService.name }),
    ...(primaryService === undefined ? {} : { primaryServiceSummary: primaryService.summary }),
    hoursLabel: plainHoursLabel(primaryService?.hoursOrUnknown),
    image: photo === undefined
      ? {
          kind: 'illustration',
          url: categoryIllustrationPath(catalog.category),
          alt: `${catalog.category} illustration`,
        }
      : {
          kind: 'photo',
          url: photo.url,
          alt: photo.alt,
        },
    serviceChips,
  }
}

function formatProviderLocation(catalog: ProviderPresentationCatalog): string {
  const parts = [catalog.suburb, catalog.stateTerritory]
  if (catalog.postcode !== undefined && catalog.postcode.trim().length > 0) {
    parts.push(catalog.postcode)
  }
  return parts.join(', ')
}

function readServiceChips(
  services: readonly ProviderPresentationService[],
  limit: number | undefined,
): readonly ProviderServiceChipPresentation[] {
  const visibleServices = limit === undefined ? services : services.slice(0, limit)
  return visibleServices.map((service): ProviderServiceChipPresentation => ({
    key: 'serviceSlug' in service ? service.serviceSlug : service.slug,
    label: service.name,
  }))
}
