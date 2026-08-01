import type { AnswerSource } from '../answer-synthesizer'
import {
  aeSearchContextLocationQuery,
  type AeSearchContext,
} from '../search-context'

const SERVICE_WORDS = new Set([
  'a',
  'accept',
  'accepts',
  'after',
  'an',
  'business',
  'businesses',
  'cleaner',
  'cleaners',
  'day',
  'dentist',
  'dentists',
  'done',
  'electrician',
  'electricians',
  'emergency',
  'find',
  'filter',
  'for',
  'has',
  'have',
  'hot',
  'inquiry',
  'inquiries',
  'listed',
  'listing',
  'listings',
  'looking',
  'locksmith',
  'locksmiths',
  'mechanic',
  'mechanics',
  'narrow',
  'need',
  'no',
  'now',
  'ones',
  'open',
  'option',
  'options',
  'plumber',
  'plumbers',
  'plumbing',
  'provider',
  'providers',
  'repair',
  'repairs',
  'same',
  'service',
  'services',
  'show',
  'take',
  'takes',
  'that',
  'the',
  'to',
  'today',
  'tomorrow',
  'trade',
  'trades',
  'urgent',
  'water',
  'which',
  'with',
  'this',
  'week',
  'weeks',
])

const STATE_WORDS = new Set(['act', 'nsw', 'nt', 'qld', 'sa', 'tas', 'vic', 'wa'])
const LOCATION_PREPOSITION = /\b(?:in|near|around|at)\s+([a-z][a-z\s'-]{1,80})(?:\?|$)/i

export type ProviderLocationFilterResult = {
  providers: AnswerSource[]
  rejectedProviders: AnswerSource[]
  location: string | undefined
  locationSource: 'context' | 'tool' | 'user' | undefined
  filtered: boolean
}

export function filterProvidersForRequestedLocation(input: {
  providers: readonly AnswerSource[]
  userQuery: string
  toolQuery?: string
  searchContext?: AeSearchContext | undefined
}): ProviderLocationFilterResult {
  const toolLocation = input.toolQuery === undefined ? undefined : extractRequestedLocation(input.toolQuery)
  const userLocation = extractRequestedLocation(input.userQuery)
  const contextLocation = aeSearchContextLocationQuery(input.searchContext)
  const resolved = resolveRequestedLocation({ userLocation, contextLocation, toolLocation })
  const { location, locationSource } = resolved

  if (location === undefined) {
    return {
      providers: reindexProviders(input.providers),
      rejectedProviders: [],
      location: undefined,
      locationSource: undefined,
      filtered: false,
    }
  }

  const filtered = input.providers.filter((provider) => providerMatchesLocation(provider, location))
  const keptSlugs = new Set(filtered.map((provider) => provider.slug))
  const rejected = input.providers.filter((provider) => !keptSlugs.has(provider.slug))
  return {
    providers: reindexProviders(filtered),
    rejectedProviders: rejected,
    location,
    locationSource,
    filtered: filtered.length !== input.providers.length,
  }
}

export function extractRequestedLocation(query: string): string | undefined {
  const normalized = query
    .trim()
    .replace(/[^a-z0-9\s'-]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (normalized.length === 0) {
    return undefined
  }

  const prepositionMatch = normalized.match(LOCATION_PREPOSITION)
  if (prepositionMatch?.[1] !== undefined) {
    return normalizeLocationCandidate(prepositionMatch[1])
  }

  const tokens = normalized.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return undefined
  }

  const withoutState = dropTrailingState(tokens)
  const candidate = trimServiceWords(withoutState).join(' ')
  if (candidate.length === 0) {
    return undefined
  }

  return normalizeLocationCandidate(candidate)
}

function resolveRequestedLocation(input: {
  userLocation: string | undefined
  contextLocation: string | undefined
  toolLocation: string | undefined
}): Pick<ProviderLocationFilterResult, 'location' | 'locationSource'> {
  const { userLocation, contextLocation, toolLocation } = input

  if (userLocation === undefined && contextLocation === undefined && toolLocation === undefined) {
    return { location: undefined, locationSource: undefined }
  }

  if (userLocation === undefined && contextLocation !== undefined) {
    return { location: contextLocation, locationSource: 'context' }
  }

  if (userLocation === undefined) {
    return { location: toolLocation, locationSource: 'tool' }
  }
  if (toolLocation === undefined) {
    return { location: userLocation, locationSource: 'user' }
  }

  if (normalizeComparable(userLocation) === normalizeComparable(toolLocation)) {
    return { location: toolLocation, locationSource: 'tool' }
  }

  if (isLikelyModelCorrection(userLocation, toolLocation)) {
    return { location: toolLocation, locationSource: 'tool' }
  }

  return { location: userLocation, locationSource: 'user' }
}

function normalizeLocationCandidate(candidate: string): string | undefined {
  const words = candidate
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

  const value = words.join(' ').trim()
  return value.length >= 3 ? value : undefined
}

function dropTrailingState(tokens: readonly string[]): readonly string[] {
  const last = tokens.at(-1)?.toLowerCase()
  if (last !== undefined && STATE_WORDS.has(last)) {
    return tokens.slice(0, -1)
  }
  return tokens
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

function providerMatchesLocation(provider: AnswerSource, location: string): boolean {
  const needle = normalizeComparable(location)
  if (needle.length === 0) {
    return false
  }

  const haystacks = [
    provider.suburb,
    provider.serviceArea,
  ].map(normalizeComparable)

  return haystacks.some((haystack) => containsTokenPhrase(haystack, needle))
}

function containsTokenPhrase(haystack: string, needle: string): boolean {
  return (
    haystack === needle ||
    haystack.startsWith(`${needle} `) ||
    haystack.endsWith(` ${needle}`) ||
    haystack.includes(` ${needle} `)
  )
}

function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeEditKey(value: string): string {
  return normalizeComparable(value).replace(/\s+/g, '')
}

function isLikelyModelCorrection(userLocation: string, toolLocation: string): boolean {
  const userKey = normalizeEditKey(userLocation)
  const toolKey = normalizeEditKey(toolLocation)
  if (userKey.length < 5 || toolKey.length < 5) {
    return false
  }

  const distance = levenshteinDistance(userKey, toolKey)
  const longest = Math.max(userKey.length, toolKey.length)
  const maxDistance = longest <= 8 ? 2 : 3
  return distance <= maxDistance && distance / longest <= 0.34
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  const current = Array.from({ length: right.length + 1 }, () => 0)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      current[rightIndex] = Math.min(
        previous[rightIndex]! + 1,
        current[rightIndex - 1]! + 1,
        previous[rightIndex - 1]! + substitutionCost,
      )
    }
    previous.splice(0, previous.length, ...current)
  }

  return previous[right.length] ?? 0
}

function reindexProviders(providers: readonly AnswerSource[]): AnswerSource[] {
  return providers.map((provider, index) => ({
    ...provider,
    citationIndex: index + 1,
  }))
}
