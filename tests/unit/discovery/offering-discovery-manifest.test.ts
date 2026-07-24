import { describe, expect, it } from 'vitest'

import type { BusinessSupplyProjection } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { buildOfferingDiscoveryManifest } from '@/modules/discovery/public'
import { projectBusinessSupplyToPublicApi } from '@/modules/registry/public'

describe('Offering discovery manifest', () => {
  it('publishes a profile with zero Offerings', () => {
    const result = buildOfferingDiscoveryManifest({
      business: projectBusinessSupplyToPublicApi(projection([])),
      canonicalBaseUrl: 'https://agentic.market/',
      now: 101,
    })

    expect(result).toMatchObject({
      kind: 'available',
      manifest: {
        schemaVersion: 'ae-ucp-fallback:v2',
        businessCatalogSchemaVersion: 'public-business-catalog-api:v2',
        offerings: [],
      },
    })
  })

  it('carries provenance and AE support as separate facts without internal evidence', () => {
    const business = projectBusinessSupplyToPublicApi(projection([{
      offering: {
        offeringRef: brandNonEmpty('offering:graph:data', 'OfferingRef'),
        revision: 1,
        name: 'Subgraph query',
        category: 'Data',
        summary: 'Query blockchain data.',
      },
      accessPaths: [{
        accessPathRef: brandNonEmpty('access:graph:query', 'AccessPathRef'),
        descriptor: {
          kind: 'external_operation',
          name: 'GraphQL query',
          summary: 'Query a subgraph.',
          url: 'https://api.example.com/graphql',
          method: 'POST',
          provenance: 'business_declared',
        },
      }],
      support: { integrated: false, routeable: false, reasons: ['not_integrated'] },
    }]))

    const result = buildOfferingDiscoveryManifest({ business, canonicalBaseUrl: 'https://agentic.market', now: 101 })
    expect(result.kind).toBe('available')
    if (result.kind !== 'available') return

    expect(result.manifest.offerings[0]).toMatchObject({
      accessPaths: [{ kind: 'external_operation', provenance: 'business_declared' }],
      support: { integrated: false, aeSupportedAction: false },
    })
    expect(JSON.stringify(result.manifest)).not.toMatch(/sourceDigest|sourceHash|routeable|credential|adapter|reasons/i)
  })
})

function projection(offerings: BusinessSupplyProjection['offerings']): BusinessSupplyProjection {
  return {
    business: {
      businessId: 'business:graph',
      slug: 'the-graph',
      name: 'The Graph',
      category: 'Data',
      suburb: 'Online',
      stateTerritory: 'Global',
      publicUrl: '/the-graph',
    },
    offerings,
    sourceRevision: 1,
    sourceDigest: 'private-source-digest',
    observedAt: 100,
    disposition: 'current',
  } as BusinessSupplyProjection
}
