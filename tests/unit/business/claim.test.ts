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
