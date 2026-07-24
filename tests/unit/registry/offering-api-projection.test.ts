import { describe, expect, it } from 'vitest'

import type { BusinessSupplyProjection } from '@/modules/catalog/public'
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
      updatedAt: 50,
      services: [],
    })

    expect(dto).toMatchObject({
      schemaVersion: 'public-business-catalog-api:v2',
      offerings: [],
      disposition: 'current',
    })
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
