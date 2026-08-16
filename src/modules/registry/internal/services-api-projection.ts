import type { OfferingPrice } from '@/modules/catalog/public'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import {
  formatExactAmount,
  parseDecimalExactAmount,
  rescaleExactAmount,
  type ExactAmount,
} from '@/modules/money/public'
import {
  isPublicOperationRef,
  type CatalogOfferingOperationMapEntry,
  type PublicOperationCatalogPrice,
} from '@/modules/capability-supply/public'


import type {
  ServiceDto,
  ServiceEndpointDto,
  ServiceEndpointPricingDto,
  ServiceOfferingDto,
  ServicePriceSummaryDto,
} from './service-projection'

import type {
  PublicBusinessCatalogApiV2Page,
  PublicBusinessCatalogApiV2SearchPage,
  PublicOfferingAccessPathDto,
} from './offering-api-projection'

export const PublicServicesApiSchemaVersion = 'public-services-api:v2' as const

/**
 * The W1 origin seam: a per-catalog-offering list of exact admitted
 * operation entries. A list is required because one offering can publish
 * multiple independently linked access paths.
 */
export type ServiceOperationMap = Readonly<Record<string, readonly CatalogOfferingOperationMapEntry[]>>

export type PublicServicesApiPage = Readonly<{
  kind: 'ok'
  schemaVersion: typeof PublicServicesApiSchemaVersion
  services: readonly ServiceDto[]
  isDone: boolean
  continueCursor: string
}>

export type PublicServicesSearchPage = Readonly<{
  kind: 'ok'
  schemaVersion: typeof PublicServicesApiSchemaVersion
  query?: string
  services: readonly ServiceDto[]
  pagination: PublicBusinessCatalogApiV2SearchPage['pagination']
}>

/**
 * Projects one published-business portfolio per business, with flat external
 * endpoint links across its offerings. This is a thin view over the public
 * business catalog, not an Agent Service or an execution authority.
 */
export function projectPublicServicesPage(
  page: PublicBusinessCatalogApiV2Page,
  operationMap?: ServiceOperationMap,
): PublicServicesApiPage {
  return {
    kind: 'ok',
    schemaVersion: PublicServicesApiSchemaVersion,
    services: page.page.map((business) => projectServiceFromBusinessDto(business, operationMap)),
    isDone: page.isDone,
    continueCursor: page.continueCursor,
  }
}

export function projectPublicServicesSearchPage(
  page: PublicBusinessCatalogApiV2SearchPage,
  operationMap?: ServiceOperationMap,
): PublicServicesSearchPage {
  return {
    kind: 'ok',
    schemaVersion: PublicServicesApiSchemaVersion,
    ...(page.query === undefined ? {} : { query: page.query }),
    services: page.items.map((business) => projectServiceFromBusinessDto(business, operationMap)),
    pagination: page.pagination,
  }
}

