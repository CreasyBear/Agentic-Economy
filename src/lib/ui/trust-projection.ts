import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

import { plainHoursLabel } from './status-presentation'

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
    | typeof DIRECT_CONTACT_EXPLAINER
    | typeof NO_CONTACT_EXPLAINER
}


export function buildListingTrustProjection(
  catalog: PublicBusinessCatalogApiV2Dto,
): ListingTrustProjection {
  const primaryOffering = catalog.offerings.at(0)
  const publishedPhone = catalog.businessContext.kind === 'local_human'
    ? catalog.businessContext.publishedPhone
    : undefined
  const phone = publishedFact(publishedPhone, 'Phone not published here', catalog.observedAt)

  return {
    phone,
    hours: publishedHours(primaryOffering?.availabilitySummary, catalog.observedAt),
    serviceArea: publishedFact(primaryOffering?.serviceAreaSummary, 'Service area not published here', catalog.observedAt),
    replyPosture: { kind: 'no_history', label: NO_REPLY_HISTORY },
    explainer: phone.kind === 'published' ? DIRECT_CONTACT_EXPLAINER : NO_CONTACT_EXPLAINER,
  }
}

const NON_PUBLISHED_HOURS_LABELS = new Set([
  'check hours',
  'hours supplied by owner',
  'hours unknown',
  'owner supplied hours',
  'owner confirmed hours are not listed yet',
  'after-hours availability supplied by owner',
])

function publishedHours(value: string | undefined, updatedAt: number): TrustFact {
  const label = plainHoursLabel(value)
  return NON_PUBLISHED_HOURS_LABELS.has(label.toLowerCase())
    ? { kind: 'not_published', label: 'Hours not published here' }
    : { kind: 'published', value: label, updatedAt }
}

function publishedFact(value: string | undefined, unknownLabel: string, updatedAt: number): TrustFact {
  const trimmed = value?.trim() ?? ''
  return trimmed.length === 0 || trimmed.toLowerCase() === 'unknown'
    ? { kind: 'not_published', label: unknownLabel }
    : { kind: 'published', value: trimmed, updatedAt }
}
