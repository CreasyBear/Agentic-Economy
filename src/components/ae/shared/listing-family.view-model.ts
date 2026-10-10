import { formatTimestamp } from '@/lib/ui/format-time'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import type { ListingProjection, ListingPrice } from '@/modules/registry/public'
import { REFERENCE_RATE_MAX_AGE_MS, formatDisplayAmount, formatDisplayPrice, formatExactAmount, parseDecimalExactAmount, type ExactAmount, type ReferenceRate } from '@/modules/money/public'
import type { ToolObjectView } from './object-family.contracts'

function buyerUsdAmount(amount: ExactAmount): string | undefined {
  if (amount.currency !== 'USD' && amount.currency !== 'USDC') return undefined
  const formatted = formatExactAmount(amount)
  if (formatted === undefined) return undefined
  const normalized = formatted.includes('.') ? formatted.replace(/0+$/u, '').replace(/\.$/u, '') : formatted
  return `US$${normalized}`
}

function buyerSourceAmount(amount: ExactAmount, referenceRate: ReferenceRate | undefined, nowMs: number): string | undefined {
  if (amount.currency === 'AUD') return formatDisplayAmount(amount)
  if (amount.currency === 'USDC') {
    const estimate = referenceRate === undefined ? undefined
      : formatDisplayPrice({ kind: 'indicative', amount, validUntil: referenceRate.fetchedAt + REFERENCE_RATE_MAX_AGE_MS, referenceRate }, nowMs)
    if (estimate?.startsWith('A$') === true) return estimate
  }
  return buyerUsdAmount(amount)
}

function priceLabel(price: ListingPrice, referenceRate: ReferenceRate | undefined, nowMs: number, admittedDisplayPrice?: PublicToolDescriptor['commercial']['displayPrice']): string {
  if (price.kind === 'quote_required') return 'Quote required'
  const admittedEstimate = admittedDisplayPrice === undefined ? undefined : formatDisplayPrice(admittedDisplayPrice, nowMs)
  if (admittedEstimate?.startsWith('A$') === true) return `${admittedEstimate} per Call`
  const display = (value: string) => {
    const exact = parseDecimalExactAmount(price.currency, value, 6)
    return exact === undefined ? undefined : buyerSourceAmount(exact, referenceRate, nowMs)
  }
  if (price.kind !== 'range') {
    const amount = display(price.amount)
    return amount === undefined ? '' : `${amount} per Call`
  }
  const minimum = display(price.minimum)
  const maximum = display(price.maximum)
  return minimum === undefined || maximum === undefined ? '' : `${minimum}–${maximum} per Call`
}

/** Market excludes only an exact ToolRef or indexed sourceRouteRef, never a similar title or URL. */
export function alternativeToolSearchHref(listing: ListingProjection, capability: string, indexedSourceRouteRef?: string): string {
  const source = listing.sources[0]
  const alternativeTo = source.kind === 'admitted' ? source.toolRef : indexedSourceRouteRef
  const query = capability.replace(/\s+/gu, ' ').trim().slice(0, 200).trimEnd()
  if (query.length === 0) return '/market?view=tools'
  const params = new URLSearchParams({ view: 'tools', query, ...(alternativeTo === undefined ? {} : { alternativeTo }) })
  return `/market?${params.toString()}`
}

export function projectToolObject(listing: ListingProjection, href?: string, nowMs = Date.now(), referenceRate?: ReferenceRate, admittedDisplayPrice?: PublicToolDescriptor['commercial']['displayPrice']): ToolObjectView {
  const { identity, facts } = listing
  const source = (fact: { sourceRef: string; provenance: string }) => `${fact.provenance.replaceAll('_', ' ')} · ${fact.sourceRef}`
  const readiness = facts.readiness.kind === 'present' && facts.readiness.value.validUntil !== undefined && facts.readiness.value.validUntil <= nowMs
    ? { label: 'Readiness stale' }
    : facts.readiness.kind === 'present'
      ? { label: `${facts.readiness.value.posture === 'routeable' ? 'Routeable' : getStatusPresentation(facts.readiness.value.posture === 'setup_required' ? 'setup_required' : 'unavailable').label} · observed ${formatTimestamp(facts.readiness.value.observedAt, 'UTC')} UTC`, source: source(facts.readiness) }
      : { label: facts.readiness.reason === 'stale' ? 'Readiness stale' : 'Readiness unknown' }
  const identityLink = identity.providerName.kind === 'present'
    ? listing.providerPage.kind === 'present'
      ? { kind: 'verified_provider' as const, name: identity.providerName.value, href: listing.providerPage.value }
      : { kind: 'publisher' as const, name: identity.providerName.value }
    : identity.hostName.kind === 'present' && listing.hostPage.kind === 'present'
      ? { kind: 'directory_host' as const, name: identity.hostName.value, href: listing.hostPage.value }
      : undefined
  const displayedPrice = facts.price.kind === 'present'
    ? priceLabel(facts.price.value, referenceRate, nowMs, admittedDisplayPrice) : undefined
  const priceSource = facts.price.kind === 'present' ? source(facts.price) : undefined
  return {
    listing,
    ...(href === undefined || href.length === 0 ? {} : { href }),
    title: identity.title.kind === 'present' ? identity.title.value : 'Unnamed Tool',
    ...(identity.summary.kind === 'present' ? { outcome: identity.summary.value } : {}),
    ...(displayedPrice === undefined || displayedPrice.length === 0 || priceSource === undefined
      ? {} : { price: { label: displayedPrice, source: priceSource } }),
    readiness,
    ...(identityLink === undefined ? {} : { identity: identityLink }),
  }
}
