import { describe, expect, it } from 'vitest'

import { stableHash, type StableHashValue } from '@/modules/common/stable-hash'
import {
  projectCurrentDiscoveryInquiryAvailability,
  projectCurrentPublicInquiryAvailability,
  projectCurrentPublicInquiryPage,
} from '@/modules/registry/public-inquiry-projection'
import type { DiscoveryManifestContract } from '@/modules/discovery/public'
import type { PublicBusinessCatalogApiDto, PublicBusinessCatalogApiPage } from '@/modules/registry/public'

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
