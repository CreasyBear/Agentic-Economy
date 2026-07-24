import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import { buildPublicCatalogDto } from '@/modules/catalog/public'

describe('public catalog DTO', () => {
  it('keeps a published business visible before it publishes an offering', () => {
    const result = buildPublicCatalogDto({
      business: {
        businessId: brandNonEmpty('business:visible-only', 'BusinessId'),
        ownerId: brandNonEmpty('owner:visible-only', 'OwnerId'),
        slug: brandNonEmpty('visible-only', 'Slug'),
        name: 'Visible Only',
        normalizedName: 'visible only',
        category: 'Engineering services',
        suburb: 'Perth',
        stateTerritory: 'WA',
        publicStatus: 'published',
        trustTier: 'claimed',
        claimStatus: 'published',
        sourceHash: brandNonEmpty('hash:visible-only', 'SourceHash'),
        createdAt: 1,
        updatedAt: 2,
      },
      context: {
        businessId: brandNonEmpty('business:visible-only', 'BusinessId'),
        category: 'Engineering services',
        suburb: 'Perth',
        stateTerritory: 'WA',
        sourceRefs: [],
        sourceHash: brandNonEmpty('hash:visible-only', 'SourceHash'),
        approvedAt: 2,
      },
      services: [],
      capabilities: [],
      indexStatus: 'queued',
      discoveryStatus: 'degraded',
    })

    expect(result).toMatchObject({
      kind: 'available',
      catalog: {
        slug: 'visible-only',
        services: [],
      },
    })
  })

  it('returns only allowlisted public service fields', () => {
    const result = buildPublicCatalogDto({
      business: {
        businessId: brandNonEmpty('business:parramatta', 'BusinessId'),
        ownerId: brandNonEmpty('owner:sam', 'OwnerId'),
        slug: brandNonEmpty('parramatta-emergency-plumbing', 'Slug'),
        name: 'Parramatta Emergency Plumbing',
        normalizedName: 'parramatta emergency plumbing',
        category: 'Emergency plumbing',
        suburb: 'Parramatta',
        stateTerritory: 'NSW',
        publishedPhone: '0412 345 678',
        publicStatus: 'published',
        trustTier: 'claimed',
        claimStatus: 'published',
        sourceHash: brandNonEmpty('hash:business', 'SourceHash'),
        createdAt: 1,
        updatedAt: 2,
      },
      context: {
        businessId: brandNonEmpty('business:parramatta', 'BusinessId'),
        category: 'Emergency plumbing',
        suburb: 'Parramatta',
        stateTerritory: 'NSW',
        sourceRefs: [],
        sourceHash: brandNonEmpty('hash:business', 'SourceHash'),
        approvedAt: 2,
      },
      services: [
        {
          serviceId: brandNonEmpty('service:pipe', 'ServiceId'),
          serviceSlug: brandNonEmpty('pipe-repair', 'Slug'),
          businessId: brandNonEmpty('business:parramatta', 'BusinessId'),
          name: 'Emergency pipe repair',
          category: 'Emergency plumbing',
          summary: 'Burst pipe triage and repair.',
          serviceArea: 'Parramatta and nearby suburbs',
          hoursOrUnknown: 'Hours supplied by owner',
          status: 'published',
          sortOrder: 0,
          sourceHash: brandNonEmpty('hash:service', 'SourceHash'),
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      capabilities: [
        {
          businessId: brandNonEmpty('business:parramatta', 'BusinessId'),
          serviceId: brandNonEmpty('service:pipe', 'ServiceId'),
          kind: 'phone_inquiry',
          status: 'unavailable',
          firstRequest: {
            mode: 'not_available_yet',
            publicDisclosure: 'This business has not published a request path.',
            publicChannel: 'not_available',
            noContactReason: 'Owner has not supplied public contact instructions.',
            rawContactExcluded: true,
          },
          callable: false,
          paymentRequired: false,
          reason: 'Owner has not supplied public contact instructions.',
          sourceHash: brandNonEmpty('hash:capability', 'SourceHash'),
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      indexStatus: 'queued',
      discoveryStatus: 'degraded',
    })

    expect(result).toMatchObject({
      kind: 'available',
      catalog: {
        slug: 'parramatta-emergency-plumbing',
        stateTerritory: 'NSW',
        publishedPhone: '0412 345 678',
        publicStatus: 'published',
        photos: [],
        services: [
          {
            firstRequest: { mode: 'not_available_yet', rawContactExcluded: true },
            capabilities: [{ status: 'unavailable', callable: false, paymentRequired: false }],
          },
        ],
      },
    })
    expect(JSON.stringify(result)).not.toContain('ownerId')
    expect(JSON.stringify(result)).not.toContain('sam-owner@example.test')
  })
})
