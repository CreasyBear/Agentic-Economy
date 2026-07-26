import { describe, expect, it } from 'vitest'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/internal/offering-api-projection'
import type { PublicBusinessCatalogApiDto } from '@/modules/registry/internal/search'
import {
  addFactObservations,
  detectRequiredFacts,
  evaluateSearchGaps,
  mergeFactCounts,
  rankFactCounts,
  toSearchGapCandidateV1,
  toSearchGapCandidateV2,
} from '@/modules/demand/public'
import type {
  FactObservation,
  SearchGapCandidate,
  SearchGapFact,
} from '@/modules/demand/public'

const candidate = (
  slug: string,
  facts: Partial<Record<SearchGapFact, FactObservation>>,
): SearchGapCandidate => ({
  slug,
  facts: {
    price: 'present',
    availability: 'present',
    location: 'present',
    contact: 'present',
    service_detail: 'present',
    ...facts,
  },
})

const v2Dto = (availabilitySummary?: string): PublicBusinessCatalogApiV2Dto => ({
  schemaVersion: 'public-business-catalog-api:v2',
  businessId: 'business-1',
  slug: 'adelaide-dental',
  name: 'Adelaide Dental',
  category: 'Dentist',
  suburb: 'Adelaide',
  stateTerritory: 'SA',
  publishedPhone: '08 7000 0000',
  publicUrl: '/business/adelaide-dental',
  trustTier: 'claimed',
  photos: [],
  observedAt: 1,
  disposition: 'current',
  offerings: [{
    offeringRef: 'offering-1',
    revision: 1,
    name: 'Dental checkup',
    category: 'Dentist',
    summary: 'Routine dental checkup',
    ...(availabilitySummary === undefined ? {} : { availabilitySummary }),
    accessPaths: [],
    support: { integrated: false, aeSupportedAction: false },
  }],
  accessSummary: {
    humanRequest: false,
    externalOperation: false,
    aeSupportedAction: false,
  },
})

const v1Dto = (
  publicChannel: PublicBusinessCatalogApiDto['services'][number]['firstRequest']['publicChannel'] = 'public_business_contact',
): PublicBusinessCatalogApiDto => ({
  slug: 'adelaide-dental',
  name: 'Adelaide Dental',
  category: 'Dentist',
  suburb: 'Adelaide',
  stateTerritory: 'SA',
  publicUrl: '/business/adelaide-dental',
  trustTier: 'claimed',
  publicStatus: 'published',
  indexStatus: 'indexed',
  discoveryStatus: 'available',
  schemaVersion: 'public-business-catalog-api:v1',
  updatedAt: 1,
  photos: [],
  services: [{
    slug: 'checkup',
    name: 'Dental checkup',
    category: 'Dentist',
    summary: 'Routine dental checkup',
    serviceArea: 'Adelaide',
    hoursOrUnknown: 'Weekdays',
    firstRequest: {
      mode: publicChannel === 'not_available' ? 'not_available_yet' : 'inquiry_available',
      publicDisclosure: 'Call the practice',
      publicChannel,
    },
    status: 'published',
    capabilities: [],
  }],
})

describe('search gap fact detection', () => {
  it('detects price language and the base service-detail requirement', () => {
    const facts = detectRequiredFacts('cheapest dental checkup adelaide')
    expect(facts).toContain('price')
    expect(facts).toContain('service_detail')
    expect(facts).not.toContain('availability')
  })

  it('returns only the base requirement for an ordinary category query', () => {
    expect(detectRequiredFacts('dentist adelaide')).toEqual(['service_detail'])
  })

  it('detects availability language', () => {
    expect(detectRequiredFacts('emergency plumber open now')).toContain('availability')
  })

  it('detects dollar signs as price intent', () => {
    expect(detectRequiredFacts('under $200 haircut')).toContain('price')
  })
})

describe('search gap candidate projections', () => {
  it('treats the seeded hours placeholder as absent availability', () => {
    expect(toSearchGapCandidateV2(v2Dto('Hours supplied by owner')).facts.availability).toBe('absent')
  })

  it('marks price as unobservable in the V1 projection', () => {
    expect(toSearchGapCandidateV1(v1Dto()).facts.price).toBe('unobservable')
  })

  it('marks an unavailable V1 request channel as absent contact', () => {
    expect(toSearchGapCandidateV1(v1Dto('not_available')).facts.contact).toBe('absent')
  })
})

describe('search gap evaluation', () => {
  it('never attributes an unobservable fact to a business', () => {
    expect(evaluateSearchGaps({
      queryText: 'price',
      candidates: [candidate('one', { price: 'unobservable' })],
    }).gaps).toEqual([])
  })

  it('keeps requirements when no candidates exist', () => {
    expect(evaluateSearchGaps({ queryText: 'price', candidates: [] })).toEqual({
      requiredFacts: ['price', 'service_detail'],
      candidateCount: 0,
      gaps: [],
    })
  })

  it('caps attributed gaps at five while retaining the full candidate count', () => {
    const result = evaluateSearchGaps({
      queryText: 'price',
      candidates: Array.from({ length: 11 }, (_, index) =>
        candidate(`business-${index}`, { price: 'absent' })),
    })
    expect(result.gaps).toHaveLength(5)
    expect(result.candidateCount).toBe(11)
  })
})

describe('search gap fact counting', () => {
  it('counts each fact separately instead of sharing one counter', () => {
    let counts = addFactObservations([], ['price'])
    for (let index = 0; index < 5; index += 1) {
      counts = addFactObservations(counts, ['availability'])
    }

    expect(counts).toEqual([
      { fact: 'price', searches: 1 },
      { fact: 'availability', searches: 5 },
    ])
  })

  it('counts a fact once per observation even when repeated in one search', () => {
    expect(addFactObservations([], ['price', 'price'])).toEqual([
      { fact: 'price', searches: 1 },
    ])
  })

  it('sums counts across days without collapsing them', () => {
    expect(mergeFactCounts(
      [{ fact: 'price', searches: 2 }],
      [{ fact: 'price', searches: 3 }, { fact: 'contact', searches: 1 }],
    )).toEqual([
      { fact: 'price', searches: 5 },
      { fact: 'contact', searches: 1 },
    ])
  })

  it('ranks by frequency then declaration order', () => {
    expect(rankFactCounts([
      { fact: 'contact', searches: 4 },
      { fact: 'price', searches: 4 },
      { fact: 'availability', searches: 9 },
    ])).toEqual([
      { fact: 'availability', searches: 9 },
      { fact: 'price', searches: 4 },
      { fact: 'contact', searches: 4 },
    ])
  })
})