function projectServiceFromBusinessDto(
  business: PublicBusinessCatalogApiV2Page['page'][number],
  operationMap?: ServiceOperationMap,
): ServiceDto {
  const offerings = business.offerings.map((offering): ServiceOfferingDto => ({
    offeringRef: offering.offeringRef,
    revision: offering.revision,
    name: offering.name,
    category: offering.category,
    summary: offering.summary,
    ...(offering.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: offering.serviceAreaSummary }),
    ...spreadAvailability(offering.availabilitySummary),
    ...(offering.pricingSummary === undefined ? {} : { pricingSummary: offering.pricingSummary }),
    ...(offering.price === undefined ? {} : { price: offering.price }),
    support: {
      integrated: offering.support.integrated,
      // The public view folds "routeable and currently actionable" into
      // aeSupportedAction (routeable && validUntil > now). We never over-claim
      // routeability, so routeable mirrors it conservatively.
      routeable: offering.support.aeSupportedAction,
      ...(offering.support.observedAt === undefined ? {} : { observedAt: offering.support.observedAt }),
      ...(offering.support.validUntil === undefined ? {} : { validUntil: offering.support.validUntil }),
    },
  }))
  const endpoints = business.offerings.flatMap((offering) => {
    const externalPaths = offering.accessPaths.filter(
      (path): path is Extract<PublicOfferingAccessPathDto, { kind: 'external_operation' }> =>
        path.kind === 'external_operation' && isValidEndpointUrl(path.url),
    )
    return externalPaths.map((path) =>
      projectEndpoint(
        path,
        business.name,
        offering.offeringRef,
        offering.revision,
        offering.category,
        operationMap,
      ))
  })
  const priceSummary = priceSummaryOf(endpoints, business.offerings)
  const networks = sortedEndpointNetworks(endpoints)
  const iconUrl = business.photos.find((photo) => optionalText(photo.url) !== undefined)?.url
  const provider = business.businessContext.kind === 'programmable_provider'
    ? business.businessContext.providerIdentifier
    : undefined
  const providerUrl = business.businessContext.kind === 'programmable_provider'
    ? business.businessContext.website
    : undefined
  const domain = domainFromPublicUrl(providerUrl ?? business.publicUrl)
  const description = descriptionFromOfferings(business.offerings)
  const tags = uniqueSorted(
    business.offerings
      .map((offering) => offering.category.trim())
      .filter((category) => category.length > 0),
  )
  const integrationType: ServiceDto['integrationType'] = endpoints.length > 0
    && endpoints.every((endpoint) => endpoint.ae.authorityMode === 'provider_owned')
    ? '1P'
    : '3P'

  return {
    id: business.slug,
    name: business.name,
    ...(description === undefined ? {} : { description }),
    category: business.category,
    networks,
    enriched: endpoints.some((endpoint) => endpoint.ae.operationRef !== undefined),
    integrationType,
    serviceName: business.name,
    tags,
    ...(provider === undefined ? {} : { provider }),
    ...(providerUrl === undefined ? {} : { providerUrl }),
    ...(domain === undefined ? {} : { domain }),
    ...(iconUrl === undefined ? {} : { iconUrl }),
    ...(priceSummary === undefined ? {} : { priceSummary }),
    endpoints,
    ae: {
      trustTier: business.trustTier,
      businessContext: business.businessContext,
      publicUrl: business.publicUrl,
      ...(business.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: business.responseTimeMinutes }),
      photos: business.photos,
      observedAt: business.observedAt,
      disposition: business.disposition,
      source: 'business_published',
      offerings,
      links: {
        business: `/api/businesses/${business.slug}`,
        manifest: `/${business.slug}/ucp`,
      },
    },
  }
}

function projectEndpoint(
  path: Extract<PublicOfferingAccessPathDto, { kind: 'external_operation' }>,
  businessName: string,
  offeringRef: string,
  offeringRevision: number,
  offeringCategory: string,
  operationMap?: ServiceOperationMap,
): ServiceEndpointDto {
  // W1 origin seam: enrich only when exactly one map entry matches the
  // offering revision, declared access path, endpoint URL and HTTP method.
  // A missing or ambiguous exact match stays catalog-only/unenriched.
  const method = path.method?.trim().toUpperCase()
  // Public catalog paths intentionally omit private lineage hashes. The
  // operation map remains the internal source of admitted linkage, while
  // revision, declared path, URL, and method bind it to this public endpoint.
  const linkedCandidates = method === undefined
    ? []
    : (operationMap?.[offeringRef] ?? []).filter((candidate) => (
        candidate.offeringRef === offeringRef
        && candidate.offeringRevision === offeringRevision
        && candidate.declaredAccessPathRef === path.accessPathRef
        && candidate.endpointUrl === path.url
        && candidate.method === method
        && isPublicOperationRef(candidate.operationRef)
      ))
  const linked = linkedCandidates.length === 1 ? linkedCandidates[0] : undefined
  const authentication: ServiceEndpointDto['ae']['authentication'] =
    linked?.authentication ?? { kind: 'unknown' }
  const execution: ServiceEndpointDto['ae']['execution'] =
    linked === undefined || !linked.routeable
      ? 'catalog_only'
      : linked.answerExecutable && linked.authentication.kind === 'keyless'
        ? 'answer_tool'
        : 'request_route'
  const pricing = projectEndpointPricing(linked?.catalogPrice, linked?.payment)
  const paymentCurrencyMismatch = hasPaymentCurrencyMismatch(linked?.catalogPrice, linked?.payment)
  const authenticationSummary = optionalText(path.authenticationSummary ?? '')
  const settlementSupport: ServiceEndpointDto['ae']['settlementSupport'] =
    linked?.catalogPrice === undefined
      ? 'unpriced'
      : !linked.routeable || linked.payment === undefined || paymentCurrencyMismatch || pricing === undefined
        ? 'catalog_only'
        : 'executable'

  return {
    url: path.url,
    description: path.summary,
    ...(path.method === undefined ? {} : { method: path.method }),
    ...(linked?.authorityMode === 'provider_owned' ? { providerName: businessName } : {}),
    serviceName: businessName,
    tags: [offeringCategory],
    parameters: linked?.parameters ?? [],
    quality: null,
    ...(pricing === undefined ? {} : { pricing }),
    ae: {
      ...(linked === undefined ? {} : { operationRef: linked.operationRef }),
      offeringRef,
      provenance: path.provenance,
      access: 'external',
      authentication,
      execution,
      ...(linked === undefined ? {} : {
        authorityMode: linked.authorityMode,
        sourceKind: linked.sourceKind,
      }),
      ...(authenticationSummary === undefined ? {} : { authenticationSummary }),
      settlementSupport,
    },
  }
}

