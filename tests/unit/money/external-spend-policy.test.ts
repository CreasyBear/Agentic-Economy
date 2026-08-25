import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  decideExternalSpendFinalization,
  decideExternalSpendReconciliation,
  decideExternalSpendReversal,
  externalSpendCustodyPolicyRefusal,
  externalSpendFinalizationDigest,
  externalSpendIdentityDigest,
  externalSpendIdentityFromReservation,
  externalSpendIdentityMatchingReservationRef,
  externalSpendPaymentFactsValid,
  mintExternalSpendIdentity,
  sameExternalSpendIdentity,
  type ExternalSpendIdentity,
  type ExternalSpendPaymentFacts,
  type ExternalSpendReservation,
} from '@/modules/money/internal/external-spend'

const facts: ExternalSpendPaymentFacts = {
  principalId: 'principal:test',
  credentialId: 'credential:test',
  grantRef: 'grant:test',
  grantGeneration: 1,
  environment: 'sandbox',
  invocationRef: 'invocation:test',
  attemptRef: 'attempt:test',
  effectGeneration: 1,
  operationRef: `operation:v1:${'a'.repeat(64)}`,
  providerRef: 'provider:test',
  paymentIdentifier: 'payment:test',
  challengeDigest: 'sha256:challenge',
  amount: { currency: 'USD', units: '100', exponent: 2 },
}
const identity: ExternalSpendIdentity = mintExternalSpendIdentity(facts)
const productionCustodyFacts: ExternalSpendPaymentFacts = {
  ...facts,
  environment: 'production',
  custodyRef: 'custody:wallet:primary',
  custodyGeneration: 7,
  custodyDailyMaximum: { currency: 'USD', units: '250', exponent: 2 },
}

