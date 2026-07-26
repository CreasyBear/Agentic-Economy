import { describe, expect, it } from 'vitest'

import type { BusinessSupplyProjection, OfferingPrice } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import {
  adaptLegacyCatalogToOfferingApi,
  projectBusinessSupplyToPublicApi,
  summarizeOfferingAccess,
} from '@/modules/registry/public'

describe('Offering-shaped public business API', () => {
  it('keeps a profile-only business visible with an empty Offering collection', () => {
    const dto = projectBusinessSupplyToPublicApi(projection({ offerings: [] }))

    expect(dto).toMatchObject({
      schemaVersion: 'public-business-catalog-api:v2',
      slug: 'meridian-engineering',
      offerings: [],
      accessSummary: {
        humanRequest: false,
        externalOperation: false,
        aeSupportedAction: false,
      },
    })
    expect(JSON.stringify(dto)).not.toMatch(/sourceDigest|sourceHash|credential|adapter/i)
  })

  it('keeps declared access and earned AE support separate', () => {
    const dto = projectBusinessSupplyToPublicApi(projection({
      offerings: [{
        offering: {
          offeringRef: brandNonEmpty('offering:meridian:subgraph-query', 'OfferingRef'),
          revision: 2,
          name: 'Subgraph query',
          category: 'Data',
          summary: 'Query a named subgraph.',
        },
        accessPaths: [{
          accessPathRef: brandNonEmpty('access:meridian:graphql', 'AccessPathRef'),
          descriptor: {
            kind: 'external_operation',
            name: 'GraphQL query',
            summary: 'Query the declared GraphQL surface.',
            url: 'https://api.example.com/graphql',
            method: 'POST',
            documentationUrl: 'https://docs.example.com/graphql',
            provenance: 'business_declared',
          },
        }],
        support: {
          integrated: true,
          routeable: true,
          reasons: [],
          observedAt: 100,
          validUntil: 200,
        },
      }],
    }))

    expect(dto.offerings[0]).toMatchObject({
      accessPaths: [{ kind: 'external_operation', provenance: 'business_declared' }],
      support: { integrated: true, aeSupportedAction: true },
    })
    expect(dto.accessSummary).toEqual({
      humanRequest: false,
      externalOperation: true,
      aeSupportedAction: true,
    })
    expect(JSON.stringify(dto)).not.toMatch(/routeable|sourceDigest|sourceHash|credential|adapter/i)
  })

  it('removes an AE-supported action at readiness expiry without waiting for a rebuild', () => {
    const dto = projectBusinessSupplyToPublicApi(projection({
      offerings: [{
        offering: {
          offeringRef: brandNonEmpty('offering:meridian:expired', 'OfferingRef'),
          revision: 1,
          name: 'Expired action',
          category: 'Data',
          summary: 'An action whose readiness evidence has expired.',
        },
        accessPaths: [],
        support: {
          integrated: true,
          routeable: true,
          reasons: [],
          observedAt: 100,
          validUntil: 200,
        },
      }],
    }), 200)

    expect(dto.offerings[0]?.support).toMatchObject({
      integrated: true,
      aeSupportedAction: false,
      validUntil: 200,
    })
    expect(dto.accessSummary.aeSupportedAction).toBe(false)
  })

  it('summarizes only the first two Offering names for registry rows', () => {
    const dto = projectBusinessSupplyToPublicApi(projection({
      offerings: ['One', 'Two', 'Three'].map((name, index) => ({
        offering: {
          offeringRef: brandNonEmpty(`offering:meridian:${index}`, 'OfferingRef'),
          revision: 1,
          name,
          category: 'Engineering',
          summary: `${name} summary`,
        },
        accessPaths: [],
        support: { integrated: false, routeable: false, reasons: ['not_integrated'] },
      })),
    }))

    expect(summarizeOfferingAccess(dto)).toEqual({
      offeringNames: ['One', 'Two'],
      access: dto.accessSummary,
    })
  })

  it('makes the legacy path explicit and preserves profile-only visibility', () => {
    const dto = adaptLegacyCatalogToOfferingApi({
      slug: 'profile-only',
      name: 'Profile Only',
      category: 'Engineering',
      suburb: 'Perth',
      stateTerritory: 'WA',
      publicUrl: '/profile-only',
      trustTier: 'claimed',
      updatedAt: 50,
      services: [],
    })

    expect(dto).toMatchObject({
      schemaVersion: 'public-business-catalog-api:v2',
      offerings: [],
      disposition: 'current',
    })
  })

  it.each([
    'Hours supplied by owner',
    'Owner supplied hours',
    'Hours unknown',
    'Unknown',
    '   ',
  ])('never publishes %j as availability', (placeholder) => {
    const dto = projectBusinessSupplyToPublicApi(projection({
      offerings: [supplyOffering({ availabilitySummary: placeholder })],
    }))

    // Absent, not named: a surface that receives the key renders it as a fact.
    expect(dto.offerings[0]).not.toHaveProperty('availabilitySummary')
  })

  it('publishes real availability and price verbatim, and omits an unsupplied price', () => {
    const priced = projectBusinessSupplyToPublicApi(projection({
      offerings: [supplyOffering({
        availabilitySummary: 'Mon–Fri 7am–5pm, Sat 8am–12pm',
        pricingSummary: 'Development sample — $180 call-out, quoted before work starts',
      })],
    }))
    const unpriced = projectBusinessSupplyToPublicApi(projection({
      offerings: [supplyOffering({ availabilitySummary: '  Mon–Sun, 24 hours  ' })],
    }))

    expect(priced.offerings[0]).toMatchObject({
      availabilitySummary: 'Mon–Fri 7am–5pm, Sat 8am–12pm',
      pricingSummary: 'Development sample — $180 call-out, quoted before work starts',
    })
    expect(unpriced.offerings[0]).toMatchObject({ availabilitySummary: 'Mon–Sun, 24 hours' })
    expect(unpriced.offerings[0]).not.toHaveProperty('pricingSummary')
  })

  it('publishes the comparable price beside the prose, never derived from it', () => {
    const price: OfferingPrice = {
      kind: 'from',
      currency: 'AUD',
      amountMinor: 18000,
      unit: 'visit',
      taxTreatment: 'inclusive',
    }
    const dto = projectBusinessSupplyToPublicApi(projection({
      offerings: [supplyOffering({
        pricingSummary: 'Development sample — $180 call-out, quoted before work starts',
        price,
      })],
    }))
    const proseOnly = projectBusinessSupplyToPublicApi(projection({
      offerings: [supplyOffering({ pricingSummary: 'Quoted on site, every time' })],
    }))

    expect(dto.offerings[0]).toMatchObject({
      pricingSummary: 'Development sample — $180 call-out, quoted before work starts',
      price,
    })
    // Prose is a published sentence, not a source to parse a number out of.
    expect(proseOnly.offerings[0]).toMatchObject({ pricingSummary: 'Quoted on site, every time' })
    expect(proseOnly.offerings[0]).not.toHaveProperty('price')
    // Additive optional field: pinned readers stay on v2.
    expect(dto.schemaVersion).toBe('public-business-catalog-api:v2')
  })

  it('drops the legacy hours sentinel on the v1 adapter and keeps published hours', () => {
    const dto = adaptLegacyCatalogToOfferingApi({
      slug: 'mixed-supply',
      name: 'Mixed Supply',
      category: 'Plumbing',
      suburb: 'Perth',
      stateTerritory: 'WA',
      publicUrl: '/mixed-supply',
      trustTier: 'claimed',
      updatedAt: 50,
      services: [
        legacyService({ slug: 'unknown-hours', hoursOrUnknown: 'Hours supplied by owner' }),
        legacyService({ slug: 'real-hours', hoursOrUnknown: 'Mon–Fri 8:30am–5pm' }),
      ],
    })

    expect(dto.offerings[0]).not.toHaveProperty('availabilitySummary')
    expect(dto.offerings[1]).toMatchObject({ availabilitySummary: 'Mon–Fri 8:30am–5pm' })
    // v1 has no price column at all, so the adapter can never publish one.
    expect(dto.offerings.every((offering) => offering.pricingSummary === undefined)).toBe(true)
    for (const offering of dto.offerings) expect(offering).not.toHaveProperty('price')
  })
})

