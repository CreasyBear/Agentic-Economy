import { canonicalDigest } from '@/modules/common/canonical-digest'
import { normalizeSearchText } from '@/modules/common/normalize-search-text'
import {
  canonicalTradeToken,
  TRADE_CANONICAL_TOKENS,
  TRADE_WORDS,
  tradeAliasesForText,
} from './trade-vocabulary'
import type {
  PublicBusinessCatalogApiV2Dto,
  PublicBusinessCatalogSearchInput,
  RegistrySearchDocumentContract,
} from '@/modules/registry/public'

const RegistrySearchDocumentSchemaVersion: RegistrySearchDocumentContract['schemaVersion'] = 'registry-search-document:v1'

export type RegistrySearchDocument = RegistrySearchDocumentContract
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
export function registrySearchTokens(query: string): readonly string[] {
  return normalizeSearchText(query)
    .split(' ')
    .filter((token) => token.length > 0 && !SEARCH_STOP_WORDS.has(token))
    .map(canonicalTradeToken)
}


// Every trade alias is a service word by construction. Listing them by hand is
// how `electrical` and `sparky` came to be parsed as suburb names and filtered
// the whole result set away.
const SERVICE_WORDS = new Set([
  ...SEARCH_STOP_WORDS,
  ...TRADE_WORDS,
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
  'this',
  'week',
  'weeks',
])

const STATE_WORDS = new Set(['act', 'nsw', 'nt', 'qld', 'sa', 'tas', 'vic', 'wa'])
const LOCATION_PREPOSITION = /\b(?:in|near|around|at)\s+([a-z][a-z\s'-]{1,80})(?:\?|$)/i

export function buildRegistrySearchDocumentsFromCatalogs(
  catalogs: readonly PublicBusinessCatalogApiV2Dto[],
): RegistrySearchDocument[] {
  return catalogs.flatMap((catalog) => buildRegistrySearchDocumentsForCatalog(catalog))
}

export function buildRegistrySearchDocumentsForCatalog(
  catalog: PublicBusinessCatalogApiV2Dto,
): RegistrySearchDocument[] {
  return catalog.offerings.map((offering) => {
    const offeringRef = offering.offeringRef as RegistrySearchDocument['offeringRef']
    const keywords = offeringKeywordsFor(offering.name, offering.category, offering.summary)
    const businessContext = catalog.businessContext
    const providerTerms = businessContext.kind === 'programmable_provider'
      ? [businessContext.website, businessContext.providerIdentifier]
      : []
    const serviceAreaSummary = offering.serviceAreaSummary ?? ''
    const placeKeys = businessContext.kind === 'local_human'
      ? placeKeysFor({
          suburb: businessContext.suburb,
          stateTerritory: businessContext.stateTerritory,
          serviceAreaSummary,
          ...(businessContext.postcode === undefined ? {} : { postcode: businessContext.postcode }),
        })
      : []
    const searchText = normalizeSearchText([
      catalog.name,
      catalog.category,
      ...providerTerms,
      ...(businessContext.kind === 'local_human'
        ? [businessContext.suburb, businessContext.stateTerritory, businessContext.postcode ?? '']
        : []),
      offering.name,
      offering.category,
      offering.summary,
      serviceAreaSummary,
      ...keywords,
    ].join(' '))
    const documentCore = {
      businessSlug: catalog.slug,
      offeringRef,
      businessName: catalog.name,
      name: offering.name,
      category: offering.category,
      categoryKey: normalizeSearchText(offering.category),
      businessContext,
      publicStatus: 'published' as const,
      trustTier: catalog.trustTier,
      firstRequestMode: offering.accessPaths.some((path) => path.kind === 'human_request' && path.channel === 'ae_inquiry')
        ? 'inquiry_available' as const
        : 'not_available_yet' as const,
      placeKeys,
      keywords,
      searchText,
      serviceAreaSummary,
      updatedAt: catalog.observedAt,
    }

    return {
      documentId: buildRegistrySearchDocumentId(catalog.slug, offeringRef),
      schemaVersion: RegistrySearchDocumentSchemaVersion,
      ...documentCore,
      generatedHash: canonicalDigest(documentCore),
    }
  })
}

function buildRegistrySearchDocumentId(businessSlug: string, offeringRef: string): string {
  const offeringSlug = offeringRef.split(':').at(-1) ?? offeringRef
  return `${businessSlug}__${offeringSlug}`
}

export function resolveRegistrySearchLocation(
  input: Pick<PublicBusinessCatalogSearchInput, 'query' | 'location' | 'mode'>,
): RegistrySearchLocation | undefined {
  if (input.mode === 'whole_catalogue') {
    return undefined
  }

  const explicit = normalizeLocationLabel(input.location)
  if (explicit !== undefined) {
    return { label: explicit, key: normalizeSearchText(explicit), source: 'input' }
  }

  const fromQuery = extractLocationFromRegistryQuery(input.query)
  if (fromQuery === undefined) {
    return undefined
  }

  return { label: fromQuery, key: normalizeSearchText(fromQuery), source: 'query' }
}

export function documentMatchesRegistryQuery(
  document: RegistrySearchDocument,
  input: PublicBusinessCatalogSearchInput,
): boolean {
  const query = normalizeSearchText(input.query)
  if (query.length === 0) {
    return false
  }

  const stateKey = document.businessContext.kind === 'local_human'
    ? normalizeSearchText(document.businessContext.stateTerritory)
    : ''
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

  const tokens = registrySearchTokens(query)
  if (tokens.length === 0) {
    return false
  }
  const serviceIntentTokens = tokens.filter((token) => TRADE_CANONICAL_TOKENS.has(token))
  if (serviceIntentTokens.length > 0) {
    return serviceIntentTokens.some((token) => document.searchText.includes(token))
  }
  return tokens.every((token) => document.searchText.includes(token))
}



function placeKeysFor(input: {
  suburb: string
  stateTerritory: string
  postcode?: string
  serviceAreaSummary: string
}): readonly string[] {
  const keys = new Set<string>()
  addKey(keys, input.suburb)
  addKey(keys, `${input.suburb} ${input.stateTerritory}`)
  addKey(keys, input.stateTerritory)
  if (input.postcode !== undefined) {
    addKey(keys, input.postcode)
  }

  for (const candidate of extractPlaceCandidates(input.serviceAreaSummary)) {
    addKey(keys, candidate)
  }

  return [...keys].sort()
}

function offeringKeywordsFor(...values: readonly string[]): readonly string[] {
  const text = normalizeSearchText(values.join(' '))
  const keywords = new Set<string>(tradeAliasesForText(text))
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
  const normalized = normalizeSearchText(value)
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
  return isPlausiblePlaceLabel(label) ? label : undefined
}

/**
 * Whatever survives service-word trimming is treated as a place, so free text
 * like "someone today under 500" became a suburb and filtered every result away.
 *
 * Only digits are rejected, deliberately. A long leftover label is still
 * load-bearing: `documentMatchesRegistryQuery` keeps a document whose own place
 * name appears anywhere in the query and drops the rest, so the label's job is
 * to signal "this query named somewhere", not to be a clean suburb. Rejecting
 * multi-word labels here silently disables that narrowing and a query naming a
 * suburb starts returning every other suburb too.
 */
function isPlausiblePlaceLabel(label: string): boolean {
  return label.length >= 3 && !/\d/.test(label)
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
  const key = normalizeSearchText(value)
  if (key.length > 0) {
    keys.add(key)
  }
}
