import { describe, expect, it } from 'vitest'

import type { PublicOfferingSupplyProjection } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { projectPublicInquiryAvailability, projectPublicInquiryOfferingSupply } from '@/modules/inquiries/route-readbacks'

const businessId = brandNonEmpty('business:access-truth', 'BusinessId')
const observedAt = 1_900_000_000_000

/** The exact copy the dev seed and the v1 catalog stamp onto every human channel. */
const storedInquiryDisclosure = 'Use the inquiry form for a first contact.'

describe('rendered access paths never describe a refused channel', () => {
  it('withdraws the AE path and re-describes the phone path when no inquiry is admitted', () => {
    const projected = projectPublicInquiryOfferingSupply(offeringFixture(), undefined)
    const paths = projected[0]?.accessPaths ?? []

    expect(paths.map((path) => path.accessPathRef)).toEqual(['access:phone', 'access:website'])
    expect(JSON.stringify(projected)).not.toContain(storedInquiryDisclosure)
    expect(paths.map((path) => (path.descriptor.kind === 'human_request' ? path.descriptor.disclosure : ''))).toEqual([
      'Call the business directly.',
      'Go to the business website.',
    ])
  })

  it('gives the AE path the reachable destination when an inquiry is admitted', () => {
    const projected = projectPublicInquiryOfferingSupply(offeringFixture(), '/demo-plumbing/inquiry')
    const aePath = projected[0]?.accessPaths.find((path) => path.accessPathRef === 'access:ae')

    expect(aePath?.descriptor).toEqual({
      kind: 'human_request',
      channel: 'ae_inquiry',
      disclosure: storedInquiryDisclosure,
      url: '/demo-plumbing/inquiry',
    })
    // Reachable means the owner's own channels keep the copy they published.
    expect(projected[0]?.accessPaths[0]?.descriptor).toEqual(offeringFixture()[0]?.accessPaths[0]?.descriptor)
  })

  it('leaves an external operation path untouched in both states', () => {
    const external = [{
      ...requiredOffering(),
      accessPaths: [{
        accessPathRef: brandNonEmpty('access:api', 'AccessPathRef'),
        descriptor: {
          kind: 'external_operation' as const,
          name: 'Booking API',
          summary: 'Books a visit.',
          url: 'https://example.test/api',
          provenance: 'business_declared' as const,
        },
      }],
    }] satisfies readonly PublicOfferingSupplyProjection[]

    expect(projectPublicInquiryOfferingSupply(external, undefined)[0]?.accessPaths).toEqual(external[0]?.accessPaths)
    expect(projectPublicInquiryOfferingSupply(external, '/x/inquiry')[0]?.accessPaths).toEqual(external[0]?.accessPaths)
  })

  it('withdraws the AE path from every Offering, not only the selected target', () => {
    const projected = projectPublicInquiryAvailability(twoOfferingCatalog(), undefined)

    expect(projected.offerings.map((offering) => offering.accessPaths.map((path) => path.kind === 'human_request' ? path.channel : 'external'))).toEqual([
      ['phone'],
      ['phone'],
    ])
  })

  it('keeps published first-contact paths once a target is admitted', () => {
    const projected = projectPublicInquiryAvailability(twoOfferingCatalog(), {
      version: 'r1-target-admitted:v1',
      admitted: true,
      proof: { kind: 'claimed_owner', claimRef: 'claim:access-truth', recipientRef: 'owner@example.test' },
    })

    expect(projected.offerings.flatMap((offering) => offering.accessPaths.map((path) => path.kind === 'human_request' ? path.channel : 'external')))
      .toEqual(['phone', 'ae_inquiry', 'phone', 'ae_inquiry'])
  })
})

function requiredOffering(): PublicOfferingSupplyProjection {
  return {
    offering: {
      offeringRef: brandNonEmpty('offering:demo-plumbing:emergency', 'OfferingRef'),
      revision: 1,
      name: 'Emergency plumbing visit',
      category: 'Plumber',
      summary: 'A published offering.',
    },
    accessPaths: [],
    support: { integrated: false, routeable: false, reasons: [], observedAt },
  }
}

function offeringFixture(): readonly PublicOfferingSupplyProjection[] {
  return [{
    ...requiredOffering(),
    accessPaths: [
      {
        accessPathRef: brandNonEmpty('access:phone', 'AccessPathRef'),
        descriptor: { kind: 'human_request', channel: 'phone', disclosure: storedInquiryDisclosure },
      },
      {
        accessPathRef: brandNonEmpty('access:website', 'AccessPathRef'),
        descriptor: {
          kind: 'human_request',
          channel: 'website',
          disclosure: storedInquiryDisclosure,
          url: 'https://example.test',
        },
      },
      {
        accessPathRef: brandNonEmpty('access:ae', 'AccessPathRef'),
        descriptor: { kind: 'human_request', channel: 'ae_inquiry', disclosure: storedInquiryDisclosure },
      },
    ],
  }]
}

function twoOfferingCatalog(): PublicBusinessCatalogApiV2Dto {
  return {
    schemaVersion: 'public-business-catalog-api:v2',
    businessId,
    slug: brandNonEmpty('demo-plumbing', 'Slug'),
    name: 'Demo Plumbing',
    category: 'Plumber',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicUrl: '/demo-plumbing',
    trustTier: 'listed',
    photos: [],
    observedAt,
    disposition: 'current',
    offerings: ['emergency', 'maintenance'].map((slug) => ({
      offeringRef: brandNonEmpty(`offering:${slug}`, 'OfferingRef'),
      revision: 1,
      name: slug,
      category: 'Plumber',
      summary: 'Published Offering.',
      accessPaths: [
        {
          accessPathRef: brandNonEmpty(`access:phone:${slug}`, 'AccessPathRef'),
          kind: 'human_request' as const,
          channel: 'phone' as const,
          disclosure: storedInquiryDisclosure,
        },
        {
          accessPathRef: brandNonEmpty(`access:ae:${slug}`, 'AccessPathRef'),
          kind: 'human_request' as const,
          channel: 'ae_inquiry' as const,
          disclosure: storedInquiryDisclosure,
        },
      ],
      support: { integrated: false, aeSupportedAction: false },
    })),
    accessSummary: {
      humanRequest: true,
      externalOperation: false,
      aeSupportedAction: false,
    },
  }
}
