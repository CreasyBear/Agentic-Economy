import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import { claimBusiness, createEmptyBusinessSourceState } from '@/modules/business/public'

describe('claimBusiness', () => {
  it('rejects anonymous claims', () => {
    const state = createEmptyBusinessSourceState()

    const result = claimBusiness(state, {
      actor: { kind: 'anonymous', anonymousBucket: 'ip:masked' },
      facts: validFacts(),
      security: validSecurity('anonymous'),
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
      security: validSecurity('sam'),
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
    expect(state.abuseRateLimitBuckets).toHaveLength(1)
  })

  it('rejects missing and foreign CSRF before creating source records', () => {
    const missingState = createEmptyBusinessSourceState()
    const missing = claimBusiness(missingState, {
      actor: { kind: 'authenticated_owner', clerkUserId: 'user_csrf' },
      facts: validFacts(),
      security: {
        csrf: { allowedOrigins: ['https://ae.example'] },
        rateLimit: rateLimit('csrf-missing'),
      },
      operationKey: brandNonEmpty('op:claim:csrf-missing', 'OperationKey'),
      correlationId: brandNonEmpty('corr:csrf-missing', 'CorrelationId'),
      now: 1,
    })

    const foreignState = createEmptyBusinessSourceState()
    const foreign = claimBusiness(foreignState, {
      actor: { kind: 'authenticated_owner', clerkUserId: 'user_csrf_foreign' },
      facts: validFacts(),
      security: {
        csrf: { origin: 'https://evil.example', allowedOrigins: ['https://ae.example'] },
        rateLimit: rateLimit('csrf-foreign'),
      },
      operationKey: brandNonEmpty('op:claim:csrf-foreign', 'OperationKey'),
      correlationId: brandNonEmpty('corr:csrf-foreign', 'CorrelationId'),
      now: 1,
    })

    expect(missing).toMatchObject({ kind: 'error', code: 'claim_csrf_rejected', reason: 'missing_csrf' })
    expect(foreign).toMatchObject({ kind: 'error', code: 'claim_csrf_rejected', reason: 'foreign_origin' })
    expect(missingState.businesses).toEqual([])
    expect(foreignState.businesses).toEqual([])
  })

  it('accepts same-site origin and rate-limits repeated claim attempts through source state', () => {
    const state = createEmptyBusinessSourceState()
    const first = claimBusiness(state, {
      actor: { kind: 'authenticated_owner', clerkUserId: 'user_limit' },
      facts: validFacts(),
      security: {
        csrf: { origin: 'https://ae.example', allowedOrigins: ['https://ae.example'] },
        rateLimit: { ...rateLimit('same-bucket'), limit: 1 },
      },
      operationKey: brandNonEmpty('op:claim:limited-first', 'OperationKey'),
      correlationId: brandNonEmpty('corr:limited-first', 'CorrelationId'),
      now: 10,
    })

    const second = claimBusiness(state, {
      actor: { kind: 'authenticated_owner', clerkUserId: 'user_limit_2' },
      facts: { ...validFacts(), name: 'Different Emergency Plumbing', requestedSlug: 'different-emergency-plumbing' },
      security: {
        csrf: { origin: 'https://ae.example', allowedOrigins: ['https://ae.example'] },
        rateLimit: { ...rateLimit('same-bucket'), limit: 1 },
      },
      operationKey: brandNonEmpty('op:claim:limited-second', 'OperationKey'),
      correlationId: brandNonEmpty('corr:limited-second', 'CorrelationId'),
      now: 20,
    })

    expect(first).toMatchObject({ kind: 'ok', code: 'claim_created' })
    expect(second).toMatchObject({ kind: 'error', code: 'claim_rate_limited', retryable: true })
    expect(state.abuseRateLimitBuckets).toMatchObject([{ key: 'same-bucket', state: 'limited' }])
  })

  it('allocates deterministic slug suffixes for non-duplicate slug collisions', () => {
    const state = createEmptyBusinessSourceState()

    claimBusiness(state, {
      actor: { kind: 'authenticated_owner', clerkUserId: 'user_123' },
      facts: validFacts(),
      security: validSecurity('first'),
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
      security: validSecurity('second'),
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
      security: validSecurity('first-duplicate'),
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
      security: validSecurity('duplicate'),
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

function validSecurity(key: string) {
  return {
    csrf: {
      csrfToken: `csrf-${key}`,
      csrfCookie: `csrf-${key}`,
      allowedOrigins: ['https://ae.example'],
    },
    rateLimit: rateLimit(key),
  }
}

function rateLimit(key: string) {
  return {
    scope: 'claim_submit' as const,
    key,
    now: 1_000,
    limit: 5,
    windowMs: 60_000,
  }
}
