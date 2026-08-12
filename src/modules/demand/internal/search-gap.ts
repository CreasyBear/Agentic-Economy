import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { normalizeSearchText } from '@/modules/common/normalize-search-text'

export const SearchGapFactValues = [
  'price',
  'availability',
  'location',
  'contact',
  'service_detail',
] as const

export type SearchGapFact = (typeof SearchGapFactValues)[number]

export const SearchGapSurfaceValues = [
  'catalog_api',
  'registry_ui',
  'answer_thread',
  'registry_action',
] as const

export type SearchGapSurface = (typeof SearchGapSurfaceValues)[number]

const factObservationValues = [
  'present',
  'absent',
  'unobservable',
] as const

export type FactObservation = (typeof factObservationValues)[number]

export type SearchGapCandidate = Readonly<{
  slug: string
  facts: Readonly<Record<SearchGapFact, FactObservation>>
}>

const factTriggers: Readonly<Partial<Record<SearchGapFact, ReadonlySet<string>>>> = {
  price: new Set([
    'price', 'prices', 'pricing', 'cost', 'costs', 'cheap', 'cheapest',
    'affordable', 'quote', 'quotes', 'rate', 'rates', 'fee', 'fees',
  ]),
  availability: new Set([
    'open', 'now', 'today', 'tonight', 'tomorrow', 'weekend', 'hours',
    'available', 'availability', 'emergency', 'urgent',
  ]),
  location: new Set(['near', 'nearby', 'close', 'local', 'around', 'within', 'km']),
  contact: new Set(['call', 'phone', 'contact', 'number', 'book', 'booking', 'appointment']),
}

export type SearchGapFactCount = Readonly<{ fact: SearchGapFact; searches: number }>

const toOrderedCounts = (totals: ReadonlyMap<SearchGapFact, number>): SearchGapFactCount[] =>
  SearchGapFactValues.flatMap((fact) => {
    const searches = totals.get(fact) ?? 0
    return searches === 0 ? [] : [{ fact, searches }]
  })

/**
 * Counts are per fact. A single shared counter would report the same number
 * for every fact on a row, which is the only number the owner surface shows.
 */
export function addFactObservations(
  existing: readonly SearchGapFactCount[],
  observed: readonly SearchGapFact[],
): SearchGapFactCount[] {
  const totals = new Map(existing.map((entry) => [entry.fact, entry.searches]))
  for (const fact of new Set(observed)) {
    totals.set(fact, (totals.get(fact) ?? 0) + 1)
  }
  return toOrderedCounts(totals)
}

export function mergeFactCounts(
  ...groups: readonly (readonly SearchGapFactCount[])[]
): SearchGapFactCount[] {
  const totals = new Map<SearchGapFact, number>()
  for (const entry of groups.flat()) {
    totals.set(entry.fact, (totals.get(entry.fact) ?? 0) + entry.searches)
  }
  return toOrderedCounts(totals)
}

export function rankFactCounts(
  counts: readonly SearchGapFactCount[],
): SearchGapFactCount[] {
  return counts.toSorted((left, right) =>
    right.searches - left.searches
    || SearchGapFactValues.indexOf(left.fact) - SearchGapFactValues.indexOf(right.fact))
}

const isNonEmpty = (value: string | undefined): boolean =>
  value !== undefined && value.trim().length > 0

const observe = (present: boolean): FactObservation => present ? 'present' : 'absent'

export function detectRequiredFacts(queryText: string): readonly SearchGapFact[] {
  const tokens = new Set(normalizeSearchText(queryText).split(' ').filter(Boolean))
  const required = new Set<SearchGapFact>(['service_detail'])

  for (const fact of SearchGapFactValues) {
    const triggers = factTriggers[fact]
    if (triggers !== undefined && [...tokens].some((token) => triggers.has(token))) {
      required.add(fact)
    }
  }
  if (queryText.includes('$')) required.add('price')

  return SearchGapFactValues.filter((fact) => required.has(fact))
}

export function evaluateSearchGaps(input: Readonly<{
  queryText: string
  candidates: readonly SearchGapCandidate[]
}>): Readonly<{
  requiredFacts: readonly SearchGapFact[]
  candidateCount: number
  gaps: readonly Readonly<{ slug: string; missingFacts: readonly SearchGapFact[] }>[]
}> {
  const requiredFacts = detectRequiredFacts(input.queryText)
  const gaps = input.candidates.slice(0, 5).flatMap((candidate) => {
    const missingFacts = requiredFacts.filter(
      (fact) => candidate.facts[fact] === 'absent',
    )
    return missingFacts.length === 0 ? [] : [{ slug: candidate.slug, missingFacts }]
  })

  return {
    requiredFacts,
    candidateCount: input.candidates.length,
    gaps,
  }
}

export function toSearchGapCandidateV2(
  dto: PublicBusinessCatalogApiV2Dto,
): SearchGapCandidate {
  const localHumanContext = dto.businessContext.kind === 'local_human'
    ? dto.businessContext
    : undefined
  return {
    slug: dto.slug,
    facts: {
      price: observe(dto.offerings.some((offering) => isNonEmpty(offering.pricingSummary))),
      availability: observe(dto.offerings.some((offering) => {
        const value = offering.availabilitySummary?.trim()
        return value !== undefined && value.length > 0 && value !== 'Hours supplied by owner'
      })),
      location: observe(
        localHumanContext !== undefined
        && isNonEmpty(localHumanContext.suburb)
        && isNonEmpty(localHumanContext.stateTerritory),
      ),
      contact: observe(
        isNonEmpty(localHumanContext?.publishedPhone)
        || dto.offerings.some((offering) => offering.accessPaths.length > 0),
      ),
      service_detail: observe(dto.offerings.some((offering) => isNonEmpty(offering.name))),
    },
  }
}


