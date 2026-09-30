import { describe, expect, it } from 'vitest'

import type { PurchaseResolutionRecord } from '@/modules/capability-execution/purchase-resolution'
import type { CallReceipt } from '@/modules/capability-execution/call-contracts'
import {
  outcomeRecordLabel,
  projectCallSummaryPurchaseStatus,
  projectCallReceipt,
  purchaseStatusLabel,
} from '@/modules/capability-execution/call-receipt-view'

const callRef = 'invocation:receipt-view'
const toolRef = `operation:v1:${'b'.repeat(64)}`
const releasedReceipt: CallReceipt = {
  commercialModel: 'account_aud',
  receiptRef: 'receipt:released',
  state: 'refunded',
  buyerCharge: { currency: 'AUD', units: '100', exponent: 6 },
  serviceFee: { currency: 'AUD', units: '10', exponent: 6 },
  totalBuyerCharge: { currency: 'AUD', units: '110', exponent: 6 },
  providerObligation: {
    amount: { currency: 'USDC', units: '100', exponent: 6 },
    settlementMethod: 'managed_x402',
    payoutEligible: false,
  },
  providerSettlement: {
    network: 'eip155:8453',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    amount: { currency: 'USDC', units: '100', exponent: 6 },
  },
  priceDigest: 'sha256:released-price',
  transactionRef: 'money:released',
  accountingTransactionRefs: ['money:released'],
  refundState: 'released',
  lossState: 'none',
  externalSettlementRef: 'settlement:released',
  evidenceHash: 'sha256:released',
  issuedAt: '2026-08-30T22:32:40.000Z',
}

const releasedResolution: PurchaseResolutionRecord = {
  resolutionRef: 'resolution:released', recordDigest: `sha256:${'a'.repeat(64)}`,
  callRef, quoteRef: 'quote:released', accountRef: 'account:buyer',
  customerRef: 'customer:buyer', agentPrincipalRef: 'agent:buyer',
  sellerRef: 'seller:ae', providerRef: 'provider:weather', paymentRecipientRef: 'recipient:weather',
  terminalState: 'released', deliveryState: 'not_delivered', paymentState: 'released',
  considerationAmount: { currency: 'AUD', units: '1403', exponent: 6 },
  considerationNetUnits: '1403', considerationGstUnits: '0',
  providerObligationAmount: { currency: 'USDC', units: '1000', exponent: 6 },
  resolvedAt: 1_800_000_000_000,
}

