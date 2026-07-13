import type { PublicRouteCatalogContract } from '@/modules/catalog/public'

import { plainHoursLabel } from './status-presentation'

export const AE_EXPLAINER = 'AE sends your request in writing and keeps a record — or call directly.' as const
export const NO_REPLY_HISTORY = 'No reply history yet' as const

export type TrustFact =
  | { kind: 'published'; value: string; updatedAt?: number }
  | { kind: 'not_published'; label: string }

export type ReplyPosture =
  | { kind: 'no_history'; label: typeof NO_REPLY_HISTORY }
  | {
      kind: 'business_published'
      label: string
      businessName: string
      window: string
      publishedAt: number
    }
  | {
      kind: 'observed'
      label: string
      sampleSize: number
      window: string
      observedFrom: number
      observedTo: number
      updatedAt: number
    }

export type ListingTrustProjection = {
  phone: TrustFact
  hours: TrustFact
  serviceArea: TrustFact
  replyPosture: ReplyPosture
  explainer: typeof AE_EXPLAINER
}

type TrustProjectionCatalogSource = {
  updatedAt: number
  publishedPhone?: string
  services: readonly {
    hoursOrUnknown: string
    serviceArea: string
  }[]
}

export function buildListingTrustProjection(catalog: PublicRouteCatalogContract): ListingTrustProjection
export function buildListingTrustProjection(catalog: TrustProjectionCatalogSource): ListingTrustProjection
export function buildListingTrustProjection(catalog: TrustProjectionCatalogSource): ListingTrustProjection {
  const primaryService = catalog.services.at(0)

  return {
    phone: publishedFact(catalog.publishedPhone, 'Phone not published here', catalog.updatedAt),
    hours: publishedHours(primaryService?.hoursOrUnknown, catalog.updatedAt),
    serviceArea: publishedFact(primaryService?.serviceArea, 'Service area not published here', catalog.updatedAt),
    replyPosture: { kind: 'no_history', label: NO_REPLY_HISTORY },
    explainer: AE_EXPLAINER,
  }
}

function publishedHours(value: string | undefined, updatedAt: number): TrustFact {
  const label = plainHoursLabel(value)
  return label === 'Check hours'
    ? { kind: 'not_published', label: 'Hours not published here' }
    : { kind: 'published', value: label, updatedAt }
}

function publishedFact(value: string | undefined, unknownLabel: string, updatedAt: number): TrustFact {
  const trimmed = value?.trim() ?? ''
  return trimmed.length === 0 || trimmed.toLowerCase() === 'unknown'
    ? { kind: 'not_published', label: unknownLabel }
    : { kind: 'published', value: trimmed, updatedAt }
}
