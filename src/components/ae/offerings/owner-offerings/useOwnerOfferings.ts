import { useEffect, useMemo, useRef } from 'react'

import {
  ownerToolAvailabilityPresentation,
  type OwnerOfferingSummary,
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

export function matchesOwnerOfferingInventory(item: OwnerOfferingSummary, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase()
  if (normalized.length === 0) return true
  const availabilityPresentation = ownerToolAvailabilityPresentation(item.availability)
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
  offerings,
  filterValue,
  sorting,
  activeRowActionId,
  restoreRowActionFocus = false,
}: AeOwnerOfferingsListProps): OwnerOfferingsState {
  const compactRootRef = useRef<HTMLUListElement>(null)
  const hasLifecyclePresentation = offerings.some((item) => item.lifecycleLabel !== undefined)
  const trimmedFilter = filterValue?.trim() ?? ''
  const compactOfferings = useMemo(() => {
    const filtered = trimmedFilter.length === 0
      ? [...offerings]
      : offerings.filter((item) => matchesOwnerOfferingInventory(item, trimmedFilter))
    const rule = sorting?.[0]
    if (rule === undefined) return filtered
    return filtered.sort((left, right) => {
      const comparison = compactSortValue(left, rule.id).localeCompare(
        compactSortValue(right, rule.id),
        undefined,
        { numeric: true },
      )
      return rule.desc ? -comparison : comparison
    })
  }, [offerings, sorting, trimmedFilter])

  useEffect(() => {
    if (!hasLifecyclePresentation || !restoreRowActionFocus || activeRowActionId === undefined) return
    const action = Array.from(compactRootRef.current?.querySelectorAll<HTMLElement>('[data-ae-row-action-id]') ?? [])
      .find((element) => element.dataset.aeRowActionId === activeRowActionId)
    if (action === undefined) return
    const frame = window.requestAnimationFrame(() => action.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [activeRowActionId, compactOfferings, hasLifecyclePresentation, restoreRowActionFocus])

  const filterEmptyMessage = trimmedFilter.length > 0
    ? `No tools match '${trimmedFilter}'`
    : undefined

  return {
    compactRootRef,
    hasLifecyclePresentation,
    trimmedFilter,
    compactOfferings,
    filterEmptyMessage,
  }
}

export function statusLabel(status: BusinessOfferingStatus): string {
  return status[0]?.toUpperCase() + status.slice(1)
}

function compactSortValue(item: OwnerOfferingSummary, id: string): string {
  if (id === 'name') return item.offering.name
  if (id === 'status') return item.lifecycleLabel ?? statusLabel(item.status)
  if (id === 'price') return item.pricingLabel ?? ''
  if (id === 'activity') return String(item.callsCount ?? item.accessPathCount)
  return item.offering.name
}
