import { formatUtcTimestamp } from '@/lib/ui/format-time'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import type { ListingProjection, ListingPrice } from '@/modules/registry/public'
import { formatDisplayAmount, parseDecimalExactAmount } from '@/modules/money/public'
import type { ToolObjectView } from './object-family.contracts'

function priceLabel(price: ListingPrice): string {
  if (price.kind === 'quote_required') return 'Quote required'
  if (price.currency !== 'AUD' || price.kind === 'indicative') return 'AUD estimate temporarily unavailable'
  const minimum = parseDecimalExactAmount('AUD', price.kind === 'range' ? price.minimum : price.amount, 6)
  if (minimum === undefined) return 'AUD estimate temporarily unavailable'
  if (price.kind !== 'range') return `${formatDisplayAmount(minimum)} per Call`
  const maximum = parseDecimalExactAmount('AUD', price.maximum, 6)
  return maximum === undefined
    ? 'AUD estimate temporarily unavailable'
    : `${formatDisplayAmount(minimum)}–${formatDisplayAmount(maximum)} per Call`
}

export function projectToolObject(listing: ListingProjection, href?: string, nowMs = Date.now()): ToolObjectView {
  const { identity, facts } = listing
  const source = (fact: { sourceRef: string; provenance: string }) => `${fact.provenance.replaceAll('_', ' ')} · ${fact.sourceRef}`
  const readiness = facts.readiness.kind === 'present' && facts.readiness.value.validUntil !== undefined && facts.readiness.value.validUntil <= nowMs
    ? { label: 'Readiness stale' }
    : facts.readiness.kind === 'present'
      ? { label: `${facts.readiness.value.posture === 'routeable' ? 'Routeable' : getStatusPresentation(facts.readiness.value.posture === 'setup_required' ? 'setup_required' : 'unavailable').label} · observed ${formatUtcTimestamp(facts.readiness.value.observedAt)} UTC`, source: source(facts.readiness) }
      : { label: facts.readiness.reason === 'stale' ? 'Readiness stale' : 'Readiness unknown' }
  const identityLink = identity.providerName.kind === 'present'
    ? listing.providerPage.kind === 'present'
      ? { kind: 'verified_provider' as const, name: identity.providerName.value, href: listing.providerPage.value }
      : { kind: 'publisher' as const, name: identity.providerName.value }
    : identity.hostName.kind === 'present' && listing.hostPage.kind === 'present'
      ? { kind: 'directory_host' as const, name: identity.hostName.value, href: listing.hostPage.value }
      : undefined
  return {
    listing,
    ...(href === undefined || href.length === 0 ? {} : { href }),
    title: identity.title.kind === 'present' ? identity.title.value : 'Unnamed Tool',
    ...(identity.summary.kind === 'present' ? { outcome: identity.summary.value } : {}),
    ...(facts.price.kind === 'present' ? { price: { label: priceLabel(facts.price.value), source: source(facts.price) } } : {}),
    readiness,
    ...(identityLink === undefined ? {} : { identity: identityLink }),
  }
}