function projectEndpointPricing(
  price: PublicOperationCatalogPrice | undefined,
  payment: CatalogOfferingOperationMapEntry['payment'] | undefined,
): ServiceEndpointPricingDto | undefined {
  if (price === undefined) return undefined
  const currency = optionalText(price.currency)
  if (currency === undefined || hasPaymentCurrencyMismatch(price, payment)) return undefined
  const amount = optionalText(price.amount ?? '')
  const minAmount = optionalText(price.minAmount ?? '')
  const maxAmount = optionalText(price.maxAmount ?? '')
  const network = payment === undefined ? undefined : optionalText(payment.network)
  return {
    ...(amount === undefined ? {} : { amount }),
    currency,
    ...(network === undefined ? {} : { network }),
    scheme: price.scheme,
    ...(minAmount === undefined ? {} : { minAmount }),
    ...(maxAmount === undefined ? {} : { maxAmount }),
  }
}

function hasPaymentCurrencyMismatch(
  price: PublicOperationCatalogPrice | undefined,
  payment: CatalogOfferingOperationMapEntry['payment'] | undefined,
): boolean {
  if (price === undefined || payment === undefined) return false
  const priceCurrency = optionalText(price.currency)
  const paymentCurrency = optionalText(payment.currency)
  return priceCurrency === undefined || paymentCurrency === undefined || priceCurrency !== paymentCurrency
}

function sortedEndpointNetworks(endpoints: readonly ServiceEndpointDto[]): readonly string[] {
  const networks = new Set<string>()
  for (const endpoint of endpoints) {
    const network = optionalText(endpoint.pricing?.network ?? '')
    if (network !== undefined) networks.add(network)
  }
  return [...networks].sort()
}

/** Prefer exact endpoint catalog prices; use human offering facts only when no endpoint price exists. */
function priceSummaryOf(
  endpoints: readonly ServiceEndpointDto[],
  offerings: readonly { price?: OfferingPrice }[],
): ServicePriceSummaryDto | undefined {
  const endpointPricings = endpoints.flatMap(({ pricing }) => pricing === undefined ? [] : [pricing])
  if (endpointPricings.length > 0) return priceSummaryFromEndpoints(endpointPricings)
  if (endpoints.some((endpoint) => endpoint.pricing !== undefined)) return undefined
  return offeringPriceSummaryOf(offerings)
}

type EndpointExactPriceRange = Readonly<{
  currency: string
  minimum: ExactAmount
  maximum: ExactAmount
  exact: boolean
}>

