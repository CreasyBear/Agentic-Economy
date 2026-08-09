import { describe, expect, it } from 'vitest'

import type { BusinessSupplyProjection, OfferingPrice } from '@/modules/catalog/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
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
        offeringRevision: 1,
        offeringSourceHash: canonicalDigest({
          fixture: 'offering-discovery-manifest',
          offeringRef: 'offering:graph:data',
          revision: 1,
        }),
        sourceHash: canonicalDigest({
          fixture: 'offering-discovery-manifest',
          accessPathRef: 'access:graph:query',
        }),
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
    expect(JSON.stringify(result.manifest)).not.toMatch(/sourceDigest|routeable|credential|adapter|reasons/i)
  })

  it('carries the comparable price, and strips a bidi control out of the currency', () => {
    const price: OfferingPrice = {
      kind: 'range',
      minimum: { currency: 'AUD', units: '18000', exponent: 2 },
      maximum: { currency: 'AUD', units: '42000', exponent: 2 },
      unit: 'job',
      taxTreatment: 'inclusive',
    }
    const business = projectBusinessSupplyToPublicApi(projection([
      pricedOffering('offering:graph:priced', price),
      pricedOffering('offering:graph:hostile', { ...price, minimum: { ...price.minimum, currency: 'A\u202eUD' } }),
    ]))

    const result = buildOfferingDiscoveryManifest({ business, canonicalBaseUrl: 'https://agentic.market', now: 101 })
    expect(result.kind).toBe('available')
    if (result.kind !== 'available') return

    expect(result.manifest.offerings[0]).toMatchObject({
      pricingSummary: 'Quoted before work starts',
      price,
    })
    // Currency is free text; exact amount units and exponent remain structured.
    expect(result.manifest.offerings[1]?.price).toMatchObject({ minimum: { currency: 'AUD' } })
  })

  it('publishes no price for an offering that published none', () => {
    const business = projectBusinessSupplyToPublicApi(projection([humanRequestOffering('ae_inquiry')]))
    const result = buildOfferingDiscoveryManifest({
      business,
      canonicalBaseUrl: 'https://agentic.market',
      now: 101,
      inquiryAdmitted: true,
    })
    expect(result.kind).toBe('available')
    if (result.kind !== 'available') return

    expect(result.manifest.offerings[0]).not.toHaveProperty('price')
  })

  /**
   * The human business page withdraws first-contact copy when the inquiry
   * route would refuse. The machine manifest bypassed that projection and was
   * telling agents to "use the inquiry form" for a business whose send would
   * be rejected. Both surfaces must describe one fact.
   */
  it('withdraws the AE inquiry path when the inquiry route would refuse', () => {
    const business = projectBusinessSupplyToPublicApi(projection([humanRequestOffering('ae_inquiry')]))

    const refused = buildOfferingDiscoveryManifest({
      business, canonicalBaseUrl: 'https://agentic.market', now: 101, inquiryAdmitted: false,
    })
    expect(refused.kind).toBe('available')
    if (refused.kind !== 'available') return
    expect(refused.manifest.offerings[0]?.accessPaths).toEqual([])

    const admitted = buildOfferingDiscoveryManifest({
      business, canonicalBaseUrl: 'https://agentic.market', now: 101, inquiryAdmitted: true,
    })
    expect(admitted.kind).toBe('available')
    if (admitted.kind !== 'available') return
    expect(admitted.manifest.offerings[0]?.accessPaths).toMatchObject([{ channel: 'ae_inquiry' }])
  })

  it('describes a surviving phone channel by its own channel when inquiry is refused', () => {
    const business = projectBusinessSupplyToPublicApi({
      ...projection([humanRequestOffering('phone')]),
      business: { ...projection([]).business, publishedPhone: '(08) 5550 1030' },
    })

    const result = buildOfferingDiscoveryManifest({
      business, canonicalBaseUrl: 'https://agentic.market', now: 101, inquiryAdmitted: false,
    })

    expect(result.kind).toBe('available')
    if (result.kind !== 'available') return
    expect(result.manifest.offerings[0]?.accessPaths).toMatchObject([
      { channel: 'phone', disclosure: 'Call the business directly.' },
    ])
  })

  /** Unknown admission must fail closed: inviting a refused send is the worse failure. */
  it('treats unknown admission as refused', () => {
    const business = projectBusinessSupplyToPublicApi(projection([humanRequestOffering('ae_inquiry')]))

    const result = buildOfferingDiscoveryManifest({ business, canonicalBaseUrl: 'https://agentic.market', now: 101 })

    expect(result.kind).toBe('available')
    if (result.kind !== 'available') return
    expect(result.manifest.offerings[0]?.accessPaths).toEqual([])
  })
})

function projection(offerings: BusinessSupplyProjection['offerings']): BusinessSupplyProjection {
  return {
    business: {
      businessId: brandNonEmpty('business:graph', 'BusinessId'),
      slug: 'the-graph',
      name: 'The Graph',
      category: 'Data',
      suburb: 'Online',
      stateTerritory: 'Global',
      publicUrl: '/the-graph',
      trustTier: 'claimed',
    },
    offerings,
    sourceRevision: 1,
    sourceDigest: canonicalDigest('offering-discovery-manifest:source'),
    observedAt: 100,
    disposition: 'current',
  }
}

function humanRequestOffering(channel: 'ae_inquiry' | 'phone'): BusinessSupplyProjection['offerings'][number] {
  return {
    offering: {
      offeringRef: brandNonEmpty('offering:demo:plumbing', 'OfferingRef'),
      revision: 1,
      name: 'Diagnostic plumbing',
      category: 'Plumbing',
      summary: 'Diagnostic plumbing triage.',
    },
    accessPaths: [{
      accessPathRef: brandNonEmpty(`access:demo:${channel}`, 'AccessPathRef'),
      offeringRevision: 1,
      offeringSourceHash: canonicalDigest('offering-discovery-manifest:offering:demo:plumbing'),
      sourceHash: canonicalDigest({
        fixture: 'offering-discovery-manifest',
        accessPathRef: `access:demo:${channel}`,
      }),
      descriptor: {
        kind: 'human_request',
        channel,
        disclosure: 'Use the inquiry form for a first contact.',
      },
    }],
    support: { integrated: false, routeable: false, reasons: ['not_integrated'] },
  }
}

function pricedOffering(ref: string, price: OfferingPrice): BusinessSupplyProjection['offerings'][number] {
  return {
    offering: {
      offeringRef: brandNonEmpty(ref, 'OfferingRef'),
      revision: 1,
      name: 'Subgraph query',
      category: 'Data',
      summary: 'Query blockchain data.',
      pricingSummary: 'Quoted before work starts',
      price,
    },
    accessPaths: [],
    support: { integrated: false, routeable: false, reasons: ['not_integrated'] },
  }
}
