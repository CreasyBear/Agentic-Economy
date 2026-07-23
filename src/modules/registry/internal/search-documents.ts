import { stableHash } from '@/modules/common/stable-hash'
import type { SourceHash } from '@/modules/common/ids'
import type { BusinessSupplyProjection } from '@/modules/catalog/public'
import type {
  PublicBusinessCatalogApiDto,
  PublicBusinessCatalogSearchInput,
} from './search'

/**
 * @offering-consumer-disposition split_legacy_v1_and_offering_v2
 *
 * The v1 document builder is an explicit migration-only source projection.
 * Native Offering-v2 search uses `buildOfferingV2RegistrySearchDocument` and
 * never converts an Offering action result into service identity or trust.
 */
type LegacyRegistryCatalogV1 = PublicBusinessCatalogApiDto

const RegistrySearchDocumentSchemaVersion = 'registry-search-document:v1' as const
export const OfferingV2RegistrySearchDocumentSchemaVersion = 'registry-search-document:v2' as const

export type RegistrySearchDocument = {
  documentId: string
  schemaVersion: typeof RegistrySearchDocumentSchemaVersion
  businessSlug: string
  serviceSlug: string
  businessName: string
  serviceName: string
  serviceCategory: string
  serviceCategoryKey: string
  suburb: string
  stateTerritory: string
  postcode?: string
  publicStatus: 'published'
  trustTier: LegacyRegistryCatalogV1['trustTier']
  firstRequestMode: LegacyRegistryCatalogV1['services'][number]['firstRequest']['mode']
  placeKeys: readonly string[]
  serviceKeywords: readonly string[]
  searchText: string
  serviceArea: string
  updatedAt: number
  generatedHash: SourceHash
}

export type OfferingV2RegistrySearchDocument = {
  documentId: string
  schemaVersion: typeof OfferingV2RegistrySearchDocumentSchemaVersion
  businessId: string
  businessSlug: string
  businessName: string
  businessCategory: string
  suburb: string
  stateTerritory: string
  postcode?: string
  publicStatus: 'published'
  placeKeys: readonly string[]
  searchText: string
  offerings: readonly {
    offeringRef: string
    revision: number
    name: string
    category: string
    summary: string
    comparison?: NonNullable<
      BusinessSupplyProjection['offerings'][number]['offering']['comparison']
    >
  }[]
  sourceRevision: number
  sourceDigest: SourceHash
  observedAt: number
  generatedHash: SourceHash
  updatedAt: number
}

export type RegistrySearchLocation = {
  label: string
  key: string
  source: 'input' | 'query'
}

const SEARCH_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'around',
  'at',
  'business',
  'businesses',
  'for',
  'find',
  'in',
  'near',
  'need',
  'now',
  'open',
  'provider',
  'providers',
  'service',
  'services',
  'the',
  'to',
])

const SERVICE_WORDS = new Set([
  ...SEARCH_STOP_WORDS,
  'appointment',
  'callout',
  'cleaner',
  'cleaners',
  'day',
  'dentist',
  'dentists',
  'diagnostic',
  'diagnostics',
  'electrician',
  'electricians',
  'emergency',
  'heat',
  'help',
  'hot',
  'locksmith',
  'locksmiths',
  'mechanic',
  'mechanics',
  'metro',
  'plumber',
  'plumbers',
  'plumbing',
  'pump',
  'repair',
  'repairs',
  'same',
  'suburb',
  'suburbs',
  'today',
  'tomorrow',
  'trade',
  'trades',
  'urgent',
  'water',
])