function priceSummaryFromEndpoints(
  prices: readonly ServiceEndpointPricingDto[],
): ServicePriceSummaryDto | undefined {
  const ranges = prices.map((price): EndpointExactPriceRange | undefined => {
    const minimumText = price.scheme === 'exact' ? price.amount : price.minAmount
    const maximumText = price.scheme === 'exact' ? price.amount : price.maxAmount
    if (minimumText === undefined || maximumText === undefined) return undefined
    const minimum = parseEndpointExactAmount(minimumText, price.currency)
    const maximum = parseEndpointExactAmount(maximumText, price.currency)
    if (minimum === undefined || maximum === undefined) return undefined
    return { currency: price.currency, minimum, maximum, exact: price.scheme === 'exact' }
  })
  if (ranges.some((range) => range === undefined)) return undefined
  const bounded = ranges as EndpointExactPriceRange[]
  const first = bounded[0]
  if (first === undefined || bounded.some((range) => range.currency !== first.currency)) return undefined

  let commonExponent = 0
  for (const range of bounded) {
    commonExponent = Math.max(commonExponent, range.minimum.exponent, range.maximum.exponent)
  }
  const scaled = bounded.map((range) => ({
    ...range,
    minimum: rescaleExactAmount(range.minimum, commonExponent),
    maximum: rescaleExactAmount(range.maximum, commonExponent),
  }))
  if (scaled.some((range) => range.minimum === undefined || range.maximum === undefined)) return undefined

  let minUnits = BigInt(scaled[0]!.minimum!.units)
  let maxUnits = BigInt(scaled[0]!.maximum!.units)
  for (const range of scaled.slice(1)) {
    const minimumUnits = BigInt(range.minimum!.units)
    const maximumUnits = BigInt(range.maximum!.units)
    if (minimumUnits < minUnits) minUnits = minimumUnits
    if (maximumUnits > maxUnits) maxUnits = maximumUnits
  }
  const minAmount = formatExactAmount({ currency: first.currency, units: minUnits.toString(), exponent: commonExponent })
  const maxAmount = formatExactAmount({ currency: first.currency, units: maxUnits.toString(), exponent: commonExponent })
  if (minAmount === undefined || maxAmount === undefined) return undefined

  const avgCostBasis: 'exact' | 'varies' = bounded.every((range) => range.exact) ? 'exact' : 'varies'
  const avgCostPerTransaction = avgCostBasis === 'exact'
    ? exactAverageEndpointAmounts(bounded.map((range) => range.minimum), first.currency)
    : undefined
  return {
    currency: first.currency,
    minAmount,
    maxAmount,
    ...(avgCostPerTransaction === undefined ? {} : { avgCostPerTransaction }),
    avgCostBasis,
  }
}

function exactAverageEndpointAmounts(
  amounts: readonly ExactAmount[],
  currency: string,
): string | undefined {
  if (amounts.length === 0 || amounts.some((amount) => amount.currency !== currency)) return undefined
  let commonExponent = 0
  for (const amount of amounts) commonExponent = Math.max(commonExponent, amount.exponent)
  const scaled = amounts.map((amount) => rescaleExactAmount(amount, commonExponent))
  if (scaled.some((amount) => amount === undefined)) return undefined
  let totalUnits = 0n
  for (const amount of scaled) totalUnits += BigInt(amount!.units)
  const count = BigInt(amounts.length)
  for (let extraExponent = 0; extraExponent <= 18; extraExponent += 1) {
    const scaledTotal = totalUnits * (10n ** BigInt(extraExponent))
    if (scaledTotal % count !== 0n) continue
    return formatExactAmount({
      currency,
      units: (scaledTotal / count).toString(),
      exponent: commonExponent + extraExponent,
    })
  }
  return undefined
}

function parseEndpointExactAmount(value: string, currency: string): ExactAmount | undefined {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim())
  if (match === null) return undefined
  return parseDecimalExactAmount(currency, value.trim(), (match[2] ?? '').length)
}

/** Aggregate comparable human-published offering prices when endpoints have no prices. */
function offeringPriceSummaryOf(
  offerings: readonly { price?: OfferingPrice }[],
): ServicePriceSummaryDto | undefined {
  const publishedPrices = offerings.flatMap(({ price }) => price === undefined ? [] : [price])
  if (publishedPrices.some((price) => price.kind === 'from')) return undefined
  const bounded = publishedPrices.flatMap((price) => {
    if (price.kind === 'quote_only') return []
    const minimum = price.kind === 'range' ? price.minimum : price.amount
    const maximum = price.kind === 'range' ? price.maximum : price.amount
    return [{ price, minimum, maximum }]
  })
  const first = bounded[0]
  if (first === undefined) return undefined
  const basis = first.price
  if (bounded.some(({ price }) => price.unit !== basis.unit || price.taxTreatment !== basis.taxTreatment)) {
    return undefined
  }

  const currency = first.minimum.currency
  if (bounded.some((item) => item.minimum.currency !== currency || item.maximum.currency !== currency)) {
    return undefined
  }

  let commonExponent = 0
  for (const item of bounded) {
    commonExponent = Math.max(commonExponent, item.minimum.exponent, item.maximum.exponent)
  }
  const scaled = bounded.flatMap(({ price, minimum, maximum }) => {
    const scaledMinimum = rescaleExactAmount(minimum, commonExponent)
    const scaledMaximum = rescaleExactAmount(maximum, commonExponent)
    return scaledMinimum === undefined || scaledMaximum === undefined
      ? []
      : [{ price, minimum: scaledMinimum, maximum: scaledMaximum }]
  })
  if (scaled.length !== bounded.length) return undefined

  let minUnits = BigInt(scaled[0]!.minimum.units)
  let maxUnits = BigInt(scaled[0]!.maximum.units)
  for (const item of scaled.slice(1)) {
    const minimumUnits = BigInt(item.minimum.units)
    const maximumUnits = BigInt(item.maximum.units)
    if (minimumUnits < minUnits) minUnits = minimumUnits
    if (maximumUnits > maxUnits) maxUnits = maximumUnits
  }
  const minAmount = formatExactAmount({ currency, units: minUnits.toString(), exponent: commonExponent })
  const maxAmount = formatExactAmount({ currency, units: maxUnits.toString(), exponent: commonExponent })
  if (minAmount === undefined || maxAmount === undefined) return undefined

  const avgCostPerTransaction = exactAveragePerTransaction(publishedPrices, currency)
  const avgCostBasis: 'exact' | 'varies' =
    publishedPrices.length > 0
      && publishedPrices.every((price) => price.kind === 'fixed' && price.amount.currency === currency)
      ? 'exact'
      : 'varies'

  return {
    currency,
    minAmount,
    maxAmount,
    ...(avgCostPerTransaction === undefined ? {} : { avgCostPerTransaction }),
    avgCostBasis,
  }
}

