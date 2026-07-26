import { describe, expect, it } from 'vitest'

import { selectDirectoryFallback } from '@/modules/registry/directory-fallback.functions'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/internal/offering-api-projection'

function business(
  slug: string,
  publishedPhone: string | undefined,
  pricingSummary?: string,
  place: { suburb: string; stateTerritory: string } = { suburb: 'Adelaide', stateTerritory: 'SA' },
) {
  return {
    schemaVersion: 'public-business-catalog-api:v2',
    businessId: `business:${slug}`,
    slug,
    name: slug,
    category: 'Emergency plumbing',
    suburb: place.suburb,
    stateTerritory: place.stateTerritory,
    publicUrl: `/${slug}`,
    trustTier: 'claimed',
    photos: [],
    observedAt: 1,
    disposition: 'current',
    ...(publishedPhone === undefined ? {} : { publishedPhone }),
    offerings: [
      {
        offeringRef: `legacy-offering:${slug}:emergency`,
        revision: 1,
        name: 'Emergency pipe repair',
        category: 'Emergency plumbing',
        summary: 'Burst pipe triage.',
        serviceAreaSummary: 'Adelaide',
        ...(pricingSummary === undefined ? {} : { pricingSummary }),
        accessPaths: [],
        support: { integrated: false, aeSupportedAction: false },
      },
    ],
    accessSummary: { humanRequest: true, externalOperation: false, aeSupportedAction: false },
  } as unknown as PublicBusinessCatalogApiV2Dto
}

describe('directory fallback when AE cannot carry the Request', () => {
  /**
   * The panel exists so a customer is never told "nothing can help" while AE
   * knows a reachable plumber. A business with no published phone cannot be
   * acted on, so including it would recreate the dead end.
   */
  it('offers only businesses the customer can actually reach', () => {
    const result = selectDirectoryFallback([
      business('unreachable-plumbing', undefined),
      business('adelaide-emergency-plumbing', '(08) 5550 1060'),
    ])

    expect(result.kind).toBe('available')
    if (result.kind !== 'available') return
    expect(result.businesses.map((entry) => entry.slug)).toEqual(['adelaide-emergency-plumbing'])
    expect(result.businesses[0]?.publishedPhone).toBe('(08) 5550 1060')
  })

  it('reports none rather than an empty panel when nothing is reachable', () => {
    expect(selectDirectoryFallback([business('unreachable-plumbing', undefined)])).toEqual({ kind: 'none' })
    expect(selectDirectoryFallback([])).toEqual({ kind: 'none' })
  })

  it('carries the decision facts the customer needs to choose', () => {
    const result = selectDirectoryFallback([
      business('adelaide-emergency-plumbing', '(08) 5550 1060', 'Development sample — $180 call-out'),
    ])

    expect(result.kind).toBe('available')
    if (result.kind !== 'available') return
    expect(result.businesses[0]).toMatchObject({
      offeringName: 'Emergency pipe repair',
      pricingSummary: 'Development sample — $180 call-out',
      suburb: 'Adelaide',
      stateTerritory: 'SA',
    })
  })

  it('stays short enough to read without scrolling past the point', () => {
    const many = Array.from({ length: 12 }, (_, index) => business(`plumbing-${index}`, '(08) 5550 1060'))
    const result = selectDirectoryFallback(many)

    expect(result.kind).toBe('available')
    if (result.kind !== 'available') return
    expect(result.businesses.length).toBeLessThanOrEqual(4)
  })

  /**
   * Listing Darwin to someone who said Fremantle is not a ranking nuance —
   * it reads as a broken product. Anything actually in the named area wins.
   */
  it('prefers businesses in the area the customer named', () => {
    const result = selectDirectoryFallback([
      business('darwin-emergency-plumbing', '(08) 5550 1050', undefined, { suburb: 'Darwin', stateTerritory: 'NT' }),
      business('fremantle-emergency-plumbing', '(08) 5550 1080', undefined, { suburb: 'Fremantle', stateTerritory: 'WA' }),
    ], 'burst pipe in Fremantle, someone today, under $500')

    expect(result).toMatchObject({
      kind: 'available',
      matchesRequestedArea: true,
    })
    if (result.kind !== 'available') return
    expect(result.businesses.map((entry) => entry.slug)).toEqual(['fremantle-emergency-plumbing'])
  })

  it('admits when nothing reachable is in the named area', () => {
    const result = selectDirectoryFallback([
      business('darwin-emergency-plumbing', '(08) 5550 1050', undefined, { suburb: 'Darwin', stateTerritory: 'NT' }),
    ], 'burst pipe in Fremantle, someone today, under $500')

    expect(result).toMatchObject({ kind: 'available', matchesRequestedArea: false })
  })

  /**
   * The source read has to be wider than the display limit. Reading exactly
   * four and then dropping the phoneless ones reported "nothing reachable"
   * while contactable businesses sat just past the cut.
   */
  it('does not lose reachable businesses behind phoneless ones', () => {
    const items = [
      ...Array.from({ length: 6 }, (_, index) => business(`unreachable-${index}`, undefined)),
      business('adelaide-emergency-plumbing', '(08) 5550 1060'),
    ]

    const result = selectDirectoryFallback(items)

    expect(result.kind).toBe('available')
    if (result.kind !== 'available') return
    expect(result.businesses.map((entry) => entry.slug)).toEqual(['adelaide-emergency-plumbing'])
  })
})
