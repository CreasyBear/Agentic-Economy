import { describe, expect, it } from 'vitest'

import {
  decideExternalSpendFinalization,
  decideExternalSpendReconciliation,
  decideExternalSpendReversal,
  externalSpendFinalizationDigest,
  externalSpendIdentityDigest,
  type ExternalSpendIdentity,
  type ExternalSpendReservation,
} from '@/modules/money/internal/external-spend'

const identity: ExternalSpendIdentity = {
  reservationRef: 'external-spend:test',
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
  idempotencyDigest: 'sha256:idempotency',
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
