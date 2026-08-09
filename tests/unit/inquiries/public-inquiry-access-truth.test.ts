import { describe, expect, it } from 'vitest'

import type { PublicOfferingSupplyProjection } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { projectPublicInquiryAvailability, projectPublicInquiryOfferingSupply } from '@/modules/inquiries/route-readbacks'

const businessId = brandNonEmpty('business:access-truth', 'BusinessId')
const requiredOfferingRef = brandNonEmpty('offering:demo-plumbing:emergency', 'OfferingRef')
const requiredOfferingRevision = 1
const requiredOfferingSourceHash = canonicalDigest({
  offeringRef: String(requiredOfferingRef),
  revision: requiredOfferingRevision,
})
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
      accessPaths: [accessPath('access:api', {
        kind: 'external_operation',
        name: 'Booking API',
        summary: 'Books a visit.',
        url: 'https://example.test/api',
        provenance: 'business_declared',
      })],
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
      offeringRef: requiredOfferingRef,
      revision: requiredOfferingRevision,
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
      accessPath('access:phone', {
        kind: 'human_request',
        channel: 'phone',
        disclosure: storedInquiryDisclosure,
      }),
      accessPath('access:website', {
        kind: 'human_request',
        channel: 'website',
        disclosure: storedInquiryDisclosure,
        url: 'https://example.test',
      }),
      accessPath('access:ae', {
        kind: 'human_request',
        channel: 'ae_inquiry',
        disclosure: storedInquiryDisclosure,
      }),
    ],
  }]
}
function accessPath(
  accessPathRef: string,
  descriptor: PublicOfferingSupplyProjection['accessPaths'][number]['descriptor'],
): PublicOfferingSupplyProjection['accessPaths'][number] {
  const ref = brandNonEmpty(accessPathRef, 'AccessPathRef')
  return {
    accessPathRef: ref,
    offeringRevision: requiredOfferingRevision,
    offeringSourceHash: requiredOfferingSourceHash,
    sourceHash: canonicalDigest({
      accessPathRef: ref,
      offeringSourceHash: requiredOfferingSourceHash,
      descriptor,
    }),
    descriptor,
  }
}
function catalogHumanPath(
  offeringRef: string,
  accessPathRef: string,
  channel: 'phone' | 'ae_inquiry',
): PublicBusinessCatalogApiV2Dto['offerings'][number]['accessPaths'][number] {
  const descriptor = {
    kind: 'human_request' as const,
    channel,
    disclosure: storedInquiryDisclosure,
  }
  return {
    accessPathRef: brandNonEmpty(accessPathRef, 'AccessPathRef'),
    offeringRevision: 1,
    ...descriptor,
  }
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
        catalogHumanPath(`offering:${slug}`, `access:phone:${slug}`, 'phone'),
        catalogHumanPath(`offering:${slug}`, `access:ae:${slug}`, 'ae_inquiry'),
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
