import { describe, expect, it } from 'vitest'

import {
  buildRegistrySearchDocumentsForCatalog,
  documentMatchesRegistryQuery,
} from '@/modules/registry/internal/search-documents'
import { canonicalTradeToken, TRADE_VOCABULARY, TRADE_WORDS, tradeAliasesForText } from '@/modules/registry/internal/trade-vocabulary'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

function catalogFor(slug: string, name: string, category: string, offeringName: string, summary: string): PublicBusinessCatalogApiV2Dto {
  return {
    schemaVersion: 'public-business-catalog-api:v2',
    businessId: `business:${slug}`,
    slug,
    name,
    category,
    suburb: 'Adelaide',
    stateTerritory: 'SA',
    publicUrl: `/${slug}`,
    trustTier: 'claimed',
    observedAt: 1,
    disposition: 'current',
    photos: [],
    offerings: [{
      offeringRef: `offering:${slug}:primary-service`,
      revision: 1,
      name: offeringName,
      category,
      summary,
      serviceAreaSummary: 'Adelaide and nearby suburbs',
      accessPaths: [],
      support: { integrated: false, aeSupportedAction: false },
    }],
    accessSummary: { humanRequest: false, externalOperation: false, aeSupportedAction: false },
  }
}

const electrical = buildRegistrySearchDocumentsForCatalog(
  catalogFor('a-elec', 'Adelaide Electrical Repairs', 'Electrical repairs', 'Electrical fault repairs', 'Fixes electrical faults.')
)[0]!
const plumbing = buildRegistrySearchDocumentsForCatalog(
  catalogFor('a-plumb', 'Adelaide Emergency Plumbing', 'Emergency plumbing', 'Emergency plumbing', 'Burst pipe triage.')
)[0]!

describe('trade vocabulary bridges customer words to published supply', () => {
  /**
   * Regression: `electrician` returned zero results live while `electrical`
   * returned nine, because index-side expansion was keyed on the practitioner
   * noun that published supply never contains.
   */
  it.each(['electrician', 'electricians', 'electrical', 'sparky'])(
    'matches the electrical business for %s',
    (query) => {
      expect(documentMatchesRegistryQuery(electrical, { query })).toBe(true)
    }
  )

  it.each(['plumber', 'plumbers', 'plumbing'])('matches the plumbing business for %s', (query) => {
    expect(documentMatchesRegistryQuery(plumbing, { query })).toBe(true)
  })

  it('does not bleed one trade into another', () => {
    expect(documentMatchesRegistryQuery(electrical, { query: 'plumber' })).toBe(false)
    expect(documentMatchesRegistryQuery(plumbing, { query: 'electrician' })).toBe(false)
    expect(documentMatchesRegistryQuery(plumbing, { query: 'dentist' })).toBe(false)
  })

  /**
   * The Convex search path does plain substring matching with no synonym
   * support, so every alias a customer might type has to be present in the
   * stored document or that backend silently returns nothing.
   */
  it('stores every alias on the indexed Offering document', () => {
    const stored = new Set(electrical.keywords)
    for (const alias of ['electrician', 'electricians', 'electrical', 'sparky']) {
      expect(stored, `indexed aliases must contain ${alias}`).toContain(alias)
    }
  })

  it('expands from the canonical word that published supply actually carries', () => {
    for (const entry of TRADE_VOCABULARY) {
      const aliases = tradeAliasesForText(`${entry.canonical} services`)
      expect(aliases, `${entry.canonical} must expand to all of its aliases`).toEqual(
        [...entry.aliases].sort()
      )
    }
  })
})

describe('symptom words reach the right trade', () => {
  /**
   * Nobody with water across the floor searches "plumbing". AE's own homepage
   * placeholder ("A burst pipe in Parramatta, someone today, under $500")
   * returned zero results before symptom words existed.
   */
  it.each([
    ['burst pipe', 'plumbing'],
    ['blocked drain', 'plumbing'],
    ['leaking toilet', 'plumbing'],
  ])('%s resolves to the plumbing business', (query) => {
    expect(documentMatchesRegistryQuery(plumbing, { query })).toBe(true)
    expect(documentMatchesRegistryQuery(electrical, { query })).toBe(false)
  })

  /**
   * The vocabulary's job is to recognise the trade inside a full sentence.
   * Whether an unmatched place name ("parramatta") should narrow or be ignored
   * is a whole-candidate-set decision and lives in the search caller, not in
   * this per-document predicate — so assert the trade detection here.
   */
  it('recognises the trade inside the full homepage placeholder sentence', () => {
    const sentence = 'a burst pipe in parramatta someone today under 500'
    const canonical = sentence.split(' ').map(canonicalTradeToken)
    expect(canonical).toContain('plumbing')

    const withoutUnmatchedPlace = 'burst pipe someone today under 500'
    expect(documentMatchesRegistryQuery(plumbing, { query: withoutUnmatchedPlace })).toBe(true)
    expect(documentMatchesRegistryQuery(electrical, { query: withoutUnmatchedPlace })).toBe(false)
  })

  it('still returns nothing for a query naming no trade or symptom', () => {
    expect(documentMatchesRegistryQuery(plumbing, { query: 'xyzzy nonsense' })).toBe(false)
    expect(documentMatchesRegistryQuery(electrical, { query: 'xyzzy nonsense' })).toBe(false)
  })

  it('keeps every symptom word out of the place-name vocabulary', () => {
    for (const entry of TRADE_VOCABULARY) {
      for (const symptom of entry.symptoms) {
        expect(TRADE_WORDS, `${symptom} must never be parsed as a suburb`).toContain(symptom)
      }
    }
  })
})
