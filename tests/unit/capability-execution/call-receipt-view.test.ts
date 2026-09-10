import { describe, expect, it } from 'vitest'

import type { CallReceipt } from '@/modules/capability-execution/call-contracts'
import {
  outcomeRecordLabel,
  projectCallReceipt,
  purchaseStatusLabel,
} from '@/modules/capability-execution/call-receipt-view'

const callRef = 'invocation:receipt-view'
const toolRef = `operation:v1:${'b'.repeat(64)}`
const releasedReceipt: CallReceipt = {
  commercialModel: 'seller_canary_x402',
  receiptRef: 'receipt:released',
  state: 'refunded',
  network: 'eip155:8453',
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  providerQuotedAmount: { currency: 'USDC', units: '100', exponent: 6 },
  agenticEconomyFee: { currency: 'USDC', units: '10', exponent: 6 },
  totalBuyerAuthorization: { currency: 'USDC', units: '110', exponent: 6 },
  priceDigest: 'sha256:released-price',
  transactionRef: 'money:released',
  accountingTransactionRefs: ['money:released'],
  refundState: 'released',
  lossState: 'none',
  externalSettlementRef: 'settlement:released',
  evidenceHash: 'sha256:released',
  issuedAt: '2026-08-30T22:32:40.000Z',
}

