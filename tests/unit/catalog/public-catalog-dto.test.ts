import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import { buildPublicCatalogDto } from '@/modules/catalog/public'

describe('public catalog DTO', () => {
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
            publicDisclosure: 'First request is not available yet.',
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
        publicStatus: 'published',
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
