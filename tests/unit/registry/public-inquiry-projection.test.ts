import { describe, expect, it } from 'vitest'

import {
  projectCurrentPublicInquiryAvailability,
  projectCurrentPublicInquiryPage,
} from '@/modules/registry/public-inquiry-projection'
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
})
