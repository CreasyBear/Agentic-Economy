import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { buildCatalogDiscoveryManifest } from '@/modules/discovery/public'
import {
  projectCurrentDiscoveryInquiryAvailability,
  projectCurrentOfferingInquiryAvailability,
  projectCurrentOfferingInquiryDetail,
  projectCurrentOfferingInquiryPage,
} from '@/modules/registry/public-inquiry-projection'
import type { DiscoveryManifestContract } from '@/modules/discovery/public'
import type {
  PublicBusinessCatalogApiV2Dto,
  PublicBusinessCatalogApiV2Page,
  PublicOfferingDto,
} from '@/modules/registry/public'



describe('public inquiry availability projection', () => {
  it('projects the same fail-closed inquiry truth into UCP and rebinds its hashes', async () => {
    const manifest = inquiryManifest()

    const projected = await projectCurrentDiscoveryInquiryAvailability(manifest, {
      readAvailability: async (targets) => targets.map((target) => ({ ...target, admitted: false })),
    })

    expect(projected.offerings[0]?.accessPaths).toEqual([
      phonePath,
      { ...externalPath, name: 'Quote untrusted claim' },
    ])
    expect(projected.offerings[0]?.accessPaths).not.toContain(aeInquiryPath)
    expect(projected.bodyHash).not.toBe(manifest.bodyHash)
    expect(projected.generatedHash).not.toBe(manifest.generatedHash)
    const {
      bodyHash,
      generatedAt: _generatedAt,
      generatedHash,
      urlHash,
      ...body
    } = projected
    expect(bodyHash).toBe(canonicalDigest(body as StableHashValue))
    expect(urlHash).toBe(canonicalDigest({ urls: projected.routes.map(({ url }) => url) }))
    expect(generatedHash).toBe(canonicalDigest({
      bodyHash, sourceHash: projected.sourceHash, sourceVersion: projected.sourceVersion, urlHash,
    }))
  })

  it('preserves an admitted UCP manifest and its integrity hashes exactly', async () => {
    const manifest = inquiryManifest()
    const projected = await projectCurrentDiscoveryInquiryAvailability(manifest, {
      readAvailability: async (targets) => targets.map((target) => ({ ...target, admitted: true })),
    })

    expect(projected).toBe(manifest)
  })
})

function inquiryManifest(): DiscoveryManifestContract {
  const result = buildCatalogDiscoveryManifest({
    catalog: offeringBusiness,
    canonicalBaseUrl: 'https://ae.test',
    now: 2,
    sourceHash: canonicalDigest('source'),
  })
  if (result.kind !== 'available') {
    throw new Error('Expected an available discovery manifest.')
  }
  return result.manifest
}

const offeringRef = 'offering:perth-hvac-repair:emergency-hvac-assessment'
const offeringRevision = 1
const offeringSourceHash = canonicalDigest({ offeringRef, revision: offeringRevision })
const aeInquiryDescriptor = {
  kind: 'human_request' as const,
  channel: 'ae_inquiry' as const,
  disclosure: 'Use the inquiry form for a first contact.',
}
const aeInquiryPath = {
  accessPathRef: 'access:perth-hvac-repair:emergency-hvac-assessment',
  offeringRevision,
  offeringSourceHash,
  sourceHash: canonicalDigest({
    accessPathRef: 'access:perth-hvac-repair:emergency-hvac-assessment',
    offeringSourceHash,
    descriptor: aeInquiryDescriptor,
  }),
  ...aeInquiryDescriptor,
} as const
const phoneDescriptor = {
  kind: 'human_request' as const,
  channel: 'phone' as const,
  disclosure: 'Call the published number.',
}
const phonePath = {
  accessPathRef: 'access:perth-hvac-repair:phone',
  offeringRevision,
  offeringSourceHash,
  sourceHash: canonicalDigest({
    accessPathRef: 'access:perth-hvac-repair:phone',
    offeringSourceHash,
    descriptor: phoneDescriptor,
  }),
  ...phoneDescriptor,
} as const
const externalDescriptor = {
  kind: 'external_operation' as const,
  name: 'Quote endpoint',
  summary: 'Machine-readable quote request.',
  url: 'https://ae.test/quote',
  provenance: 'business_declared' as const,
}
const externalPath = {
  accessPathRef: 'access:perth-hvac-repair:quote-api',
  offeringRevision,
  offeringSourceHash,
  sourceHash: canonicalDigest({
    accessPathRef: 'access:perth-hvac-repair:quote-api',
    offeringSourceHash,
    descriptor: externalDescriptor,
  }),
  ...externalDescriptor,
} as const
const offering = {
  offeringRef,
  revision: offeringRevision,
  name: 'Emergency HVAC assessment',
  category: 'HVAC',
  summary: 'Assessment and written quote.',
  serviceAreaSummary: 'Perth CBD',
  availabilitySummary: '08:00-18:00',
  accessPaths: [aeInquiryPath, phonePath, externalPath],
  support: { integrated: false, aeSupportedAction: false },
} satisfies PublicOfferingDto