describe('public Call receipt projection', () => {
  it('marks every stage complete only for a canonical completed result', () => {
    const view = projectCallReceipt({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'terminal',
      result: {
        kind: 'completed',
        callRef,
        toolRef,
        output: { answer: 42 },
        evidenceHash: 'sha256:answer',
        usage: {
          usageRef: 'usage:answer',
          observedAt: 1_777_000_000_000,
          chargeState: 'paid',
          amount: { currency: 'USD', units: '5', exponent: 2 },
          priceDigest: 'sha256:price',
        },
      },
    })

    expect(view.version).toBe('ae.public-invocation-receipt:v1')
    expect(view.complete).toBe(true)
    expect(view.statusLabel).toBe('Complete')
    expect(purchaseStatusLabel({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'terminal',
      result: {
        kind: 'completed',
        callRef,
        toolRef,
        output: { answer: 42 },
        evidenceHash: 'sha256:answer',
        usage: {
          usageRef: 'usage:answer',
          observedAt: 1_777_000_000_000,
          chargeState: 'paid',
          amount: { currency: 'USD', units: '5', exponent: 2 },
          priceDigest: 'sha256:price',
        },
      },
    })).toBe('Resolved — delivered')
    expect(outcomeRecordLabel({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'terminal',
      result: {
        kind: 'completed',
        callRef,
        toolRef,
        output: { answer: 42 },
        evidenceHash: 'sha256:answer',
        usage: {
          usageRef: 'usage:answer',
          observedAt: 1_777_000_000_000,
          chargeState: 'paid',
          amount: { currency: 'USD', units: '5', exponent: 2 },
          priceDigest: 'sha256:price',
        },
      },
    })).toBe('Provider output and Call evidence are recorded.')
    expect(view.stages.map(({ id, state }) => [id, state])).toEqual([
      ['authorized', 'complete'],
      ['reserved', 'complete'],
      ['submitted', 'complete'],
      ['settled', 'complete'],
      ['validated', 'complete'],
      ['complete', 'complete'],
    ])
    expect(view.issue).toBeUndefined()
  })

  it('does not invent reservation, settlement, validation, or completion for in-progress work', () => {
    const view = projectCallReceipt({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'in_progress',
      attemptRef: 'attempt:one',
      result: { kind: 'pending', callRef, toolRef, retryAfterMs: 1_000 },
    })

    expect(view.complete).toBe(false)
    expect(view.statusLabel).toBe('Provider call in progress')
    expect(view.stages.find(({ id }) => id === 'reserved')).toMatchObject({ state: 'current' })
    expect(view.stages.find(({ id }) => id === 'submitted')).toMatchObject({ state: 'complete' })
    expect(view.stages.find(({ id }) => id === 'settled')).toMatchObject({ state: 'pending' })
    expect(view.stages.find(({ id }) => id === 'validated')).toMatchObject({ state: 'pending' })
    expect(view.stages.find(({ id }) => id === 'complete')).toMatchObject({ state: 'pending' })
    expect(purchaseStatusLabel({ kind: 'found', version: 1, callRef, toolRef, state: 'in_progress' })).toBe('Open — pending')
  })

  it('exposes a released refund even when the provider result was refused', () => {
    const input = {
      kind: 'found' as const,
      version: 1,
      callRef,
      toolRef,
      state: 'terminal' as const,
      result: {
        kind: 'refused' as const,
        toolRef,
        code: 'provider_refused' as const,
        retryable: false,
        receipt: releasedReceipt,
      },
    }

    expect(purchaseStatusLabel(input)).toBe('Resolved — refunded')
    expect(projectCallReceipt(input).issue?.moneyMovement).toBe('The receipt records that the reserved authorization was released.')
  })

  it('keeps purchase resolution open when completed output has uncertain payment', () => {
    const input = {
      kind: 'found' as const,
      version: 1,
      callRef,
      toolRef,
      state: 'terminal' as const,
      result: {
        kind: 'completed' as const,
        callRef,
        toolRef,
        output: { answer: 42 },
        evidenceHash: 'sha256:uncertain-output',
        usage: {
          usageRef: 'usage:uncertain-completed',
          observedAt: 1_777_000_000_000,
          chargeState: 'outcome_unknown' as const,
          amount: { currency: 'USD', units: '5', exponent: 2 },
          priceDigest: 'sha256:uncertain-price',
        },
      },
    }

    const view = projectCallReceipt(input)
    expect(view.statusLabel).toBe('Complete')
    expect(view.complete).toBe(true)
    expect(purchaseStatusLabel(input)).toBe('Open — outcome uncertain')
  })

  it('answers the five recovery questions for an uncertain paid outcome', () => {
    const view = projectCallReceipt({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'reconciliation_required',
      attemptRef: 'attempt:uncertain',
      effectGeneration: 2,
      usage: {
        usageRef: 'usage:uncertain',
        observedAt: 1_777_000_000_000,
        chargeState: 'outcome_unknown',
        amount: { currency: 'USD', units: '25', exponent: 2 },
        priceDigest: 'sha256:price',
      },
    })

    expect(view.issue).toEqual({
      title: 'The external outcome needs reconciliation',
      whatHappened: 'The provider boundary may have been crossed, but the final external outcome is not conclusive.',
      moneyMovement: 'Money movement is not yet conclusive; reconciliation is required.',
      automaticNext: 'No automatic retry or replacement Call has been started.',
      userNext: 'Submit evidence for this same Call before any retry.',
      retainedReference: callRef,
    })
    expect(view.stages.find(({ id }) => id === 'settled')).toMatchObject({ state: 'attention' })
    expect(purchaseStatusLabel({ kind: 'found', version: 1, callRef, toolRef, state: 'reconciliation_required', usage: {
      usageRef: 'usage:uncertain',
      observedAt: 1_777_000_000_000,
      chargeState: 'outcome_unknown',
      amount: { currency: 'USD', units: '25', exponent: 2 },
      priceDigest: 'sha256:price',
    } })).toBe('Open — outcome uncertain')
  })

  it('does not turn a bare terminal state into a successful receipt', () => {
    const view = projectCallReceipt({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'terminal',
    })

    expect(view.complete).toBe(false)
    expect(view.issue).toMatchObject({
      title: 'The Call ended without a completed result',
      retainedReference: callRef,
    })
    expect(view.stages.find(({ id }) => id === 'complete')).toMatchObject({ state: 'attention' })
    expect(purchaseStatusLabel({ kind: 'found', version: 1, callRef, toolRef, state: 'terminal' })).toBe('Resolved — failed')
  })

  it('keeps source-unavailable money and progress unknown', () => {
    const view = projectCallReceipt({ kind: 'source_unavailable', callRef })

    expect(view.toolRef).toBeUndefined()
    expect(view.stages.every(({ state }) => state === 'pending')).toBe(true)
    expect(view.issue?.moneyMovement).toBe('No money movement can be determined from this unavailable record.')
    expect(view.issue?.retainedReference).toBe(callRef)
  })
})
