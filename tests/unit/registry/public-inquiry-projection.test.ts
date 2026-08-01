import { describe, expect, it } from 'vitest'

import { stableHash, type StableHashValue } from '@/modules/common/stable-hash'
import {
  projectCurrentDiscoveryInquiryAvailability,
  projectCurrentOfferingInquiryAvailability,
  projectCurrentOfferingInquiryDetail,
  projectCurrentOfferingInquiryPage,
  projectCurrentPublicInquiryAvailability,
  projectCurrentPublicInquiryPage,
} from '@/modules/registry/public-inquiry-projection'
import type { DiscoveryManifestContract } from '@/modules/discovery/public'
import type {
  PublicBusinessCatalogApiDto,
  PublicBusinessCatalogApiPage,
  PublicBusinessCatalogApiV2Dto,
  PublicBusinessCatalogApiV2Page,
  PublicOfferingDto,
} from '@/modules/registry/public'

const business = {
  slug: 'perth-hvac-repair',
  name: 'Perth HVAC Repair',
  category: 'HVAC',
  suburb: 'Perth',
  stateTerritory: 'WA',
  publicUrl: '/perth-hvac-repair',
  trustTier: 'claimed',
  publicStatus: 'published',
  indexStatus: 'indexed',
  discoveryStatus: 'available',
  schemaVersion: 'public-business-catalog-api:v1',
  updatedAt: 1,
  photos: [],
  services: [{
    slug: 'emergency-hvac-assessment',
    name: 'Emergency HVAC assessment',
    category: 'HVAC',
    summary: 'Assessment and written quote.',
    serviceArea: 'Perth CBD',
    hoursOrUnknown: '08:00-18:00',
    firstRequest: {
      mode: 'inquiry_available',
      publicDisclosure: 'Use the inquiry form for a first contact.',
      publicChannel: 'public_business_contact',
    },
    status: 'published',
    capabilities: [
      { kind: 'phone_inquiry', status: 'available' },
      { kind: 'ae_hosted_discovery', status: 'available' },
    ],
  }],
} satisfies PublicBusinessCatalogApiDto