const offeringBusiness = {
  schemaVersion: 'public-business-catalog-api:v2',
  businessId: 'business:perth-hvac-repair',
  slug: 'perth-hvac-repair',
  name: 'Perth HVAC Repair',
  category: 'HVAC',
  businessContext: {
    kind: 'local_human',
    suburb: 'Perth',
    stateTerritory: 'WA',
    publishedPhone: '0412 000 000',
  },
  publicUrl: '/perth-hvac-repair',
  trustTier: 'claimed',
  photos: [],
  observedAt: 1,
  disposition: 'current',
  offerings: [offering],
  accessSummary: { humanRequest: true, externalOperation: true, aeSupportedAction: false },
} satisfies PublicBusinessCatalogApiV2Dto

describe('offering supply inquiry availability projection', () => {
  it('drops only the unadmitted ae_inquiry path and leaves every other access path intact', async () => {
    const projected = await projectCurrentOfferingInquiryAvailability(offeringBusiness, {
      readAvailability: async (targets) => targets.map((target) => ({ ...target, admitted: false })),
    })

    expect(projected.offerings[0]?.accessPaths).toEqual([phonePath, externalPath])
    expect(projected.accessSummary).toEqual({
      humanRequest: true,
      externalOperation: true,
      aeSupportedAction: false,
    })
    expect(projected.offerings[0]).toMatchObject({
      offeringRef: offering.offeringRef,
      name: 'Emergency HVAC assessment',
      availabilitySummary: '08:00-18:00',
    })
  })

  it('reports no human request left when the ae_inquiry path was the only one', async () => {
    const inquiryOnly = {
      ...offeringBusiness,
      offerings: [{ ...offering, accessPaths: [aeInquiryPath] }],
      accessSummary: { humanRequest: true, externalOperation: false, aeSupportedAction: false },
    } satisfies PublicBusinessCatalogApiV2Dto

    const projected = await projectCurrentOfferingInquiryAvailability(inquiryOnly, {
      readAvailability: async (targets) => targets.map((target) => ({ ...target, admitted: false })),
    })

    expect(projected.offerings[0]?.accessPaths).toEqual([])
    expect(projected.accessSummary.humanRequest).toBe(false)
  })

  it('preserves an admitted offering exactly', async () => {
    const projected = await projectCurrentOfferingInquiryAvailability(offeringBusiness, {
      readAvailability: async (targets) => targets.map((target) => ({ ...target, admitted: true })),
    })

    expect(projected).toBe(offeringBusiness)
  })

  it('keeps the ae_inquiry path when its Offering is admitted', async () => {
    const projected = await projectCurrentOfferingInquiryAvailability(offeringBusiness, {
      readAvailability: async (targets) => targets.map((target) => ({
        ...target,
        admitted: true,
      })),
    })

    expect(projected).toBe(offeringBusiness)
  })

  it('fails closed when current admission cannot be read', async () => {
    const projected = await projectCurrentOfferingInquiryAvailability(offeringBusiness, {
      readAvailability: async () => [],
    })

    expect(projected.offerings[0]?.accessPaths).toEqual([phonePath, externalPath])
  })

  it('asks the source for one admission target per Offering', async () => {
    const seen: unknown[] = []
    await projectCurrentOfferingInquiryAvailability(offeringBusiness, {
      readAvailability: async (targets) => {
        seen.push(...targets)
        return targets.map((target) => ({ ...target, admitted: true }))
      },
    })

    expect(seen).toEqual([
      { businessSlug: 'perth-hvac-repair', offeringRef: offering.offeringRef },
    ])
  })

  it('reads an Offering directly by its canonical ref without parsing a legacy slug', async () => {
    const nativeBusiness = {
      ...offeringBusiness,
      offerings: [{ ...offering, offeringRef: 'offering:service-id-abc123' }],
    } satisfies PublicBusinessCatalogApiV2Dto
    let reads = 0

    const projected = await projectCurrentOfferingInquiryAvailability(nativeBusiness, {
      readAvailability: async (targets) => {
        reads += 1
        return targets.map((target) => ({ ...target, admitted: false }))
      },
    })

    expect(reads).toBe(1)
    expect(projected.offerings[0]?.accessPaths).toEqual([phonePath, externalPath])
  })

  it('reads an Offering even when its ref does not encode the current business slug', async () => {
    const mismatched = {
      ...offeringBusiness,
      offerings: [{ ...offering, offeringRef: 'offering:other-business:emergency-hvac-assessment' }],
    } satisfies PublicBusinessCatalogApiV2Dto
    let reads = 0

    const projected = await projectCurrentOfferingInquiryAvailability(mismatched, {
      readAvailability: async (targets) => {
        reads += 1
        return targets.map((target) => ({ ...target, admitted: false }))
      },
    })

    expect(reads).toBe(1)
    expect(projected.offerings[0]?.accessPaths).toEqual([phonePath, externalPath])
  })

  it('checks an offering page in one bounded source read', async () => {
    let reads = 0
    const second = {
      ...offeringBusiness,
      slug: 'fremantle-hvac-repair',
      offerings: [{
        ...offering,
        offeringRef: 'offering:fremantle-hvac-repair:emergency-hvac-assessment',
      }],
    } satisfies PublicBusinessCatalogApiV2Dto
    const page = {
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v2',
      page: [offeringBusiness, second],
      isDone: true,
      continueCursor: '2',
    } satisfies PublicBusinessCatalogApiV2Page

    const projected = await projectCurrentOfferingInquiryPage(page, {
      readAvailability: async (targets) => {
        reads += 1
        expect(targets).toHaveLength(2)
        return targets.map((target) => ({ ...target, admitted: false }))
      },
    })

    expect(reads).toBe(1)
    expect(projected.page.map((item) => item.offerings[0]?.accessPaths)).toEqual([
      [phonePath, externalPath],
      [phonePath, externalPath],
    ])
  })

  it('splits a page wider than one bounded read instead of losing every admission', async () => {
    const items = Array.from({ length: 120 }, (_, index) => ({
      ...offeringBusiness,
      slug: `hvac-${index}`,
      offerings: [{ ...offering, offeringRef: `offering:hvac-${index}:emergency-hvac-assessment` }],
    } satisfies PublicBusinessCatalogApiV2Dto))
    const page = {
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v2',
      page: items,
      isDone: true,
      continueCursor: '120',
    } satisfies PublicBusinessCatalogApiV2Page
    const batches: number[] = []

    const projected = await projectCurrentOfferingInquiryPage(page, {
      readAvailability: async (targets) => {
        batches.push(targets.length)
        return targets.map((target) => ({ ...target, admitted: true }))
      },
    })

    expect(batches).toEqual([100, 20])
    expect(projected.page.every((item) => item.offerings[0]?.accessPaths.length === 3)).toBe(true)
  })

  it('passes a not_found detail through untouched', async () => {
    const notFound = {
      kind: 'not_found',
      code: 'business_not_found',
      reason: 'No public business catalog exists for this slug.',
    } as const

    const projected = await projectCurrentOfferingInquiryDetail(notFound, {
      readAvailability: async () => {
        throw new Error('A not_found detail must not read admission.')
      },
    })

    expect(projected).toBe(notFound)
  })

  it('applies admission to a found detail', async () => {
    const projected = await projectCurrentOfferingInquiryDetail({
      kind: 'found',
      schemaVersion: 'public-business-catalog-api:v2',
      business: offeringBusiness,
    }, {
      readAvailability: async (targets) => targets.map((target) => ({ ...target, admitted: false })),
    })

    if (projected.kind !== 'found') {
      throw new Error('Expected a found detail.')
    }
    expect(projected.business.offerings[0]?.accessPaths).toEqual([phonePath, externalPath])
  })
})
