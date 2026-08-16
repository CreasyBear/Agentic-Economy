import { describe, expect, it } from 'vitest'

import {
  buildQualifiedUseReceipt,
  decideQualifiedUseWrite,
  qualifiedUseEligibility,
  qualifiedUseMaterialDigest,
  qualifiedUseRef,
  sameQualifiedUseIdentity,
  type QualifiedUseMaterial,
} from '@/modules/money/public'

const identity = {
  invocationRef: 'invocation:one',
  attemptRef: 'operation-attempt:invocation:one:1',
  effectGeneration: 1,
} as const

const material: QualifiedUseMaterial = {
  businessId: 'business:supplier',
  operationRef: 'operation:quote',
  publicationRef: 'publication:quote',
  publicationRevision: 3,
  contractDigest: 'sha256:contract',
  bindingDigest: 'sha256:binding',
  principalClass: 'agent_key',
  requestDigest: 'sha256:request',
  responseDigest: 'sha256:response',
  evidenceRefs: ['operation:quote', 'attempt:one'],
}

function receipt(overrides: Partial<QualifiedUseMaterial> = {}) {
  return buildQualifiedUseReceipt({
    ...identity,
    ...material,
    ...overrides,
    qualifiedAt: 1_760_000_000_000,
    usageRef: 'usage:one',
  })
}

describe('qualified use identity', () => {
  it('derives a ref from invocation, attempt, and effect generation', () => {
    expect(qualifiedUseRef(identity)).toBe(
      'qualified-use:v1:invocation:one:operation-attempt:invocation:one:1:1',
    )
  })

  it('separates receipts for different effect generations', () => {
    expect(qualifiedUseRef({ ...identity, effectGeneration: 2 })).not.toBe(
      qualifiedUseRef(identity),
    )
    expect(
      sameQualifiedUseIdentity(identity, { ...identity, effectGeneration: 2 }),
    ).toBe(false)
  })

  it('keeps the material digest stable under evidence ordering', () => {
    const forward = qualifiedUseMaterialDigest({ ...identity, ...material })
    const reversed = qualifiedUseMaterialDigest({
      ...identity,
      ...material,
      evidenceRefs: [...material.evidenceRefs].reverse(),
    })
    expect(reversed).toBe(forward)
  })

  it('changes the material digest when contract material changes', () => {
    expect(
      qualifiedUseMaterialDigest({
        ...identity,
        ...material,
        contractDigest: 'sha256:other',
      }),
    ).not.toBe(qualifiedUseMaterialDigest({ ...identity, ...material }))
  })
})

describe('qualified use eligibility', () => {
  const qualified = {
    environment: 'production',
    contractValidOutput: true,
    releaseOutcome: 'released',
    ownerSelfInvocation: false,
    refundedBeforeDelivery: false,
  } as const

  it('qualifies a contract-valid released production delivery', () => {
    expect(qualifiedUseEligibility(qualified)).toEqual({ kind: 'qualified' })
  })

  it.each([
    [{ environment: 'sandbox' }, 'non_production_environment'],
    [{ ownerSelfInvocation: true }, 'owner_self_invocation'],
    [{ releaseOutcome: 'uncertain' as const }, 'outcome_uncertain'],
    [{ contractValidOutput: false }, 'delivery_not_contract_valid'],
    [{ releaseOutcome: 'not_released' as const }, 'delivery_not_contract_valid'],
    [{ refundedBeforeDelivery: true }, 'refunded_before_delivery'],
  ])('excludes %o as %s', (override, reason) => {
    expect(qualifiedUseEligibility({ ...qualified, ...override })).toEqual({
      kind: 'excluded',
      reason,
    })
  })

  it('excludes an uncertain outcome before judging contract validity', () => {
    expect(
      qualifiedUseEligibility({
        ...qualified,
        contractValidOutput: false,
        releaseOutcome: 'uncertain',
      }),
    ).toEqual({ kind: 'excluded', reason: 'outcome_uncertain' })
  })
})

describe('qualified use write decision', () => {
  it('writes the first receipt for an identity', () => {
    const candidate = receipt()
    expect(decideQualifiedUseWrite({ existing: undefined, candidate })).toEqual({
      kind: 'write',
      receipt: candidate,
    })
  })

  it('replays the original receipt for an exact repeat', () => {
    const existing = receipt()
    const decision = decideQualifiedUseWrite({ existing, candidate: receipt() })
    expect(decision).toEqual({ kind: 'replay', receipt: existing })
  })

  it('refuses changed material under the same identity', () => {
    const decision = decideQualifiedUseWrite({
      existing: receipt(),
      candidate: receipt({ responseDigest: 'sha256:tampered' }),
    })
    expect(decision).toEqual({
      kind: 'refused',
      code: 'qualified_use_identity_conflict',
    })
  })

  it('pins receipts to production and carries settlement links', () => {
    const built = receipt()
    expect(built.environment).toBe('production')
    expect(built.usageRef).toBe('usage:one')
    expect(built.transactionRef).toBeUndefined()
    expect(built.qualifiedUseRef).toBe(qualifiedUseRef(identity))
  })
})
