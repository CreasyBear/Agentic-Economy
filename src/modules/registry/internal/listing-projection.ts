import type { PublicToolDescriptor, PublicToolRef } from '@/modules/capability-supply/public'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import { formatExactAmount } from '@/modules/money/public'
import type { ServiceDto, ServiceEndpointDto } from './service-projection'

export type ListingFact<T> = Readonly<{
  sourceRef: string
  provenance: 'directory_reported' | 'provider_declared' | 'ae_observed' | 'business_published'
  scope: 'directory_resource' | 'admitted_tool' | 'catalogue_endpoint' | 'business'
}> & (Readonly<{ kind: 'present'; value: T; observedAt?: number; validUntil?: number }>
  | Readonly<{ kind: 'absent'; reason: 'not_provided' | 'not_measured' | 'not_joined' | 'stale' }>)

export type ListingPrice =
  | Readonly<{ kind: 'fixed' | 'indicative'; amount: string; currency: string; basis: 'per_call' }>
  | Readonly<{ kind: 'range'; minimum: string; maximum: string; currency: string; basis: 'per_call' }>
  | Readonly<{ kind: 'quote_required'; basis: 'quote_required'; currency?: string }>

export type ListingSource =
  | Readonly<{ kind: 'directory'; sourceRouteRef: string; providerHost: string; toolRef?: never }>
  | Readonly<{ kind: 'admitted'; toolRef: PublicToolRef; publisher: PublicToolDescriptor['provenance']['publisher'] }>
  | Readonly<{ kind: 'business_catalogue'; businessSlug: string; offeringRef: string; endpointRef: string }>

export type ListingProjection = Readonly<{
  sources: readonly [ListingSource, ...ListingSource[]]
  canonicalToolRef: ListingFact<PublicToolRef>
  identity: Readonly<{
    title: ListingFact<string>
    summary: ListingFact<string>
    providerName: ListingFact<string>
    hostName: ListingFact<string>
    businessSlug: ListingFact<string>
  }>
  facts: Readonly<{
    price: ListingFact<ListingPrice>
    readiness: ListingFact<Readonly<{ posture: 'routeable' | 'setup_required' | 'unavailable'; observedAt: number; validUntil?: number }>>
    payment: ListingFact<Readonly<{ lane: 'brokered' | 'external'; protocol: 'x402' | 'none' | 'unknown'; creditEligible: boolean }>>
    authentication: ListingFact<'ae_api_key' | 'platform_credential' | 'x402'>
    completedCalls: ListingFact<Readonly<{ count: number; window: string }>>
    rating: ListingFact<Readonly<{ value: number; count: number; method: string }>>
    latency: ListingFact<Readonly<{ medianMs: number; p95Ms: number; count: number; window: string }>>
  }>
  providerPage: ListingFact<string>
  hostPage: ListingFact<string>
  technical: Readonly<{ operationId: ListingFact<string>; endpoint: ListingFact<string> }>
}>

export type DirectoryListingInput = Readonly<{
  resource: string
  title: string
  description: string
  provider: string
  slug?: string
  method?: string
  prices: readonly Readonly<{ scheme: string; decimalAmount?: string; symbol?: string }>[]
  provenance?: Readonly<{ updatedAt?: string }>
}>

type FactContext = Pick<ListingFact<unknown>, 'sourceRef' | 'provenance' | 'scope'>
const absent = <T>(context: FactContext, reason: Extract<ListingFact<T>, { kind: 'absent' }>['reason'] = 'not_provided'): ListingFact<T> => ({ ...context, kind: 'absent', reason })
const present = <T>(context: FactContext, value: T, time?: Readonly<{ observedAt?: number; validUntil?: number }>): ListingFact<T> => ({ ...context, kind: 'present', value, ...(time?.observedAt === undefined ? {} : { observedAt: time.observedAt }), ...(time?.validUntil === undefined ? {} : { validUntil: time.validUntil }) })
const supplied = (value: string | undefined): value is string => value !== undefined && value.trim().length > 0
const fact = (context: FactContext, value: string | undefined): ListingFact<string> => supplied(value) ? present(context, value) : absent(context)

