import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import { claimBusiness, createEmptyBusinessSourceState } from '@/modules/business/public'

describe('claimBusiness', () => {
  it('rejects anonymous claims', () => {
    const state = createEmptyBusinessSourceState()

    const result = claimBusiness(state, {
      actor: { kind: 'anonymous', anonymousBucket: 'ip:masked' },
      facts: validFacts(),
      operationKey: brandNonEmpty('op:claim:anonymous', 'OperationKey'),
      correlationId: brandNonEmpty('corr:anonymous', 'CorrelationId'),
      now: 1,
    })

    expect(result).toMatchObject({
      kind: 'error',
      code: 'claim_unauthenticated',
      retryable: false,
    })
    expect(state.businesses).toEqual([])
  })

  it('lets an authenticated owner create a no-ABN claim with valid T0 facts', () => {
    const state = createEmptyBusinessSourceState()

    const result = claimBusiness(state, {
      actor: { kind: 'authenticated_owner', clerkUserId: 'user_123', displayName: 'Sam Owner' },
      facts: validFacts(),
      operationKey: brandNonEmpty('op:claim:sam', 'OperationKey'),
      correlationId: brandNonEmpty('corr:sam', 'CorrelationId'),
      now: 10,
    })

    expect(result).toMatchObject({
      kind: 'ok',
      code: 'claim_created',
      owner: { clerkUserId: 'user_123' },
      business: {
        name: 'Parramatta Emergency Plumbing',
        publicStatus: 'unpublished',
        trustTier: 'claimed',
        claimStatus: 'authenticated',
      },
      claim: { status: 'authenticated' },
    })
    expect(state.owners).toHaveLength(1)
    expect(state.businesses).toHaveLength(1)
    expect(state.claims).toHaveLength(1)
    expect(state.claimFingerprints).toHaveLength(1)
  })

  it('allocates deterministic slug suffixes for non-duplicate slug collisions', () => {
    const state = createEmptyBusinessSourceState()

    claimBusiness(state, {
      actor: { kind: 'authenticated_owner', clerkUserId: 'user_123' },
      facts: validFacts(),
      operationKey: brandNonEmpty('op:claim:first', 'OperationKey'),
      correlationId: brandNonEmpty('corr:first', 'CorrelationId'),
      now: 10,
    })

    const second = claimBusiness(state, {
      actor: { kind: 'authenticated_owner', clerkUserId: 'user_456' },
      facts: {
        ...validFacts(),
        name: 'Parramatta Emergency Electrical',
        category: 'Emergency electrical',
      },
      operationKey: brandNonEmpty('op:claim:second', 'OperationKey'),
      correlationId: brandNonEmpty('corr:second', 'CorrelationId'),
      now: 20,
    })

    expect(second).toMatchObject({
      kind: 'ok',
      code: 'claim_created',
      business: { slug: 'parramatta-emergency-plumbing-2' },
    })
  })

  it('returns pending review for cross-owner duplicate fingerprints without owner details', () => {
    const state = createEmptyBusinessSourceState()

    claimBusiness(state, {
      actor: { kind: 'authenticated_owner', clerkUserId: 'user_123' },
      facts: validFacts(),
      operationKey: brandNonEmpty('op:claim:first-duplicate', 'OperationKey'),
      correlationId: brandNonEmpty('corr:first-duplicate', 'CorrelationId'),
      now: 10,
    })

    const duplicate = claimBusiness(state, {
      actor: { kind: 'authenticated_owner', clerkUserId: 'user_789' },
      facts: {
        ...validFacts(),
        name: '  parramatta emergency plumbing  ',
        requestedSlug: 'parramatta-emergency-plumbing-copy',
      },
      operationKey: brandNonEmpty('op:claim:duplicate', 'OperationKey'),
      correlationId: brandNonEmpty('corr:duplicate', 'CorrelationId'),
      now: 30,
    })

    expect(duplicate).toMatchObject({
      kind: 'error',
      code: 'claim_pending_review',
      retryable: false,
      publicReason: 'duplicate_or_impersonation_review',
      claim: { status: 'contested' },
    })
    expect(JSON.stringify(duplicate)).not.toContain('user_123')
    expect(state.businesses).toHaveLength(1)
    expect(state.claims).toHaveLength(2)
  })
})

function validFacts() {
  return {
    name: 'Parramatta Emergency Plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    requestedSlug: 'parramatta-emergency-plumbing',
    sourceRefs: [
      {
        label: 'Owner supplied',
        evidenceRef: 'private:evidence:1',
        sourceHash: brandNonEmpty('hash:source:1', 'SourceHash'),
      },
    ],
  }
}