const STATE_WORDS = new Set(['act', 'nsw', 'nt', 'qld', 'sa', 'tas', 'vic', 'wa'])
const LOCATION_PREPOSITION = /\b(?:in|near|around|at)\s+([a-z][a-z\s'-]{1,80})(?:\?|$)/i

export function buildRegistrySearchDocumentsFromCatalogs(
  catalogs: readonly LegacyRegistryCatalogV1[],
): RegistrySearchDocument[] {
  return catalogs.flatMap((catalog) => buildRegistrySearchDocumentsForCatalog(catalog))
}

export function buildRegistrySearchDocumentsForCatalog(
  catalog: LegacyRegistryCatalogV1,
): RegistrySearchDocument[] {
  return catalog.services.map((service) => {
    const serviceKeywords = serviceKeywordsFor(service.name, service.category, service.summary)
    const placeKeys = placeKeysFor({
      suburb: catalog.suburb,
      stateTerritory: catalog.stateTerritory,
      ...(catalog.postcode === undefined ? {} : { postcode: catalog.postcode }),
      serviceArea: service.serviceArea,
    })
    const searchText = normalizeRegistrySearchText(
      [
        catalog.name,
        catalog.category,
        catalog.suburb,
        catalog.stateTerritory,
        catalog.postcode ?? '',
        service.name,
        service.category,
        service.summary,
        service.serviceArea,
        ...serviceKeywords,
      ].join(' '),
    )
    const documentCore = {
      businessSlug: catalog.slug,
      serviceSlug: service.slug,
      businessName: catalog.name,
      serviceName: service.name,
      serviceCategory: service.category,
      serviceCategoryKey: normalizePlaceKey(service.category),
      suburb: catalog.suburb,
      stateTerritory: catalog.stateTerritory,
      publicStatus: 'published' as const,
      trustTier: catalog.trustTier,
      firstRequestMode: service.firstRequest.mode,
      placeKeys,
      serviceKeywords,
      searchText,
      serviceArea: service.serviceArea,
      updatedAt: catalog.updatedAt,
    }

    return {
      documentId: buildRegistrySearchDocumentId(catalog.slug, service.slug),
      schemaVersion: RegistrySearchDocumentSchemaVersion,
      ...documentCore,
      ...(catalog.postcode === undefined ? {} : { postcode: catalog.postcode }),
      generatedHash: stableHash(documentCore),
    }
  })
}

export function buildOfferingV2RegistrySearchDocument(
  projection: BusinessSupplyProjection,
): OfferingV2RegistrySearchDocument {
  const offerings = projection.offerings.map(({ offering }) => ({
    offeringRef: offering.offeringRef,
    revision: offering.revision,
    name: offering.name,
    category: offering.category,
    summary: offering.summary,
    ...(offering.comparison === undefined ? {} : { comparison: offering.comparison }),
  }))
  const placeKeys = placeKeysFor({
    suburb: projection.business.suburb,
    stateTerritory: projection.business.stateTerritory,
    ...(projection.business.postcode === undefined
      ? {}
      : { postcode: projection.business.postcode }),
    serviceArea: projection.offerings
      .map(({ offering }) => offering.serviceAreaSummary ?? '')
      .join(' '),
  })
  const searchText = normalizeRegistrySearchText([
    projection.business.name,
    projection.business.category,
    projection.business.suburb,
    projection.business.stateTerritory,
    projection.business.postcode ?? '',
    ...projection.offerings.flatMap(({ offering }) => [
      offering.name,
      offering.category,
      offering.summary,
      offering.serviceAreaSummary ?? '',
      offering.availabilitySummary ?? '',
      offering.pricingSummary ?? '',
      ...comparisonSearchValues(offering.comparison),
    ]),
  ].join(' '))
  const documentCore = {
    businessId: projection.business.businessId,
    businessSlug: projection.business.slug,
    businessName: projection.business.name,
    businessCategory: projection.business.category,
    suburb: projection.business.suburb,
    stateTerritory: projection.business.stateTerritory,
    publicStatus: 'published' as const,
    placeKeys,
    searchText,
    offerings,
    sourceRevision: projection.sourceRevision,
    sourceDigest: projection.sourceDigest,
    observedAt: projection.observedAt,
    updatedAt: projection.observedAt,
  }
  return {
    documentId: `offering-v2__${projection.business.businessId.replace(/[^A-Za-z0-9_-]/gu, '_')}`,
    schemaVersion: OfferingV2RegistrySearchDocumentSchemaVersion,
    ...documentCore,
    ...(projection.business.postcode === undefined
      ? {}
      : { postcode: projection.business.postcode }),
    generatedHash: stableHash(documentCore),
  }
}

function comparisonSearchValues(
  comparison: BusinessSupplyProjection['offerings'][number]['offering']['comparison'],
): string[] {
  if (comparison === undefined) return []
  const facts = comparison.profile.profileId === 'professional_service:v1'
    ? [
        comparison.profile.scopeBasis,
        comparison.profile.priceBasis,
        comparison.profile.timingBasis,
        comparison.profile.serviceArea,
      ]
    : [
        comparison.profile.interfaceFormat,
        comparison.profile.requestMethod,
        comparison.profile.authentication,
        comparison.profile.priceBasis,
        comparison.profile.freshnessOrUpdateCadence,
      ]
  return [
    comparison.profile.profileId,
    ...facts.flatMap(searchValuesForFact),
  ]
}

function searchValuesForFact(
  fact: NonNullable<
    BusinessSupplyProjection['offerings'][number]['offering']['comparison']
  >['profile'] extends infer Profile
    ? Profile extends { profileId: string }
      ? Profile[Exclude<keyof Profile, 'profileId'>]
      : never
    : never,
): string[] {
  if (typeof fact !== 'object' || fact === null || !('kind' in fact)) return []
  if (fact.kind === 'unknown') return [fact.explanation]
  if (fact.kind === 'not_supplied') return []
  const value = fact.kind === 'known' ? fact.value : fact.lastKnown
  if (value === undefined) return []
  if (typeof value === 'string') return [value]
  return [
    value.description,
    value.currency ?? '',
    value.amountMinor === undefined ? '' : String(value.amountMinor),
    value.unit,
  ]
}

function buildRegistrySearchDocumentId(businessSlug: string, serviceSlug: string): string {
  return `${businessSlug}__${serviceSlug}`
}

export function resolveRegistrySearchLocation(
  input: Pick<PublicBusinessCatalogSearchInput, 'query' | 'location' | 'mode'>,
): RegistrySearchLocation | undefined {
  if (input.mode === 'whole_catalogue') {
    return undefined
  }

  const explicit = normalizeLocationLabel(input.location)
  if (explicit !== undefined) {
    return { label: explicit, key: normalizePlaceKey(explicit), source: 'input' }
  }

  const fromQuery = extractLocationFromRegistryQuery(input.query)
  if (fromQuery === undefined) {
    return undefined
  }

  return { label: fromQuery, key: normalizePlaceKey(fromQuery), source: 'query' }
}

export function documentMatchesRegistryQuery(
  document: RegistrySearchDocument,
  input: PublicBusinessCatalogSearchInput,
): boolean {
  const query = normalizeRegistrySearchText(input.query)
  if (query.length === 0) {
    return false
  }

  const stateKey = normalizePlaceKey(document.stateTerritory)
  const queryNamesDocumentPlace = document.placeKeys.some((placeKey) =>
    placeKey !== stateKey && ` ${query} `.includes(` ${placeKey} `),
  )
  const location = resolveRegistrySearchLocation(input)
  if (
    location !== undefined &&
    (location.source === 'input' || !queryNamesDocumentPlace) &&
    !document.placeKeys.includes(location.key)
  ) {
    return false
  }

  const tokens = query
    .split(' ')
    .filter((token) => !SEARCH_STOP_WORDS.has(token))
    .map(normalizeSearchToken)
  const serviceIntentTokens = tokens.filter((token) => token === 'plumbing' || token === 'electrical')
  if (serviceIntentTokens.length > 0) {
    return serviceIntentTokens.some((token) => document.searchText.includes(token))
  }
  return tokens.every((token) => document.searchText.includes(token))
}

export function normalizeRegistrySearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function normalizePlaceKey(value: string): string {
  return normalizeRegistrySearchText(value)
}

function normalizeSearchToken(token: string): string {
  if (token === 'plumber' || token === 'plumbers') {
    return 'plumbing'
  }
  if (token === 'electrician' || token === 'electricians') {
    return 'electrical'
  }
  return token
}

function placeKeysFor(input: {
  suburb: string
  stateTerritory: string
  postcode?: string
  serviceArea: string
}): readonly string[] {
  const keys = new Set<string>()
  addKey(keys, input.suburb)
  addKey(keys, `${input.suburb} ${input.stateTerritory}`)
  addKey(keys, input.stateTerritory)
  if (input.postcode !== undefined) {
    addKey(keys, input.postcode)
  }

  for (const candidate of extractPlaceCandidates(input.serviceArea)) {
    addKey(keys, candidate)
  }

  return [...keys].sort()
}

function serviceKeywordsFor(...values: readonly string[]): readonly string[] {
  const text = normalizeRegistrySearchText(values.join(' '))
  const keywords = new Set<string>()
  if (/\bplumbing\b/.test(text)) {
    keywords.add('plumber')
    keywords.add('plumbers')
  }
  if (/\blocksmith\b/.test(text)) {
    keywords.add('locksmiths')
  }
  if (/\belectrician\b/.test(text)) {
    keywords.add('electricians')
  }
  if (/\bemergency\b/.test(text)) {
    keywords.add('urgent')
  }
  return [...keywords].sort()
}

function extractLocationFromRegistryQuery(query: string): string | undefined {
  const normalized = normalizeLocationLabel(query)
  if (normalized === undefined) {
    return undefined
  }

  const prepositionMatch = normalized.match(LOCATION_PREPOSITION)
  if (prepositionMatch?.[1] !== undefined) {
    return normalizeLocationLabel(prepositionMatch[1])
  }

  const tokens = normalized.split(/\s+/).filter(Boolean)
  const withoutState = dropTrailingState(tokens)
  const candidate = trimServiceWords(withoutState).join(' ')
  return normalizeLocationLabel(candidate)
}

function extractPlaceCandidates(value: string): readonly string[] {
  const normalized = normalizeRegistrySearchText(value)
  if (normalized.length === 0) {
    return []
  }

  const rawCandidates = normalized
    .replace(/\band nearby suburbs\b/g, '|')
    .replace(/\bnearby suburbs\b/g, '|')
    .replace(/\bmetro\b/g, ' metro|')
    .split(/[|,;/]+/g)
    .map((candidate) => trimServiceWords(candidate.split(/\s+/).filter(Boolean)).join(' '))
    .map((candidate) => candidate.replace(/\bmetro\b/g, '').trim())
    .filter((candidate) => candidate.length >= 3)

  return rawCandidates
}

function normalizeLocationLabel(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const words = value
    .trim()
    .replace(/[^a-z0-9\s'-]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !STATE_WORDS.has(word.toLowerCase()))

  while (words.length > 0 && SERVICE_WORDS.has(words[0]!.toLowerCase())) {
    words.shift()
  }
  while (words.length > 0 && SERVICE_WORDS.has(words.at(-1)!.toLowerCase())) {
    words.pop()
  }

  const label = words.join(' ').trim()
  return label.length >= 3 ? label : undefined
}

function dropTrailingState(tokens: readonly string[]): readonly string[] {
  const last = tokens.at(-1)?.toLowerCase()
  return last !== undefined && STATE_WORDS.has(last) ? tokens.slice(0, -1) : tokens
}

function trimServiceWords(tokens: readonly string[]): readonly string[] {
  let start = 0
  let end = tokens.length
  while (start < end && SERVICE_WORDS.has(tokens[start]!.toLowerCase())) {
    start += 1
  }
  while (end > start && SERVICE_WORDS.has(tokens[end - 1]!.toLowerCase())) {
    end -= 1
  }
  return tokens.slice(start, end)
}

function addKey(keys: Set<string>, value: string): void {
  const key = normalizePlaceKey(value)
  if (key.length > 0) {
    keys.add(key)
  }
}