function exactAveragePerTransaction(
  prices: readonly OfferingPrice[],
  currency: string,
): string | undefined {
  if (
    prices.length === 0
    || prices.some((price) => (
      price.kind !== 'fixed'
      || price.amount.currency !== currency
    ))
  ) {
    return undefined
  }
  const first = prices[0]
  if (first === undefined) return undefined
  if (prices.some((price) => price.unit !== first.unit || price.taxTreatment !== first.taxTreatment)) return undefined

  let commonExponent = 0
  for (const price of prices) {
    if (price.kind !== 'fixed') return undefined
    commonExponent = Math.max(commonExponent, price.amount.exponent)
  }
  const scaledAmounts: ExactAmount[] = []
  for (const price of prices) {
    if (price.kind !== 'fixed') return undefined
    const scaled = rescaleExactAmount(price.amount, commonExponent)
    if (scaled === undefined) return undefined
    scaledAmounts.push(scaled)
  }

  let totalUnits = 0n
  for (const amount of scaledAmounts) totalUnits += BigInt(amount.units)
  const count = BigInt(prices.length)
  for (let extraExponent = 0; extraExponent <= 18 - commonExponent; extraExponent += 1) {
    const scaledTotal = totalUnits * (10n ** BigInt(extraExponent))
    if (scaledTotal % count !== 0n) continue
    return formatExactAmount({
      currency,
      units: (scaledTotal / count).toString(),
      exponent: commonExponent + extraExponent,
    })
  }
  return undefined
}

function isValidEndpointUrl(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0) return false
  if (trimmed.startsWith('/')) {
    try {
      return new URL(trimmed, 'https://agentic-economy.invalid').protocol === 'https:'
    } catch {
      return false
    }
  }
  try {
    const parsed = new URL(trimmed)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0
  } catch {
    return false
  }
}

function descriptionFromOfferings(
  offerings: readonly { summary: string }[],
): string | undefined {
  const summaries = uniqueSorted(
    offerings
      .map((offering) => offering.summary.trim())
      .filter((summary) => summary.length > 0),
  )
  return summaries.length === 0 ? undefined : summaries.join(' ')
}

function domainFromPublicUrl(publicUrl: string): string | undefined {
  try {
    const parsed = new URL(publicUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    return parsed.hostname.length === 0 ? undefined : parsed.hostname
  } catch {
    return undefined
  }
}

/**
 * Availability sentinels are unpublished facts, so they stay absent rather
 * than being named in the public offering projection.
 */
const UNPUBLISHED_AVAILABILITY_SENTINELS: Readonly<Record<string, true>> = {
  'unknown': true,
  'hours unknown': true,
  'hours supplied by owner': true,
  'owner supplied hours': true,
  'owner confirmed hours are not listed yet': true,
  'after-hours availability supplied by owner': true,
}

function spreadAvailability(value: string | undefined): { availabilitySummary?: string } {
  const trimmed = value?.trim() ?? ''
  return trimmed.length === 0 || UNPUBLISHED_AVAILABILITY_SENTINELS[trimmed.toLowerCase()] === true
    ? {}
    : { availabilitySummary: trimmed }
}

function optionalText(value: string): string | undefined {
  return value.trim().length === 0 ? undefined : value
}
