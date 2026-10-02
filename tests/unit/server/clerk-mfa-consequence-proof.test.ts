import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readClerkMfaConsequenceProof } from '@/lib/server/clerk-consequence-proof'

const clerk = vi.hoisted(() => ({ auth: vi.fn() }))
vi.mock('@clerk/tanstack-react-start/server', () => clerk)
const now = 1_800_000_000_000

function session(overrides = {}) {
  return { isAuthenticated: true, userId: 'user_owner',
    has: vi.fn().mockReturnValue(true),
    factorVerificationAge: [1, 2],
    sessionClaims: { reverification_id: 'reverify:one', iat: now / 1_000 },
    ...overrides }
}

beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(now); clerk.auth.mockReset() })
afterEach(() => vi.restoreAllMocks())

describe('server Clerk MFA evidence', () => {
  it('uses one verified Clerk session and preserves its subject, factor ages, ID and token issue time', async () => {
    const identity = session({ sessionClaims: { reverification_id: 'reverify:one', iat: now / 1_000 - 30 } })
    clerk.auth.mockResolvedValue(identity)
    expect(await readClerkMfaConsequenceProof()).toEqual({
      reverificationId: 'reverify:one', firstFactorAgeMinutes: 1, secondFactorAgeMinutes: 2,
      subject: 'user_owner', evidenceObservedAt: now - 30_000,
    })
    expect(clerk.auth).toHaveBeenCalledTimes(1)
    expect(identity.has).toHaveBeenCalledWith({ reverification: 'strict_mfa' })
  })

  it.each([
    ['no session', { isAuthenticated: false }],
    ['first factor only despite SDK fallback', { factorVerificationAge: [0, -1] }],
    ['stale first factor', { factorVerificationAge: [10, 0] }],
    ['stale second factor', { factorVerificationAge: [0, 10] }],
    ['missing factor ages', { factorVerificationAge: null }],
    ['fractional age', { factorVerificationAge: [0.5, 0] }],
    ['missing reverification ID', { sessionClaims: { iat: now / 1_000 } }],
    ['missing signed issue time', { sessionClaims: { reverification_id: 'reverify:one' } }],
    ['future token', { sessionClaims: { reverification_id: 'reverify:one', iat: now / 1_000 + 6 } }],
    ['elapsed token age', { factorVerificationAge: [9, 9], sessionClaims: { reverification_id: 'reverify:one', iat: now / 1_000 - 60 } }],
    ['SDK refusal', { has: () => false }],
  ])('does not issue proof for %s', async (_label, overrides) => {
    clerk.auth.mockResolvedValue(session(overrides))
    expect(await readClerkMfaConsequenceProof()).toBeUndefined()
  })
})