function reservation(
  state: ExternalSpendReservation['state'],
  overrides: Partial<ExternalSpendReservation> = {},
): ExternalSpendReservation {
  return {
    ...identity,
    identityDigest: externalSpendIdentityDigest(identity),
    state,
    budgetPolicyRef: 'budget:test',
    budgetDayStart: '2026-08-15',
    budgetMonthStart: '2026-08',
    evidenceRefs: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('external spend policy', () => {
  it('mints reservationRef from money idempotency material and rejects the retired x402 worker hash', () => {
    const minted = mintExternalSpendIdentity(facts)
    const retiredDigest = canonicalDigest({
      format: 'ae.x402.external-spend-identity:v1',
      ...facts,
    } as StableHashValue)
    const identityWithoutRef = canonicalDigest({
      format: 'ae.money.external-spend-identity:v1',
      ...facts,
      idempotencyDigest: minted.idempotencyDigest,
    } as StableHashValue)

    expect(minted.reservationRef).toBe(`external-spend:${minted.idempotencyDigest}`)
    expect(minted.reservationRef).not.toBe(`external-spend:${retiredDigest}`)
    expect(minted.idempotencyDigest).not.toBe(retiredDigest)
    expect(externalSpendIdentityDigest(minted)).not.toBe(identityWithoutRef)
    expect(externalSpendIdentityMatchingReservationRef(facts, minted.reservationRef)).toEqual(minted)
    expect(
      externalSpendIdentityMatchingReservationRef(facts, `external-spend:${retiredDigest}`),
    ).toBeUndefined()
  })

  it('accepts complete production custody facts and projects them into identity', () => {
    expect(externalSpendPaymentFactsValid(productionCustodyFacts)).toBe(true)
    expect(externalSpendCustodyPolicyRefusal(productionCustodyFacts)).toBeUndefined()

    const custodyIdentity = mintExternalSpendIdentity(productionCustodyFacts)
    expect(externalSpendIdentityFromReservation(custodyIdentity)).toEqual(custodyIdentity)
    expect(custodyIdentity).toMatchObject({
      custodyRef: productionCustodyFacts.custodyRef,
      custodyGeneration: productionCustodyFacts.custodyGeneration,
      custodyDailyMaximum: productionCustodyFacts.custodyDailyMaximum,
    })
  })

  it.each([
    ['partial custody facts', { custodyRef: undefined }, 'external_spend_custody_policy_invalid'],
    ['blank custody ref', { custodyRef: ' ' }, 'external_spend_custody_policy_invalid'],
    ['nonpositive generation', { custodyGeneration: 0 }, 'external_spend_custody_policy_invalid'],
    [
      'unsafe generation',
      { custodyGeneration: Number.MAX_SAFE_INTEGER + 1 },
      'external_spend_custody_policy_invalid',
    ],
    ['sandbox custody facts', { environment: 'sandbox' }, 'external_spend_custody_policy_invalid'],
    [
      'currency mismatch',
      { custodyDailyMaximum: { currency: 'EUR', units: '250', exponent: 2 } },
      'external_spend_custody_policy_invalid',
    ],
    [
      'exponent mismatch',
      { custodyDailyMaximum: { currency: 'USD', units: '250', exponent: 3 } },
      'external_spend_custody_policy_invalid',
    ],
  ] as const)('%s is invalid', (_label, override, expectedCode) => {
    const invalidFacts = {
      ...productionCustodyFacts,
      ...override,
    } as ExternalSpendPaymentFacts

    expect(externalSpendPaymentFactsValid(invalidFacts)).toBe(false)
    expect(externalSpendCustodyPolicyRefusal(invalidFacts)).toBe(expectedCode)
  })

  it('rejects a spend above its production custody daily maximum', () => {
    const overCap = {
      ...productionCustodyFacts,
      amount: { currency: 'USD', units: '251', exponent: 2 },
    }

    expect(externalSpendPaymentFactsValid(overCap)).toBe(false)
    expect(externalSpendCustodyPolicyRefusal(overCap)).toBe(
      'external_spend_custody_daily_limit_exceeded',
    )
  })

  it('binds custody ref, generation, and cap changes into identity matching', () => {
    const original = mintExternalSpendIdentity(productionCustodyFacts)
    const variants = [
      { custodyRef: 'custody:wallet:other' },
      { custodyGeneration: 8 },
      { custodyDailyMaximum: { currency: 'USD', units: '251', exponent: 2 } },
    ] as const

    for (const variant of variants) {
      const changed = mintExternalSpendIdentity({
        ...productionCustodyFacts,
        ...variant,
      })
      expect(changed.idempotencyDigest).not.toBe(original.idempotencyDigest)
      expect(sameExternalSpendIdentity(original, changed)).toBe(false)
    }
  })

  it('preserves identities when custody facts are omitted', () => {
    const legacy = mintExternalSpendIdentity({ ...facts })

    expect(legacy).toEqual(identity)
    expect(externalSpendPaymentFactsValid(facts)).toBe(true)
    expect(externalSpendCustodyPolicyRefusal(facts)).toBeUndefined()
  })

  it('rejects invalid submission/settlement combinations', () => {
    expect(decideExternalSpendFinalization({
      identity,
      reservation: reservation('reserved'),
      command: {
        submissionStatus: 'not_submitted',
        settlementStatus: 'settled',
        evidenceRefs: [],
      },
    })).toEqual({
      kind: 'refused',
      code: 'external_spend_state_conflict',
    })
  })

  it('returns one transition and recognizes its exact replay', () => {
    const command = {
      submissionStatus: 'observed',
      settlementStatus: 'settled',
      paymentResponseDigest: 'sha256:payment-response',
      evidenceRefs: ['evidence:provider'],
    } as const
    const first = decideExternalSpendFinalization({
      identity,
      reservation: reservation('reserved'),
      command,
    })
    expect(first).toMatchObject({
      kind: 'transition',
      target: 'settled',
      budgetTarget: 'settled',
    })
    const finalizationDigest = externalSpendFinalizationDigest({
      identityDigest: externalSpendIdentityDigest(identity),
      ...command,
    })
    expect(decideExternalSpendFinalization({
      identity,
      reservation: reservation('settled', { finalizationDigest }),
      command,
    })).toEqual({ kind: 'replayed' })
  })

  it('requires reconciliation before resolving an unknown outcome', () => {
    expect(decideExternalSpendReversal({
      identity,
      reservation: reservation('outcome_unknown'),
      evidenceRef: 'evidence:reversal',
      evidenceDigest: 'sha256:reversal',
    })).toEqual({
      kind: 'refused',
      code: 'external_spend_reconciliation_required',
    })
    expect(decideExternalSpendReconciliation({
      identity,
      reservation: reservation('outcome_unknown'),
      command: {
        settlementStatus: 'not_settled',
        paymentResponseDigest: 'sha256:payment',
        evidenceRef: 'evidence:reconciliation',
        evidenceDigest: 'sha256:reconciliation',
      },
    })).toMatchObject({
      kind: 'transition',
      target: 'released',
    })
  })

  it('allows reversal only from settled and recognizes exact replay', () => {
    expect(decideExternalSpendReversal({
      identity,
      reservation: reservation('released'),
      evidenceRef: 'evidence:reversal',
      evidenceDigest: 'sha256:reversal',
    })).toEqual({
      kind: 'refused',
      code: 'external_spend_state_conflict',
    })
    expect(decideExternalSpendReversal({
      identity,
      reservation: reservation('reversed', {
        reversalEvidenceRef: 'evidence:reversal',
        reversalEvidenceDigest: 'sha256:reversal',
      }),
      evidenceRef: 'evidence:reversal',
      evidenceDigest: 'sha256:reversal',
    })).toEqual({ kind: 'replayed' })
  })
})
