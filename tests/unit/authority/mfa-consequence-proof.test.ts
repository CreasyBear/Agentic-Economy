import { describe, expect, it } from 'vitest'
import { deriveMfaConsequenceProof, type ClerkMfaConsequenceProofInput } from '../../../convex/lib/authority/consequence/proof'

const now = 1_800_000_000_000
const proof: ClerkMfaConsequenceProofInput = { reverificationId: 'reverify:one',
  firstFactorAgeMinutes: 1, secondFactorAgeMinutes: 2, subject: 'user_owner', evidenceObservedAt: now - 30_000 }

describe('MFA consequence derivation after signed-command admission', () => {
  it('preserves the original verification deadline across transport and retry', () => {
    const first = deriveMfaConsequenceProof({ proof, subject: proof.subject, now })
    expect(first).toMatchObject({ kind: 'ok', proof: { verifiedAt: now - 150_000, expiresAt: now + 450_000 } })
    expect(deriveMfaConsequenceProof({ proof, subject: proof.subject, now: now + 449_999 })).toEqual(first)
    expect(deriveMfaConsequenceProof({ proof, subject: proof.subject, now: now + 450_000 }))
      .toEqual({ kind: 'refused', code: 'proof_stale' })
  })

  it('keeps one deadline within the allowed issuer clock skew', () => {
    const skewed = { ...proof, evidenceObservedAt: now + 4_000 }
    const first = deriveMfaConsequenceProof({ proof: skewed, subject: proof.subject, now })
    expect(first.kind).toBe('ok')
    expect(deriveMfaConsequenceProof({ proof: skewed, subject: proof.subject, now: now + 8_000 })).toEqual(first)
  })

  it.each([
    ['first-factor-only', { secondFactorAgeMinutes: -1 }],
    ['missing first factor', { firstFactorAgeMinutes: -1 }],
    ['wrong subject', { subject: 'user_other' }],
    ['future issue time', { evidenceObservedAt: now + 5_001 }],
    ['fractional issue time', { evidenceObservedAt: now - 0.5 }],
    ['missing issue time', { evidenceObservedAt: undefined }],
    ['invalid ID', { reverificationId: '' }],
  ])('refuses %s', (_label, changes) => {
    expect(deriveMfaConsequenceProof({ proof: { ...proof, ...changes }, subject: proof.subject, now }))
      .toEqual({ kind: 'refused', code: 'reauthentication_required' })
  })

  it.each([{ firstFactorAgeMinutes: 10 }, { secondFactorAgeMinutes: 10 },
    { firstFactorAgeMinutes: 10, evidenceObservedAt: now + 1_000 },
    { secondFactorAgeMinutes: 10, evidenceObservedAt: now + 1_000 },
  ])('requires freshness of both factors: %j', changes => {
    expect(deriveMfaConsequenceProof({ proof: { ...proof, ...changes }, subject: proof.subject, now }))
      .toEqual({ kind: 'refused', code: 'proof_stale' })
  })
})
