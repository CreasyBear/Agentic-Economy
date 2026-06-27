import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import { allocateDeterministicSlug, detectDuplicateClaim } from '@/modules/security/public'

describe('duplicate claim controls', () => {
  it('normalizes claim fingerprints and returns no owner details for impersonation review', () => {
    const ownerId = brandNonEmpty('owner:1', 'OwnerId')
    const decision = detectDuplicateClaim(
      [
        {
          fingerprint: 'parramatta emergency plumbing|emergency plumbing|parramatta|nsw',
          status: 'clear',
          businessSlug: brandNonEmpty('parramatta-emergency-plumbing', 'Slug'),
          ownerId,
          claimId: brandNonEmpty('claim:1', 'ClaimId'),
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      {
        name: 'Parramatta Emergency Plumbing',
        category: 'Emergency Plumbing',
        suburb: 'Parramatta',
        stateTerritory: 'NSW',
      },
      brandNonEmpty('owner:2', 'OwnerId')
    )

    expect(decision).toEqual({
      kind: 'pending_review',
      fingerprint: 'parramatta emergency plumbing|emergency plumbing|parramatta|nsw',
      publicReason: 'duplicate_or_impersonation_review',
    })
  })

  it('allocates deterministic slug suffixes', () => {
    expect(
      allocateDeterministicSlug('Parramatta Emergency Plumbing', [
        brandNonEmpty('parramatta-emergency-plumbing', 'Slug'),
        brandNonEmpty('parramatta-emergency-plumbing-2', 'Slug'),
      ])
    ).toBe('parramatta-emergency-plumbing-3')
  })
})