describe('public Call receipt projection', () => {
  it('uses recorded release facts instead of stale retryable execution state', () => {
    const input = { kind: 'found' as const, version: 1, callRef, toolRef,
      state: 'retryable' as const, purchaseResolution: releasedResolution }
    const view = projectCallReceipt(input)
    expect(purchaseStatusLabel(input)).toBe('Resolved — refunded')
    expect(view.statusLabel).toBe('Credit released')
    expect(view.issue?.moneyMovement).toBe('Reserved credit was released back to your balance.')
    expect(view.issue?.userNext).not.toMatch(/retry/i)
    expect(view.complete).toBe(false)
  })

  it('explains the expired-unused transport failure as no charge and restored credit', () => {
    const view = projectCallReceipt({
      kind: 'found', version: 1, callRef, toolRef, state: 'terminal',
      purchaseResolution: releasedResolution,
      result: { kind: 'refused', code: 'source_unavailable', retryable: false,
        nextAction: 'The service did not complete and payment expired unused. Your credit has been restored. You can make a new request from the Tool page.',
        receipt: { ...releasedReceipt, lossState: 'none' },
      },
    })
    expect(view.statusLabel).toBe('Credit released')
    expect(view.issue?.whatHappened).toBe('The service did not complete. You were not charged; your reserved credit has been restored.')
    expect(view.issue?.userNext).toBe('Return to the Tool to review a new Quote.')
    expect(view.complete).toBe(false)
  })

  it('describes a reported delivered sale as returned credit while retaining the answer', () => {
    const view = projectCallReceipt({ kind: 'found', version: 1, callRef, toolRef, state: 'terminal',
      purchaseResolution: { ...releasedResolution, terminalState: 'refunded', deliveryState: 'delivered' },
      result: { kind: 'completed', callRef, toolRef, output: { answer: 'kept' }, evidenceHash: 'sha256:answer', receipt: releasedReceipt,
        usage: { usageRef: 'usage:answer', chargeState: 'refunded', amount: releasedReceipt.totalBuyerCharge,
          priceDigest: releasedReceipt.priceDigest, observedAt: releasedResolution.resolvedAt } },
    })
    expect(view.statusLabel).toBe('Credit returned')
    expect(view.complete).toBe(true)
    expect(view.statusDetail).toContain('original credit sources')
    expect(view.issue?.moneyMovement).not.toContain('Reserved')
    expect(view.issue?.userNext).toBe('The answer remains available below.')
  })

  it('keeps conflicting or disputed resolution facts uncertain', () => {
    for (const resolution of [
      { ...releasedResolution, terminalState: 'disputed' as const },
      { ...releasedResolution, paymentState: 'unknown' as const },
      { ...releasedResolution, callRef: 'another-call' },
    ]) {
      const input = { kind: 'found' as const, version: 1, callRef, toolRef,
        state: 'terminal' as const, purchaseResolution: resolution }
      expect(purchaseStatusLabel(input)).toBe('Open — outcome uncertain')
      expect(projectCallReceipt(input).statusLabel).toBe('Needs review')
    }
  })

  it('keeps a retryable refusal open while the original Call can continue', () => {
    expect(purchaseStatusLabel({ kind: 'found', version: 1, callRef, toolRef, state: 'retryable',
      result: { kind: 'refused', code: 'pre_release_failed', retryable: true },
    })).toBe('Open — pending')
  })

  it('does not claim a zero charge when terminal money facts are missing', () => {
    const view = projectCallReceipt({ kind: 'found', version: 1, callRef, toolRef, state: 'terminal' })
    expect(view.issue?.moneyMovement).toBe('The charge has not been confirmed.')
  })

  it.each([
    [{ state: 'completed', deliveryState: 'delivered', paymentState: 'settled' }, 'Resolved — delivered', false],
    [{ state: 'completed', deliveryState: 'delivered', paymentState: 'released' }, 'Resolved — refunded', false],
    [{ state: 'refused', deliveryState: 'not_delivered', paymentState: 'not_applicable' }, 'Resolved — failed', false],
    [{ state: 'completed', deliveryState: 'delivered', paymentState: 'unknown' }, 'Open — outcome uncertain', true],
    [{ state: 'completed', deliveryState: 'not_delivered', paymentState: 'settled' }, 'Open — outcome uncertain', true],
  ] as const)('uses one fail-closed buyer purchase status for Account summary facts', (facts, label, attention) => {
    expect(projectCallSummaryPurchaseStatus(facts)).toMatchObject({ label, attention })
  })

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
    expect(view.statusLabel).toBe('Provider Call in progress')
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
    expect(projectCallReceipt(input).issue?.moneyMovement).toBe('Reserved credit was released back to your balance.')
    expect(projectCallReceipt(input).issue).not.toHaveProperty('remedyCertificate')
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
    expect(view.statusLabel).toBe('Needs review')
    expect(view.complete).toBe(false)
    expect(purchaseStatusLabel(input)).toBe('Open — outcome uncertain')
    expect(view.stages.find(({ id }) => id === 'settled')).toMatchObject({ state: 'attention' })
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
      title: 'This Call needs review',
      whatHappened: 'AE has not confirmed whether this Call completed. Its result and payment need review before another attempt.',
      moneyMovement: 'Money movement is not yet conclusive — do not assume a charge or refund.',
      automaticNext: 'No duplicate charge and no automatic retry.',
      userNext: 'Get help with this Call to check its payment and result before another attempt.',
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

  it('renders helpful friendly diagnostics for rate limit and input invalid refusal codes', () => {
    const rateLimitView = projectCallReceipt({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'terminal',
      result: {
        kind: 'refused',
        code: 'rate_limited',
        retryable: true,
      },
    })
    expect(rateLimitView.issue).toMatchObject({
      title: 'Provider rate limit exceeded',
      whatHappened: expect.stringMatching(/volume or concurrency limits/i),
    })

    const rateLimitAliasView = projectCallReceipt({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'terminal',
      result: {
        kind: 'refused',
        code: 'rate_limit_exceeded' as unknown as 'rate_limited',
        retryable: true,
      },
    })
    expect(rateLimitAliasView.issue).toMatchObject({
      title: 'Provider rate limit exceeded',
      whatHappened: expect.stringMatching(/volume or concurrency limits/i),
    })

    const inputInvalidView = projectCallReceipt({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'terminal',
      result: {
        kind: 'refused',
        code: 'input_invalid',
        retryable: false,
      },
    })
    expect(inputInvalidView.issue).toMatchObject({
      title: 'Tool argument schema mismatch',
      whatHappened: expect.stringMatching(/input schema/i),
    })

    const parameterInvalidView = projectCallReceipt({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'terminal',
      result: {
        kind: 'refused',
        code: 'parameter_invalid' as unknown as 'input_invalid',
        retryable: false,
      },
    })
    expect(parameterInvalidView.issue).toMatchObject({
      title: 'Tool argument schema mismatch',
      whatHappened: expect.stringMatching(/input schema/i),
    })

    const insufficientFundsView = projectCallReceipt({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'terminal',
      result: {
        kind: 'refused',
        code: 'insufficient_balance',
        retryable: false,
      },
    })
    expect(insufficientFundsView.issue).toMatchObject({
      title: 'Insufficient prepaid credit',
      moneyMovement: 'A$0.00 charged — your prepaid balance is unaffected.',
    })
  })

  it('keeps source-unavailable money and progress unknown', () => {
    const view = projectCallReceipt({ kind: 'source_unavailable', callRef })

    expect(view.toolRef).toBeUndefined()
    expect(view.stages.every(({ state }) => state === 'pending')).toBe(true)
    expect(view.issue?.moneyMovement).toBe(
      'Money movement cannot be confirmed while this receipt is unavailable. Do not assume A$0.00 or a charge.',
    )
    expect(view.issue?.retainedReference).toBe(callRef)
  })
})
