import { formatUtcTimestamp } from '@/lib/ui/format-time'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import type { ListingProjection, ListingPrice } from '@/modules/registry/public'
import { formatDisplayAmount, formatDisplayPrice, parseDecimalExactAmount, type ReferenceRate } from '@/modules/money/public'
import type { ToolObjectView } from './object-family.contracts'

function priceLabel(price: ListingPrice, referenceRate: ReferenceRate | undefined, nowMs: number, admittedDisplayPrice?: PublicToolDescriptor['commercial']['displayPrice']): string {
  if (price.kind === 'quote_required') return 'Quote required'
  if (admittedDisplayPrice !== undefined) {
    const label = formatDisplayPrice(admittedDisplayPrice, nowMs) ?? 'AUD estimate temporarily unavailable'
    return label.startsWith('A$') ? `${label} per Call` : label
  }
  const display = (value: string) => {
    const exact = parseDecimalExactAmount(price.currency, value, 6)
    if (exact === undefined) return 'AUD estimate temporarily unavailable'
    if (price.currency === 'AUD') return formatDisplayAmount(exact)
    if (price.currency !== 'USDC') return 'AUD estimate temporarily unavailable'
    return formatDisplayPrice(referenceRate === undefined
      ? { kind: 'unavailable' }
      : { kind: 'indicative', amount: exact, validUntil: referenceRate.fetchedAt + 5 * 60_000, referenceRate }, nowMs) ?? 'AUD estimate temporarily unavailable'
  }
  const minimum = display(price.kind === 'range' ? price.minimum : price.amount)
  if (price.kind !== 'range') return `${minimum}${minimum.startsWith('A$') ? ' per Call' : ''}`
  const maximum = display(price.maximum)
  return minimum.startsWith('A$') && maximum.startsWith('A$')
    ? `${minimum}–${maximum} per Call`
    : 'AUD estimate temporarily unavailable'
}

/** Market excludes only an exact ToolRef or indexed sourceRouteRef, never a similar title or URL. */
export function alternativeToolSearchHref(listing: ListingProjection, capability: string, indexedSourceRouteRef?: string): string {
  const source = listing.sources[0]
  const alternativeTo = source.kind === 'admitted' ? source.toolRef : indexedSourceRouteRef
  if (alternativeTo === undefined) return '/market?view=tools'
  const query = capability.replace(/\s+/gu, ' ').trim().slice(0, 200).trimEnd()
  if (query.length === 0) return '/market?view=tools'
  const params = new URLSearchParams({ view: 'tools', query, alternativeTo })
  return `/market?${params.toString()}`
}

export function projectToolObject(listing: ListingProjection, href?: string, nowMs = Date.now(), referenceRate?: ReferenceRate, admittedDisplayPrice?: PublicToolDescriptor['commercial']['displayPrice']): ToolObjectView {
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
    ...(facts.price.kind === 'present' ? { price: { label: priceLabel(facts.price.value, referenceRate, nowMs, admittedDisplayPrice), source: source(facts.price) } } : {}),
    readiness,
    ...(identityLink === undefined ? {} : { identity: identityLink }),
  }
}
