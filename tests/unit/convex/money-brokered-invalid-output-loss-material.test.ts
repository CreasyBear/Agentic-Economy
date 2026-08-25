import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import { accountRefForExternalLoss } from '../../../src/modules/money/public'
import {
  brokeredInvalidOutputLossMaterial,
  type BrokeredInvalidOutputLossMaterialInput,
} from '../../../convex/moneyBrokeredInvalidOutputLoss'

const baseInput: BrokeredInvalidOutputLossMaterialInput = {
  chargeTransactionRef: 'operation-money:invocation:test:attempt:test:1:1',
  invocationRef: 'operation-invocation:test',
  attemptRef: 'operation-attempt:operation-invocation:test:1',
  externalRef: 'settlement:payment:1',
  providerAmount: { currency: 'USD', units: '100', exponent: 2 },
  invalidOutputEvidenceRef: 'evidence:invalid-output:1',
  invalidOutputEvidenceDigest: 'sha256:invalid-output:1',
  reconciliationEvidenceRefs: ['evidence:reconcile:1', 'evidence:reconcile:2'],
}

describe('brokered invalid-output loss material', () => {
  it('returns the exact loss identity, provider amount, evidence order, and shared digest', () => {
    const material = brokeredInvalidOutputLossMaterial(baseInput)
    if (material === undefined) throw new Error('expected_material')

    const expectedDigest = canonicalDigest({
      format: 'brokered-invalid-output-loss:v1',
      chargeTransactionRef: baseInput.chargeTransactionRef,
      invocationRef: baseInput.invocationRef,
      attemptRef: baseInput.attemptRef,
      externalRef: baseInput.externalRef,
      providerAmount: baseInput.providerAmount,
      invalidOutputEvidenceRef: baseInput.invalidOutputEvidenceRef,
      invalidOutputEvidenceDigest: baseInput.invalidOutputEvidenceDigest,
      reconciliationEvidenceRefs: [...baseInput.reconciliationEvidenceRefs],
    })

    expect(material).toEqual({
      lossTransactionRef:
        'operation-money-loss:operation-invocation:test:operation-attempt:operation-invocation:test:1:1',
      lossEntryRef:
        'operation-money-loss:operation-invocation:test:operation-attempt:operation-invocation:test:1:1:external-loss',
      lossAccountRef: accountRefForExternalLoss('USD'),
      amount: baseInput.providerAmount,
      evidenceRefs: ['evidence:reconcile:1', 'evidence:reconcile:2', 'evidence:invalid-output:1'],
      inputDigest: expectedDigest,
      sourceDigest: expectedDigest,
    })
    expect(material).not.toHaveProperty('platformFee')
    expect(material).not.toHaveProperty('rake')
  })

  it('changes the shared digest when settlement, provider amount, invalid evidence, or evidence order changes', () => {
    const original = brokeredInvalidOutputLossMaterial(baseInput)
    if (original === undefined) throw new Error('expected_material')

    const variants: BrokeredInvalidOutputLossMaterialInput[] = [
      { ...baseInput, externalRef: 'settlement:payment:2' },
      { ...baseInput, providerAmount: { currency: 'USD', units: '101', exponent: 2 } },
      { ...baseInput, invalidOutputEvidenceRef: 'evidence:invalid-output:2' },
      { ...baseInput, reconciliationEvidenceRefs: ['evidence:reconcile:2', 'evidence:reconcile:1'] },
    ]
    for (const variant of variants) {
      const changed = brokeredInvalidOutputLossMaterial(variant)
      expect(changed?.inputDigest).toBeDefined()
      expect(changed?.inputDigest).not.toBe(original.inputDigest)
      expect(changed?.sourceDigest).not.toBe(original.sourceDigest)
    }
  })

  it('rejects empty, duplicate, malformed, and noncanonical inputs', () => {
    const emptyStringFields: Array<keyof BrokeredInvalidOutputLossMaterialInput> = [
      'chargeTransactionRef',
      'invocationRef',
      'attemptRef',
      'externalRef',
      'invalidOutputEvidenceRef',
      'invalidOutputEvidenceDigest',
    ]
    for (const field of emptyStringFields) {
      expect(brokeredInvalidOutputLossMaterial({ ...baseInput, [field]: '  ' })).toBeUndefined()
    }

    expect(
      brokeredInvalidOutputLossMaterial({ ...baseInput, reconciliationEvidenceRefs: [] }),
    ).toBeUndefined()
    expect(
      brokeredInvalidOutputLossMaterial({ ...baseInput, reconciliationEvidenceRefs: ['  '] }),
    ).toBeUndefined()
    expect(
      brokeredInvalidOutputLossMaterial({
        ...baseInput,
        reconciliationEvidenceRefs: ['evidence:reconcile:1', 'evidence:reconcile:1'],
      }),
    ).toBeUndefined()
    expect(
      brokeredInvalidOutputLossMaterial({
        ...baseInput,
        reconciliationEvidenceRefs: [baseInput.invalidOutputEvidenceRef],
      }),
    ).toBeUndefined()

    const malformedAmounts: unknown[] = [
      { currency: 'usd', units: '100', exponent: 2 },
      { currency: 'USD', units: '-1', exponent: 2 },
      { currency: 'USD', units: '01', exponent: 2 },
      { currency: 'USD', units: '100', exponent: -1 },
      { currency: 'USD', units: '100', exponent: 2, fee: '1' },
    ]
    for (const providerAmount of malformedAmounts) {
      expect(
        brokeredInvalidOutputLossMaterial({
          ...baseInput,
          providerAmount: providerAmount as BrokeredInvalidOutputLossMaterialInput['providerAmount'],
        }),
      ).toBeUndefined()
    }
  })
})
