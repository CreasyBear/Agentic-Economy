import { describe, expect, it } from 'vitest'

import type { BusinessSupplyProjection, OfferingPrice } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  projectBusinessSupplyToPublicApi,
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
          offeringRevision: 2,
          offeringSourceHash: canonicalDigest('offering-source-hash'),
          sourceHash: canonicalDigest('access-source-hash'),
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
    }), 101)

    expect(dto.offerings[0]).toMatchObject({
      accessPaths: [{ kind: 'external_operation', provenance: 'business_declared' }],
      support: { integrated: true, aeSupportedAction: true },
    })
    expect(dto.accessSummary).toEqual({
      humanRequest: false,
      externalOperation: true,
      aeSupportedAction: true,
    })
    expect(JSON.stringify(dto)).not.toMatch(/routeable|sourceDigest|credential|adapter/i)
  })
  it('drops malformed access URLs and never repeats an access-path identity', () => {
    const accessPath = {
      accessPathRef: brandNonEmpty('access:meridian:graphql', 'AccessPathRef'),
      offeringRevision: 1,
      offeringSourceHash: canonicalDigest('offering-source-hash'),
      sourceHash: canonicalDigest('access-source-hash'),
      descriptor: {
        kind: 'external_operation',
        name: 'GraphQL query',
        summary: 'Query the declared GraphQL surface.',
        url: 'https://api.example.com/graphql',
        method: 'POST',
        provenance: 'business_declared',
      },
    } as BusinessSupplyProjection['offerings'][number]['accessPaths'][number]
    const baseOffering = supplyOffering({})
    const dto = projectBusinessSupplyToPublicApi(projection({
      offerings: [{
        ...baseOffering,
        accessPaths: [
          accessPath,
          { ...accessPath },
          {
            ...accessPath,
            accessPathRef: brandNonEmpty('access:meridian:blank', 'AccessPathRef'),
            descriptor: { ...accessPath.descriptor, url: ' ' },
          },
        ],
      }],
    }))

    expect(dto.offerings[0]?.accessPaths).toHaveLength(1)
    expect(dto.offerings[0]?.accessPaths[0]).toMatchObject({
      accessPathRef: 'access:meridian:graphql',
      url: 'https://api.example.com/graphql',
    })

    const conflict = projectBusinessSupplyToPublicApi(projection({
      offerings: [{
        ...baseOffering,
        accessPaths: [
          accessPath,
          { ...accessPath, descriptor: { ...accessPath.descriptor, url: 'https://other.example/graphql' } },
        ],
      }],
    }))
    expect(conflict.offerings[0]?.accessPaths).toEqual([])
  })


  it('uses the live clock by default instead of stored projection observation time', () => {
    const now = Date.now()
    const dto = projectBusinessSupplyToPublicApi(projection({
      observedAt: now - 1_000,
      offerings: [{
        ...supplyOffering({}),
        support: {
          integrated: true,
          routeable: true,
          reasons: [],
          observedAt: now - 1_000,
          validUntil: now - 1,
        },
      }],
    }))

    expect(dto.offerings[0]?.support.aeSupportedAction).toBe(false)
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
        pricingSummary: 'Demo price — $180 call-out, quoted before work starts',
      })],
    }))
    const unpriced = projectBusinessSupplyToPublicApi(projection({
      offerings: [supplyOffering({ availabilitySummary: '  Mon–Sun, 24 hours  ' })],
    }))

    expect(priced.offerings[0]).toMatchObject({
      availabilitySummary: 'Mon–Fri 7am–5pm, Sat 8am–12pm',
      pricingSummary: 'Demo price — $180 call-out, quoted before work starts',
    })
    expect(unpriced.offerings[0]).toMatchObject({ availabilitySummary: 'Mon–Sun, 24 hours' })
    expect(unpriced.offerings[0]).not.toHaveProperty('pricingSummary')
  })

  it('publishes the comparable price beside the prose, never derived from it', () => {
    const price: OfferingPrice = {
      kind: 'from',
      amount: { currency: 'AUD', units: '18000', exponent: 2 },
      unit: 'visit',
      taxTreatment: 'inclusive',
    }
    const dto = projectBusinessSupplyToPublicApi(projection({
      offerings: [supplyOffering({
        pricingSummary: 'Demo price — $180 call-out, quoted before work starts',
        price,
      })],
    }))
    const proseOnly = projectBusinessSupplyToPublicApi(projection({
      offerings: [supplyOffering({ pricingSummary: 'Quoted on site, every time' })],
    }))

    expect(dto.offerings[0]).toMatchObject({
      pricingSummary: 'Demo price — $180 call-out, quoted before work starts',
      price,
    })
    // Prose is a published sentence, not a source to parse a number out of.
    expect(proseOnly.offerings[0]).toMatchObject({ pricingSummary: 'Quoted on site, every time' })
    expect(proseOnly.offerings[0]).not.toHaveProperty('price')
    // Additive optional field: pinned readers stay on v2.
    expect(dto.schemaVersion).toBe('public-business-catalog-api:v2')
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
      businessContext: {
        kind: 'local_human',
        suburb: 'Perth',
        stateTerritory: 'WA',
      },
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
    sourceDigest: canonicalDigest('private-source-digest'),
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

