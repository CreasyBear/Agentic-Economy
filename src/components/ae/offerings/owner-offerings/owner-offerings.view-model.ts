import type { OwnerOfferingSummary, OwnerToolAvailability } from '@/components/ae/offerings/provider-workspace-projection'
import { getStatusPresentation } from '@/lib/ui/status-presentation'

export function ownerOfferingAvailabilityPresentation(availability: OwnerToolAvailability | undefined) {
  if (availability === undefined) return undefined
  const presentation = getStatusPresentation(availability === 'unknown' ? 'stale' : availability)
  return { label: presentation.compactLabel }
}

export function formatOwnerOfferingCalls(item: OwnerOfferingSummary): string {
  return item.callsCount === undefined ? '—' : item.callsCount.toLocaleString('en-AU')
}