function admittedPrice(tool: PublicToolDescriptor, source: FactContext): ListingFact<ListingPrice> {
  const price = tool.commercial.price
  if (price.kind === 'on_request') return present(source, { kind: 'quote_required', basis: 'quote_required' })
  if (price.kind === 'fixed') {
    const amount = formatExactAmount(price.amount)
    return amount === undefined ? absent(source) : present(source, { kind: 'fixed', amount, currency: price.amount.currency, basis: 'per_call' })
  }
  const minimum = formatExactAmount(price.minimum)
  const maximum = formatExactAmount(price.maximum)
  return minimum === undefined || maximum === undefined || price.minimum.currency !== price.maximum.currency
    ? absent(source)
    : present(source, { kind: 'range', minimum, maximum, currency: price.minimum.currency, basis: 'per_call' })
}

function emptyEvidence(source: FactContext) {
  return {
    completedCalls: absent<{ count: number; window: string }>(source, 'not_measured'),
    rating: absent<{ value: number; count: number; method: string }>(source, 'not_measured'),
    latency: absent<{ medianMs: number; p95Ms: number; count: number; window: string }>(source, 'not_measured'),
  }
}

/** An admitted descriptor proves the Tool, not public publication of its Business portfolio. */
export function projectAdmittedListing(tool: PublicToolDescriptor, verifiedBusinessSlug?: string): ListingProjection {
  const source = { sourceRef: tool.toolRef, provenance: 'ae_observed', scope: 'admitted_tool' } as const
  const business = { sourceRef: tool.business.businessId, provenance: 'business_published', scope: 'business' } as const
  const verified = verifiedBusinessSlug === tool.business.slug
  const host = tool.canonical?.providerHost
  const readiness = tool.availability
  const observedAt = readiness.observedAt
  return {
    sources: [{ kind: 'admitted', toolRef: tool.toolRef, publisher: tool.provenance.publisher }],
    canonicalToolRef: present(source, tool.toolRef),
    identity: {
      title: fact({ ...source, sourceRef: tool.listing.listingRef, provenance: 'provider_declared' }, tool.listing.label),
      summary: fact({ ...source, sourceRef: tool.listing.listingRef, provenance: 'provider_declared' }, tool.summary),
      providerName: fact(verified ? business : { ...source, provenance: 'provider_declared' }, tool.business.name),
      hostName: fact({ ...source, provenance: 'directory_reported' }, host),
      businessSlug: verified ? fact(business, tool.business.slug) : absent(source, 'not_joined'),
    },
    facts: {
      price: admittedPrice(tool, source),
      readiness: observedAt !== undefined && (readiness.validUntil === undefined || readiness.validUntil > Date.now())
        ? present(source, { posture: readiness.posture, observedAt, ...(readiness.validUntil === undefined ? {} : { validUntil: readiness.validUntil }) }, readiness)
        : absent(source, observedAt === undefined ? 'not_measured' : 'stale'),
      payment: present(source, { lane: tool.paymentLane, protocol: tool.payment?.protocol ?? 'none', creditEligible: tool.paymentLane === 'brokered' }),
      authentication: tool.authentication.kind === 'unknown' ? absent(source) : present(source, tool.authentication.kind),
      ...emptyEvidence(source),
    },
    providerPage: verified ? present(business, `/${tool.business.slug}`) : absent(source, 'not_joined'),
    hostPage: host === undefined ? absent(source, 'not_joined') : present({ ...source, provenance: 'directory_reported' }, `/providers/${encodeURIComponent(host)}`),
    technical: { operationId: fact(source, tool.contract.capabilityId), endpoint: absent(source) },
  }
}

