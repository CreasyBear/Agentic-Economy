import type { Doc } from '../../../_generated/dataModel'
import type { OfferingSupplyDto } from './contracts'
import { SEARCH_STOP_WORDS, normalizeSearchText } from '../../../../src/modules/common/normalize-search-text'

export function matchesOfferingSupply(item: OfferingSupplyDto, tokens: readonly string[], locationKey: string | undefined): boolean {
  if (tokens.length === 0) return false
  if (locationKey !== undefined && !offeringPlaceKeys(item).includes(locationKey)) return false
  const contextTerms = item.businessContext.kind === 'local_human'
    ? [item.businessContext.suburb, item.businessContext.stateTerritory, item.businessContext.postcode ?? '']
    : [item.businessContext.website, item.businessContext.providerIdentifier]
  const haystack = normalizeSearchText([
    item.slug,
    item.name,
    item.category,
    ...contextTerms,
    ...item.offerings.flatMap((offering) => [offering.name, offering.category, offering.summary, offering.serviceAreaSummary ?? '']),
  ].join(' '))
  return matchesQueryTokens(haystack, tokens)
}


export function matchesSearchDocument(document: Doc<'registrySearchDocuments'>, tokens: readonly string[], locationKey: string | undefined): boolean {
  if (tokens.length === 0) return false
  if (locationKey !== undefined && !document.placeKeys.includes(locationKey)) return false
  return matchesQueryTokens(document.searchText, tokens)
}

export function uniqueBusinessSlugs(documents: readonly Doc<'registrySearchDocuments'>[]): string[] {
  const slugs = new Set<string>()
  for (const document of documents) if (document.businessSlug.length > 0) slugs.add(document.businessSlug)
  return [...slugs]
}

function offeringPlaceKeys(item: OfferingSupplyDto): readonly string[] {
  if (item.businessContext.kind !== 'local_human') return []
  const keys = new Set<string>()
  addPlaceKey(keys, item.businessContext.suburb)
  addPlaceKey(keys, `${item.businessContext.suburb} ${item.businessContext.stateTerritory}`)
  addPlaceKey(keys, item.businessContext.stateTerritory)
  if (item.businessContext.postcode !== undefined) addPlaceKey(keys, item.businessContext.postcode)
  for (const offering of item.offerings) for (const candidate of extractPlaceCandidates(offering.serviceAreaSummary ?? '')) addPlaceKey(keys, candidate)
  return [...keys]
}

const REGISTRY_STOP_WORDS = new Set([
  ...SEARCH_STOP_WORDS,
  'around',
  'business',
  'businesses',
  'near',
  'now',
  'open',
  'provider',
  'providers',
  'service',
  'services',
])
const SERVICE_WORDS = new Set([
  ...REGISTRY_STOP_WORDS,
  'appointment',
  'callout',
  'cleaner',
  'cleaners',
  'day',
  'dental',
  'dentist',
  'dentists',
  'diagnostic',
  'diagnostics',
  'electrical',
  'electrician',
  'electricians',
  'emergency',
  'help',
  'listed',
  'listing',
  'listings',
  'locksmith',
  'locksmiths',
  'mechanic',
  'mechanics',
  'metro',
  'offering',
  'offerings',
  'plumber',
  'plumbers',
  'plumbing',
  'repair',
  'repairs',
  'same',
  'suburb',
  'suburbs',
  'today',
  'tomorrow',
  'urgent',
  'week',
  'weeks',
])
const STATE_WORDS = new Set(['act', 'nsw', 'nt', 'qld', 'sa', 'tas', 'vic', 'wa'])
const LOCATION_PREPOSITION = /\b(?:in|near|around|at)\s+([a-z][a-z\s'-]{1,80})(?:\?|$)/i

function matchesQueryTokens(haystack: string, tokens: readonly string[]): boolean { return tokens.every((token) => haystack.includes(token)) }
export function resolveSearchLocationKey(input: { query: string; mode?: string; location?: string }): string | undefined { if (input.mode === 'whole_catalogue') return undefined; const explicit = normalizeLocationLabel(input.location); if (explicit !== undefined) return normalizeSearchText(explicit); const fromQuery = extractLocationFromQuery(input.query); return fromQuery === undefined ? undefined : normalizeSearchText(fromQuery) }
function extractLocationFromQuery(query: string): string | undefined {
  const prepositionMatch = normalizeSearchText(query).match(LOCATION_PREPOSITION)
  if (prepositionMatch?.[1] !== undefined) return normalizeLocationLabel(prepositionMatch[1])
  const normalized = normalizeLocationLabel(query)
  if (normalized === undefined) return undefined
  const tokens = dropTrailingState(normalized.split(/\s+/).filter(Boolean))
  const locationTokens = trimServiceWords(tokens)
  return locationTokens.length === tokens.length
    ? undefined
    : normalizeLocationLabel(locationTokens.join(' '))
}
function extractPlaceCandidates(value: string): readonly string[] { const normalized = normalizeSearchText(value); if (normalized.length === 0) return []; return normalized.replace(/\band nearby suburbs\b/g, '|').replace(/\bnearby suburbs\b/g, '|').replace(/\bmetro\b/g, ' metro|').split(/[|,;/]+/g).map((candidate) => trimServiceWords(candidate.split(/\s+/).filter(Boolean)).join(' ')).map((candidate) => candidate.replace(/\bmetro\b/g, '').trim()).filter((candidate) => candidate.length >= 3) }
function normalizeLocationLabel(value: string | undefined): string | undefined { if (value === undefined) return undefined; const words = value.trim().replace(/[^a-z0-9\s'-]+/gi, ' ').replace(/\s+/g, ' ').split(/\s+/).filter(Boolean).filter((word) => !STATE_WORDS.has(word.toLowerCase())); while (words.length > 0) { const first = words[0]; if (first === undefined || !SERVICE_WORDS.has(first.toLowerCase())) break; words.shift() } while (words.length > 0) { const last = words.at(-1); if (last === undefined || !SERVICE_WORDS.has(last.toLowerCase())) break; words.pop() } const label = words.join(' ').trim(); if (label.length < 3 || /\d/.test(label)) return undefined; return label }
function dropTrailingState(tokens: readonly string[]): readonly string[] { const last = tokens.at(-1)?.toLowerCase(); return last !== undefined && STATE_WORDS.has(last) ? tokens.slice(0, -1) : tokens }
function trimServiceWords(tokens: readonly string[]): readonly string[] { let start = 0; let end = tokens.length; while (start < end) { const token = tokens[start]; if (token === undefined || !SERVICE_WORDS.has(token.toLowerCase())) break; start += 1 } while (end > start) { const token = tokens[end - 1]; if (token === undefined || !SERVICE_WORDS.has(token.toLowerCase())) break; end -= 1 } return tokens.slice(start, end) }
function addPlaceKey(keys: Set<string>, value: string): void { const key = normalizeSearchText(value); if (key.length > 0) keys.add(key) }

