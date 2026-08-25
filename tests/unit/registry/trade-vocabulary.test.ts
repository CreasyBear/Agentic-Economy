import { describe, expect, it } from 'vitest'

import {
  buildRegistrySearchDocumentsForCatalog,
  documentMatchesRegistryQuery,
} from '@/modules/registry/internal/search-documents'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

function catalogFor(slug: string, name: string, category: string, offeringName: string, summary: string): PublicBusinessCatalogApiV2Dto {
  return {
    schemaVersion: 'public-business-catalog-api:v2',
    businessId: `business:${slug}`,
    slug,
    name,
    category,
    businessContext: {
      kind: 'local_human',
      suburb: 'Adelaide',
      stateTerritory: 'SA',
    },
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

describe('registry search matches published words only', () => {
  it('does not expand practitioner nouns onto published service nouns', () => {
    expect(documentMatchesRegistryQuery(electrical, { query: 'electrician', mode: 'whole_catalogue' })).toBe(false)
    expect(documentMatchesRegistryQuery(electrical, { query: 'sparky', mode: 'whole_catalogue' })).toBe(false)
    expect(documentMatchesRegistryQuery(electrical, { query: 'electrical', mode: 'whole_catalogue' })).toBe(true)
    expect(documentMatchesRegistryQuery(plumbing, { query: 'plumber', mode: 'whole_catalogue' })).toBe(false)
    expect(documentMatchesRegistryQuery(plumbing, { query: 'plumbing', mode: 'whole_catalogue' })).toBe(true)
  })

  it('does not store trade aliases on the indexed offering', () => {
    expect(electrical.keywords).toEqual([])
    expect(plumbing.keywords).toEqual([])
  })

  it('matches published summary words without a trade bridge', () => {
    expect(documentMatchesRegistryQuery(plumbing, { query: 'burst pipe', mode: 'whole_catalogue' })).toBe(true)
    expect(documentMatchesRegistryQuery(electrical, { query: 'burst pipe', mode: 'whole_catalogue' })).toBe(false)
    expect(documentMatchesRegistryQuery(plumbing, { query: 'xyzzy nonsense', mode: 'whole_catalogue' })).toBe(false)
  })
})
