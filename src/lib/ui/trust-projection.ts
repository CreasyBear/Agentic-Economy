import type { PublicRouteCatalogContract } from '@/modules/catalog/public'

import { plainHoursLabel } from './status-presentation'

export const AE_EXPLAINER_FULL = 'AE sends your request in writing and keeps a record — or call directly.' as const
export const AE_EXPLAINER_NO_PHONE = 'AE sends your request in writing and keeps a record.' as const
export const DIRECT_CONTACT_EXPLAINER = 'Use the published phone number to contact this business directly.' as const
export const NO_CONTACT_EXPLAINER = 'Contact details and a request path are not published yet.' as const
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
  explainer:
    | typeof AE_EXPLAINER_FULL
    | typeof AE_EXPLAINER_NO_PHONE
    | typeof DIRECT_CONTACT_EXPLAINER
    | typeof NO_CONTACT_EXPLAINER
}

type TrustProjectionCatalogSource = {
  updatedAt: number
  publishedPhone?: string
  services: readonly {
    hoursOrUnknown: string
    serviceArea: string
  }[]
}

export function buildListingTrustProjection(catalog: PublicRouteCatalogContract, inquiryAvailable?: boolean): ListingTrustProjection
export function buildListingTrustProjection(catalog: TrustProjectionCatalogSource, inquiryAvailable?: boolean): ListingTrustProjection
export function buildListingTrustProjection(
  catalog: TrustProjectionCatalogSource,
  inquiryAvailable = true,
): ListingTrustProjection {
  const primaryService = catalog.services.at(0)
  const phone = publishedFact(catalog.publishedPhone, 'Phone not published here', catalog.updatedAt)

  return {
    phone,
    hours: publishedHours(primaryService?.hoursOrUnknown, catalog.updatedAt),
    serviceArea: publishedFact(primaryService?.serviceArea, 'Service area not published here', catalog.updatedAt),
    replyPosture: { kind: 'no_history', label: NO_REPLY_HISTORY },
    explainer: inquiryAvailable
      ? phone.kind === 'published' ? AE_EXPLAINER_FULL : AE_EXPLAINER_NO_PHONE
      : phone.kind === 'published' ? DIRECT_CONTACT_EXPLAINER : NO_CONTACT_EXPLAINER,
  }
}

const NON_PUBLISHED_HOURS_LABELS: Record<string, true> = {
  'check hours': true,
  'hours supplied by owner': true,
  'hours unknown': true,
  'owner supplied hours': true,
  'owner confirmed hours are not listed yet': true,
  'after-hours availability supplied by owner': true,
}

function publishedHours(value: string | undefined, updatedAt: number): TrustFact {
  const label = plainHoursLabel(value)
  return NON_PUBLISHED_HOURS_LABELS[label.toLowerCase()] === true
    ? { kind: 'not_published', label: 'Hours not published here' }
    : { kind: 'published', value: label, updatedAt }
}

function publishedFact(value: string | undefined, unknownLabel: string, updatedAt: number): TrustFact {
  const trimmed = value?.trim() ?? ''
  return trimmed.length === 0 || trimmed.toLowerCase() === 'unknown'
    ? { kind: 'not_published', label: unknownLabel }
    : { kind: 'published', value: trimmed, updatedAt }
}
