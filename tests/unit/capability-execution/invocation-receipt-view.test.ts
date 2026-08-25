import { describe, expect, it } from 'vitest'

import { projectInvocationReceipt } from '@/modules/capability-execution/invocation-receipt-view'

const invocationRef = 'invocation:receipt-view'
const operationRef = `operation:v1:${'b'.repeat(64)}`

describe('public invocation receipt projection', () => {
  it('marks every stage complete only for a canonical completed result', () => {
    const view = projectInvocationReceipt({
      kind: 'found',
      invocationRef,
      operationRef,
      state: 'terminal',
      result: {
        kind: 'completed',
        invocationRef,
        operationRef,
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
    const view = projectInvocationReceipt({
      kind: 'found',
      invocationRef,
      operationRef,
      state: 'in_progress',
      attemptRef: 'attempt:one',
      result: { kind: 'pending', invocationRef, operationRef, retryAfterMs: 1_000 },
    })

    expect(view.complete).toBe(false)
    expect(view.statusLabel).toBe('Provider call in progress')
    expect(view.stages.find(({ id }) => id === 'reserved')).toMatchObject({ state: 'current' })
    expect(view.stages.find(({ id }) => id === 'submitted')).toMatchObject({ state: 'complete' })
    expect(view.stages.find(({ id }) => id === 'settled')).toMatchObject({ state: 'pending' })
    expect(view.stages.find(({ id }) => id === 'validated')).toMatchObject({ state: 'pending' })
    expect(view.stages.find(({ id }) => id === 'complete')).toMatchObject({ state: 'pending' })
  })

  it('answers the five recovery questions for an uncertain paid outcome', () => {
    const view = projectInvocationReceipt({
      kind: 'found',
      invocationRef,
      operationRef,
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
      automaticNext: 'No automatic retry or replacement invocation has been started.',
      userNext: 'Submit evidence for this same invocation before any retry.',
      retainedReference: invocationRef,
    })
    expect(view.stages.find(({ id }) => id === 'settled')).toMatchObject({ state: 'attention' })
  })

  it('does not turn a bare terminal state into a successful receipt', () => {
    const view = projectInvocationReceipt({
      kind: 'found',
      invocationRef,
      operationRef,
      state: 'terminal',
    })

    expect(view.complete).toBe(false)
    expect(view.issue).toMatchObject({
      title: 'The invocation ended without a completed result',
      retainedReference: invocationRef,
    })
    expect(view.stages.find(({ id }) => id === 'complete')).toMatchObject({ state: 'attention' })
  })

  it('keeps source-unavailable money and progress unknown', () => {
    const view = projectInvocationReceipt({ kind: 'source_unavailable', invocationRef })

    expect(view.operationRef).toBeUndefined()
    expect(view.stages.every(({ state }) => state === 'pending')).toBe(true)
    expect(view.issue?.moneyMovement).toBe('No money movement can be determined from this unavailable record.')
    expect(view.issue?.retainedReference).toBe(invocationRef)
  })
})