function projection(
  overrides: Partial<BusinessSupplyProjection> = {},
): BusinessSupplyProjection {
  return {
    business: {
      businessId: 'business:meridian',
      slug: 'meridian-engineering',
      name: 'Meridian Engineering',
      category: 'Engineering',
      suburb: 'Perth',
      stateTerritory: 'WA',
      publicUrl: '/meridian-engineering',
      trustTier: 'claimed',
      publicStatus: 'published',
      indexStatus: 'indexed',
      discoveryStatus: 'available',
      updatedAt: 99,
      photos: [],
    },
    offerings: [],
    sourceRevision: 1,
    sourceDigest: 'private-source-digest',
    observedAt: 100,
    disposition: 'current',
    ...overrides,
  } as BusinessSupplyProjection
}

function supplyOffering(
  facts: Readonly<{ availabilitySummary?: string; pricingSummary?: string; price?: OfferingPrice }>,
): BusinessSupplyProjection['offerings'][number] {
  return {
    offering: {
      offeringRef: brandNonEmpty('offering:meridian:hours', 'OfferingRef'),
      revision: 1,
      name: 'Emergency pipe repair',
      category: 'Emergency plumbing',
      summary: 'Burst pipe triage.',
      ...facts,
    },
    accessPaths: [],
    support: { integrated: false, routeable: false, reasons: ['not_integrated'] },
  } as BusinessSupplyProjection['offerings'][number]
}

function legacyService(overrides: Readonly<{ slug: string; hoursOrUnknown: string }>) {
  return {
    name: 'Emergency pipe repair',
    category: 'Emergency plumbing',
    summary: 'Burst pipe triage.',
    serviceArea: 'Perth and nearby suburbs',
    firstRequest: {
      mode: 'inquiry_available' as const,
      publicDisclosure: 'Use the inquiry form for a first contact.',
      publicChannel: 'ae_status_only' as const,
    },
    ...overrides,
  }
}
