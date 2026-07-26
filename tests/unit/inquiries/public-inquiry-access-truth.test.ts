import { describe, expect, it } from 'vitest'

import type { PublicOfferingSupplyProjection, PublicRouteCatalogContract } from '@/modules/catalog/public'
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

  it('withdraws first-contact copy from every service, not only the selected target', () => {
    const projected = projectPublicInquiryAvailability(twoServiceCatalog(), undefined)

    expect(projected.services.map((service) => service.firstRequest.publicDisclosure)).toEqual([
      'This business isn’t receiving inquiries through AE yet.',
      'This business isn’t receiving inquiries through AE yet.',
    ])
    expect(projected.services.flatMap((service) => service.capabilities.map((capability) => capability.status)))
      .toEqual(['unavailable', 'unavailable'])
  })

  it('keeps published first-contact copy once a target is admitted', () => {
    const projected = projectPublicInquiryAvailability(twoServiceCatalog(), {
      version: 'r1-target-admitted:v1',
      admitted: true,
      proof: { kind: 'claimed_owner', claimRef: 'claim:access-truth', recipientRef: 'owner@example.test' },
    })

    expect(projected.services.map((service) => service.firstRequest.publicDisclosure))
      .toEqual([storedInquiryDisclosure, storedInquiryDisclosure])
  })
})

function requiredOffering(): PublicOfferingSupplyProjection {
  return {
    offering: {
      offeringRef: brandNonEmpty('legacy-offering:demo-plumbing:emergency', 'OfferingRef'),
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

function twoServiceCatalog(): PublicRouteCatalogContract {
  const firstRequest = {
    mode: 'inquiry_available',
    publicChannel: 'public_business_contact',
    publicDisclosure: storedInquiryDisclosure,
    rawContactExcluded: true,
  } as const

  return {
    businessId,
    slug: brandNonEmpty('demo-plumbing', 'Slug'),
    name: 'Demo Plumbing',
    category: 'Plumber',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicUrl: '/demo-plumbing',
    publicStatus: 'published',
    trustTier: 'listed',
    indexStatus: 'indexed',
    discoveryStatus: 'available',
    photos: [],
    schemaVersion: 'public-catalog:v1',
    updatedAt: observedAt,
    services: ['emergency', 'maintenance'].map((slug) => {
      const serviceId = brandNonEmpty(`service:${slug}`, 'ServiceId')
      return {
        serviceId,
        serviceSlug: brandNonEmpty(slug, 'Slug'),
        businessId,
        name: slug,
        category: 'Plumber',
        summary: 'Published service.',
        serviceArea: 'Parramatta',
        hoursOrUnknown: 'Mon–Fri',
        firstRequest,
        status: 'published',
        capabilities: [{
          serviceId,
          kind: 'phone_inquiry',
          status: 'available',
          firstRequest,
          callable: false,
          paymentRequired: false,
        }],
      }
    }),
  }
}