/** Directory hostname is a source grouping, never accountable Provider identity. */
export function projectDirectoryListing(entry: DirectoryListingInput): ListingProjection {
  const source = { sourceRef: entry.resource, provenance: 'directory_reported', scope: 'directory_resource' } as const
  const host = supplied(entry.provider) && entry.provider !== 'Unknown provider' ? entry.provider : undefined
  const declared = entry.prices.filter(price => price.scheme === 'exact' && supplied(price.decimalAmount) && supplied(price.symbol) && /^\d+(?:\.\d+)?$/.test(price.decimalAmount))
  const price = declared.length === 1 ? declared[0] : undefined
  return {
    sources: [{ kind: 'directory', sourceRouteRef: entry.resource, providerHost: entry.provider }],
    canonicalToolRef: absent(source, 'not_joined'),
    identity: { title: fact(source, entry.title), summary: fact(source, entry.description), providerName: absent(source, 'not_joined'), hostName: fact(source, host), businessSlug: absent(source, 'not_joined') },
    facts: {
      price: price?.decimalAmount === undefined || price.symbol === undefined
        ? absent(source)
        : present(source, { kind: 'fixed', amount: price.decimalAmount, currency: price.symbol, basis: 'per_call' }),
      readiness: absent(source, 'not_measured'),
      payment: present(source, { lane: 'external', protocol: 'x402', creditEligible: false }),
      authentication: absent(source),
      ...emptyEvidence(source),
    },
    providerPage: absent(source, 'not_joined'),
    hostPage: host === undefined ? absent(source, 'not_joined') : present(source, `/providers/${encodeURIComponent(host)}`),
    technical: { operationId: absent(source), endpoint: fact(source, entry.resource) },
  }
}

/** Consume only the exact-joined Service DTO; never infer Tool identity from URL, host or name. */
export function projectCatalogueEndpointListing(service: ServiceDto, endpoint: ServiceEndpointDto): ListingProjection {
  if (!service.endpoints.includes(endpoint)) throw new Error('catalogue_endpoint_not_in_service')
  const offering = service.ae.offerings.find(item => item.offeringRef === endpoint.ae.offeringRef)
  if (offering === undefined) throw new Error('catalogue_offering_missing')
  const source = { sourceRef: `${offering.offeringRef}:${offering.revision}:${endpoint.url}:${endpoint.method ?? ''}`, provenance: 'business_published', scope: 'catalogue_endpoint' } as const
  const business = { sourceRef: service.id, provenance: 'business_published', scope: 'business' } as const
  const ref = endpoint.ae.toolRef
  const joined = ref !== undefined && isPublicToolRef(ref)
  const pricing = endpoint.pricing
  const price: ListingFact<ListingPrice> = pricing === undefined ? absent(source) : pricing.scheme === 'exact' && supplied(pricing.amount)
    ? present(source, { kind: 'fixed', amount: pricing.amount, currency: pricing.currency, basis: 'per_call' })
    : supplied(pricing.minAmount) && supplied(pricing.maxAmount)
      ? present(source, { kind: 'range', minimum: pricing.minAmount, maximum: pricing.maxAmount, currency: pricing.currency, basis: 'per_call' })
      : absent(source)
  return {
    sources: [{ kind: 'business_catalogue', businessSlug: service.id, offeringRef: offering.offeringRef, endpointRef: source.sourceRef }],
    canonicalToolRef: joined ? present(source, ref) : absent(source, 'not_joined'),
    identity: { title: fact(source, offering.name), summary: fact(source, endpoint.description || offering.summary), providerName: fact(business, service.name), hostName: absent(source, 'not_joined'), businessSlug: fact(business, service.id) },
    facts: {
      price,
      readiness: offering.support.observedAt !== undefined && offering.support.validUntil !== undefined && offering.support.validUntil > Date.now()
        ? present(source, { posture: offering.support.routeable ? 'routeable' : 'unavailable', observedAt: offering.support.observedAt, validUntil: offering.support.validUntil }, offering.support)
        : absent(source, offering.support.observedAt === undefined ? 'not_measured' : 'stale'),
      payment: absent(source),
      authentication: endpoint.ae.authentication.kind === 'unknown' ? absent(source) : present(source, endpoint.ae.authentication.kind),
      ...emptyEvidence(source),
    },
    providerPage: present(business, `/${service.id}`),
    hostPage: absent(source, 'not_joined'),
    technical: { operationId: absent(source), endpoint: fact(source, endpoint.url) },
  }
}
