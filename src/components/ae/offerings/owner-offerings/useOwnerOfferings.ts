import { formatCount } from '@/lib/ui/format-time'
import type {
  OwnerOfferingSummary,
} from '@/components/ae/offerings/provider-workspace-projection'
import type {
  BusinessOfferingProjection,
  BusinessOfferingStatus,
  PublicOfferingSupplyProjection,
} from '@/modules/catalog/public'

import type {
  AeOwnerOfferingsListProps,
  OwnerOfferingsState,
} from './owner-offerings.contracts'
import { ownerOfferingAvailabilityPresentation } from './owner-offerings.view-model'

export function matchesOwnerOfferingInventory(item: OwnerOfferingSummary, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase()
  if (normalized.length === 0) return true
  const availabilityPresentation = ownerOfferingAvailabilityPresentation(item.availability)
  const candidates = [
    item.offering.name,
    item.offering.summary,
    item.protocolLabel,
    item.offering.offeringRef,
    item.slug,
    item.lifecycleLabel,
    availabilityPresentation?.label,
    item.availability,
    item.blocker,
    item.pricingLabel,
    item.callsCount === undefined ? undefined : formatCount(item.callsCount),
  ]
  return candidates.some((value) => value?.toLocaleLowerCase().includes(normalized) === true)
}

export function toOwnerOfferingSummary(
  projection: PublicOfferingSupplyProjection,
  status: BusinessOfferingStatus = 'published',
): OwnerOfferingSummary {
  const offeringWithSlug = projection.offering as BusinessOfferingProjection & { slug?: string }
  return {
    offering: projection.offering,
    status,
    accessPathCount: projection.accessPaths.length,
    support: projection.support,
    ...(offeringWithSlug.slug === undefined ? {} : { slug: offeringWithSlug.slug }),
  }
}

export function useOwnerOfferings({
  filterValue,
}: AeOwnerOfferingsListProps): OwnerOfferingsState {
  const trimmedFilter = filterValue?.trim() ?? ''

  const filterEmptyMessage = trimmedFilter.length > 0
    ? `No tools match '${trimmedFilter}'`
    : undefined

  return {
    filterEmptyMessage,
  }
}

export function statusLabel(status: BusinessOfferingStatus): string {
  return status[0]?.toUpperCase() + status.slice(1)
}