describe('public inquiry availability projection', () => {
  it('fails closed when the current target has no resolvable recipient', async () => {
    const projected = await projectCurrentPublicInquiryAvailability(business, {
      readAvailability: async (targets) => targets.map((target) => ({ ...target, admitted: false })),
    })

    expect(projected.services[0]).toMatchObject({
      firstRequest: {
        mode: 'not_available_yet',
        publicChannel: 'not_available',
        noContactReason: 'This business isn’t receiving inquiries through AE yet.',
      },
      capabilities: [
        { kind: 'phone_inquiry', status: 'unavailable' },
        { kind: 'ae_hosted_discovery', status: 'available' },
      ],
    })
  })

  it('preserves an admitted inquiry service exactly', async () => {
    const projected = await projectCurrentPublicInquiryAvailability(business, {
      readAvailability: async (targets) => targets.map((target) => ({ ...target, admitted: true })),
    })

    expect(projected).toEqual(business)
  })

  it('fails closed when current admission cannot be read', async () => {
    const projected = await projectCurrentPublicInquiryAvailability(business, {
      readAvailability: async () => [],
    })

    expect(projected.services[0]?.firstRequest.mode).toBe('not_available_yet')
    expect(projected.services[0]?.capabilities[0]?.status).toBe('unavailable')
  })

  it('checks a catalog page in one bounded source read', async () => {
    let reads = 0
    const second = { ...business, slug: 'fremantle-hvac-repair' }
    const page = {
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v1',
      items: [business, second],
      pagination: { limit: 20, total: 2, hasMore: false },
    } satisfies PublicBusinessCatalogApiPage

    const projected = await projectCurrentPublicInquiryPage(page, {
      readAvailability: async (targets) => {
        reads += 1
        expect(targets).toHaveLength(2)
        return targets.map((target) => ({ ...target, admitted: false }))
      },
    })

    expect(reads).toBe(1)
    expect(projected.items.map((item) => item.services[0]?.firstRequest.mode)).toEqual([
      'not_available_yet',
      'not_available_yet',
    ])
  })

  it('projects the same fail-closed inquiry truth into UCP and rebinds its hashes', async () => {
    const manifest = inquiryManifest()

    const projected = await projectCurrentDiscoveryInquiryAvailability(manifest, {
      readAvailability: async (targets) => targets.map((target) => ({ ...target, admitted: false })),
    })

    expect(projected.services[0]?.capabilities[0]).toMatchObject({
      status: 'unavailable', callable: false, paymentRequired: false,
      firstRequest: {
        mode: 'not_available_yet', publicChannel: 'not_available',
        noContactReason: 'This business isn’t receiving inquiries through AE yet.',
      },
    })
    expect(projected.bodyHash).not.toBe(manifest.bodyHash)
    expect(projected.generatedHash).not.toBe(manifest.generatedHash)
    const {
      bodyHash,
      generatedAt: _generatedAt,
      generatedHash,
      urlHash,
      ...body
    } = projected
    expect(bodyHash).toBe(stableHash(body as StableHashValue))
    expect(urlHash).toBe(stableHash({ urls: projected.routes.map(({ url }) => url) }))
    expect(generatedHash).toBe(stableHash({
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
  return {
    schemaVersion: 'ae-ucp-fallback:v1', businessId: 'business:transport', slug: 'accessible-transfer',
    businessName: 'Accessible Transfer', category: 'Transport',
    location: { suburb: 'Perth', stateTerritory: 'WA' },
    publicUrl: 'https://ae.test/accessible-transfer', manifestUrl: 'https://ae.test/accessible-transfer/ucp',
    ucpVersion: 'v1', pathKind: 'ae_hosted_fallback', status: 'degraded',
    sourceHash: 'hash:source', sourceVersion: 'public-catalog:v1', generatedHash: 'hash:generated',
    bodyHash: 'hash:body', urlHash: 'hash:urls', generatedAt: 2, updatedAt: 1,
    routes: [], unsupportedCapabilities: { callable: false, paymentRequired: false },
    services: [{
      slug: 'airport-transfer', name: 'Airport transfer', category: 'Transport', summary: 'Plan a transfer.',
      serviceArea: 'Perth', hoursOrUnknown: 'Unknown', status: 'published',
      capabilities: [{
        kind: 'phone_inquiry', status: 'available', callable: false, paymentRequired: false,
        firstRequest: {
          mode: 'inquiry_available', publicChannel: 'ae_status_only',
          publicDisclosure: 'Sandbox planning only.',
        },
      }],
    }],
  } as unknown as DiscoveryManifestContract
}

const aeInquiryPath = {
  accessPathRef: 'legacy-access:perth-hvac-repair:emergency-hvac-assessment',
  kind: 'human_request',
  channel: 'ae_inquiry',
  disclosure: 'Use the inquiry form for a first contact.',
} as const

const phonePath = {
  accessPathRef: 'legacy-access:perth-hvac-repair:phone',
  kind: 'human_request',
  channel: 'phone',
  disclosure: 'Call the published number.',
} as const

const externalPath = {
  accessPathRef: 'legacy-access:perth-hvac-repair:quote-api',
  kind: 'external_operation',
  name: 'Quote endpoint',
  summary: 'Machine-readable quote request.',
  url: 'https://ae.test/quote',
  provenance: 'business_declared',
} as const

const legacyOffering = {
  offeringRef: 'legacy-offering:perth-hvac-repair:emergency-hvac-assessment',
  revision: 1,
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
  businessId: 'legacy-business:perth-hvac-repair',
  slug: 'perth-hvac-repair',
  name: 'Perth HVAC Repair',
  category: 'HVAC',
  suburb: 'Perth',
  stateTerritory: 'WA',
  publishedPhone: '0412 000 000',
  publicUrl: '/perth-hvac-repair',
  trustTier: 'claimed',
  photos: [],
  observedAt: 1,
  disposition: 'current',
  offerings: [legacyOffering],
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
      offeringRef: legacyOffering.offeringRef,
      name: 'Emergency HVAC assessment',
      availabilitySummary: '08:00-18:00',
    })
  })

  it('reports no human request left when the ae_inquiry path was the only one', async () => {
    const inquiryOnly = {
      ...offeringBusiness,
      offerings: [{ ...legacyOffering, accessPaths: [aeInquiryPath] }],
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

  it('keeps the ae_inquiry path when either inquiry capability is admitted', async () => {
    const projected = await projectCurrentOfferingInquiryAvailability(offeringBusiness, {
      readAvailability: async (targets) => targets.map((target) => ({
        ...target,
        admitted: target.capabilityKind === 'quote_request',
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

  it('asks the source for both inquiry capability kinds under the offering ref service slug', async () => {
    const seen: unknown[] = []
    await projectCurrentOfferingInquiryAvailability(offeringBusiness, {
      readAvailability: async (targets) => {
        seen.push(...targets)
        return targets.map((target) => ({ ...target, admitted: true }))
      },
    })

    expect(seen).toEqual([
      { businessSlug: 'perth-hvac-repair', serviceSlug: 'emergency-hvac-assessment', capabilityKind: 'phone_inquiry' },
      { businessSlug: 'perth-hvac-repair', serviceSlug: 'emergency-hvac-assessment', capabilityKind: 'quote_request' },
    ])
  })

  it('leaves an offering with no admission key unevaluated instead of guessing one', async () => {
    // A natively projected offering ref carries a source document id, not the
    // service slug the admission source is keyed by.
    const nativeBusiness = {
      ...offeringBusiness,
      offerings: [{ ...legacyOffering, offeringRef: 'offering:service-id-abc123' }],
    } satisfies PublicBusinessCatalogApiV2Dto
    let reads = 0

    const projected = await projectCurrentOfferingInquiryAvailability(nativeBusiness, {
      readAvailability: async (targets) => {
        reads += 1
        return targets.map((target) => ({ ...target, admitted: false }))
      },
    })

    expect(reads).toBe(0)
    expect(projected).toBe(nativeBusiness)
  })

  it('ignores a legacy ref that belongs to a different business', async () => {
    const mismatched = {
      ...offeringBusiness,
      offerings: [{ ...legacyOffering, offeringRef: 'legacy-offering:other-business:emergency-hvac-assessment' }],
    } satisfies PublicBusinessCatalogApiV2Dto
    let reads = 0

    const projected = await projectCurrentOfferingInquiryAvailability(mismatched, {
      readAvailability: async (targets) => {
        reads += 1
        return targets.map((target) => ({ ...target, admitted: false }))
      },
    })

    expect(reads).toBe(0)
    expect(projected).toBe(mismatched)
  })

  it('checks an offering page in one bounded source read', async () => {
    let reads = 0
    const second = {
      ...offeringBusiness,
      slug: 'fremantle-hvac-repair',
      offerings: [{
        ...legacyOffering,
        offeringRef: 'legacy-offering:fremantle-hvac-repair:emergency-hvac-assessment',
      }],
    } satisfies PublicBusinessCatalogApiV2Dto
    const page = {
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v2',
      items: [offeringBusiness, second],
      pagination: { limit: 20, total: 2, hasMore: false },
    } satisfies PublicBusinessCatalogApiV2Page

    const projected = await projectCurrentOfferingInquiryPage(page, {
      readAvailability: async (targets) => {
        reads += 1
        expect(targets).toHaveLength(4)
        return targets.map((target) => ({ ...target, admitted: false }))
      },
    })

    expect(reads).toBe(1)
    expect(projected.items.map((item) => item.offerings[0]?.accessPaths)).toEqual([
      [phonePath, externalPath],
      [phonePath, externalPath],
    ])
  })

  it('splits a page wider than one bounded read instead of losing every admission', async () => {
    const items = Array.from({ length: 60 }, (_, index) => ({
      ...offeringBusiness,
      slug: `hvac-${index}`,
      offerings: [{ ...legacyOffering, offeringRef: `legacy-offering:hvac-${index}:emergency-hvac-assessment` }],
    } satisfies PublicBusinessCatalogApiV2Dto))
    const page = {
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v2',
      items,
      pagination: { limit: 60, total: 60, hasMore: false },
    } satisfies PublicBusinessCatalogApiV2Page
    const batches: number[] = []

    const projected = await projectCurrentOfferingInquiryPage(page, {
      readAvailability: async (targets) => {
        batches.push(targets.length)
        return targets.map((target) => ({ ...target, admitted: true }))
      },
    })

    expect(batches).toEqual([100, 20])
    expect(projected.items.every((item) => item.offerings[0]?.accessPaths.length === 3)).toBe(true)
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
