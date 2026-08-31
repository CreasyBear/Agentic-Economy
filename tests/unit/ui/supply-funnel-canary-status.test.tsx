// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AeSupplyFunnel, type SupplyFunnelCallbacks } from '@/components/ae/supply/AeSupplyFunnel'
import { emptyOwnerOfferingEditorValue } from '@/components/ae/offerings/AeOwnerOfferings.exports'
import type { OwnerSellerCanaryReadback } from '@/modules/capability-supply/supply-funnel.functions'
import { x402OfferingAtTest } from './supply-funnel-harness'

const completedCanary = {
  kind: 'available',
  canaryRef: 'seller-canary:one',
  invocationRef: 'operation-invocation:one',
  operationRef: 'operation:one',
  offeringRef: 'offering:one',
  offeringRevision: 1,
  publicationRef: 'publication:one',
  publicationRevision: 1,
  state: 'completed',
  resultKind: 'completed',
  evidenceHash: `sha256:${'a'.repeat(64)}`,
  attemptRef: 'operation-attempt:one',
  receipt: {
    receiptRef: 'seller-canary-receipt:one',
    state: 'settled',
    network: 'eip155:84532',
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    paymentIdentifier: 'payment:one',
    settlementTransactionHash: `0x${'b'.repeat(64)}`,
    externalSettlementRef: 'base-sepolia:settlement:one',
    evidenceHash: `sha256:${'c'.repeat(64)}`,
    issuedAt: '2026-08-31T00:00:00.000Z',
    refundState: 'not_applicable',
    lossState: 'none',
  },
  promotion: { state: 'not_promoted' },
  updatedAt: 1_000,
} satisfies OwnerSellerCanaryReadback

function callbacks(overrides: Partial<SupplyFunnelCallbacks> = {}): SupplyFunnelCallbacks {
  return {
    saveOffering: async (value) => ({ kind: 'saved', value, message: 'Saved.' }),
    preflight: async () => ({ kind: 'refused', reason: 'not_used', fix: 'Not used.' }),
    admit: async () => ({ step: 'admission', state: 'completed' }),
    runReadiness: async () => ({ step: 'readiness', state: 'completed' }),
    runTest: async () => ({ step: 'test', state: 'completed' }),
    ...overrides,
  }
}

describe('owner seller canary status', () => {
  it('renders exact durable evidence and never promotes until the owner confirms', async () => {
    const promoteCanary = vi.fn(async () => ({
      kind: 'replayed' as const,
      canaryRef: completedCanary.canaryRef,
      offeringRef: completedCanary.offeringRef,
      offeringRevision: completedCanary.offeringRevision,
      publicationRef: completedCanary.publicationRef,
      publicationRevision: completedCanary.publicationRevision,
      operationRef: completedCanary.operationRef,
      promotionEvidenceDigest: `sha256:${'d'.repeat(64)}`,
      outputDigest: `sha256:${'e'.repeat(64)}`,
    }))
    const onReload = vi.fn(async () => undefined)
    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={x402OfferingAtTest()}
        initialOffering={emptyOwnerOfferingEditorValue}
        canary={completedCanary}
        callbacks={callbacks({ promoteCanary, onReload })}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Seller canary evidence' })).toBeDefined()
    expect(screen.getByText(completedCanary.canaryRef)).toBeDefined()
    expect(screen.getByText(completedCanary.invocationRef)).toBeDefined()
    expect(screen.getByText(completedCanary.receipt.receiptRef)).toBeDefined()
    expect(screen.getByText(completedCanary.receipt.settlementTransactionHash)).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Review paid canary' })).toBeNull()
    expect(promoteCanary).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Promote to public catalogue' }))
    expect(promoteCanary).not.toHaveBeenCalled()
    expect(screen.getAllByText(new RegExp(completedCanary.canaryRef))).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm promotion' }))

    await waitFor(() => expect(promoteCanary).toHaveBeenCalledOnce())
    expect(promoteCanary).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'business:one',
        offeringRef: completedCanary.offeringRef,
        offeringRevision: completedCanary.offeringRevision,
        publicationRef: completedCanary.publicationRef,
        publicationRevision: completedCanary.publicationRevision,
      }),
      completedCanary.canaryRef,
    )
    expect(screen.getByText(/promotion was already recorded/i)).toBeDefined()
    expect(onReload).toHaveBeenCalledOnce()
  })

  it('blocks retries and promotion while the retained payment requires reconciliation', () => {
    const canary = {
      ...completedCanary,
      state: 'reconciliation_required',
      resultKind: 'reconciliation_required',
      receipt: { ...completedCanary.receipt, state: 'reconciliation_required' },
      reconciliation: {
        attemptRef: completedCanary.attemptRef,
        effectGeneration: 1,
        requiredAt: '2026-08-31T00:01:00.000Z',
        retry: 'reconcile_before_retry',
        evidenceSource: `seller-canary:${completedCanary.canaryRef}`,
      },
    } satisfies OwnerSellerCanaryReadback
    const promoteCanary = vi.fn()
    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={x402OfferingAtTest()}
        initialOffering={emptyOwnerOfferingEditorValue}
        canary={canary}
        callbacks={callbacks({ promoteCanary })}
      />,
    )

    expect(screen.getByText('Reconciliation required')).toBeDefined()
    expect(screen.getByText(/Do not run another canary/i)).toBeDefined()
    expect(screen.getByText(canary.reconciliation.requiredAt)).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Promote to public catalogue' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Review paid canary' })).toBeNull()
    expect(promoteCanary).not.toHaveBeenCalled()
  })

  it('requires a second explicit confirmation before retrying a retryable pre-payment refusal', async () => {
    const { receipt: _receipt, ...withoutReceipt } = completedCanary
    const canary = {
      ...withoutReceipt,
      state: 'refused',
      resultKind: 'refused',
      refusal: {
        code: 'funding_authority_unavailable',
        retryable: true,
        nextAction: 'Refresh the AE canary funding authority.',
      },
    } satisfies OwnerSellerCanaryReadback
    const runTest = vi.fn(async () => ({
      step: 'test' as const,
      state: 'completed' as const,
      message: 'Seller canary completed.',
    }))
    const onReload = vi.fn(async () => undefined)
    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={x402OfferingAtTest()}
        initialOffering={emptyOwnerOfferingEditorValue}
        canary={canary}
        callbacks={callbacks({ runTest, onReload })}
      />,
    )

    expect(screen.getByText('Canary retry is available')).toBeDefined()
    expect(screen.getByText(/No payment evidence was retained/i)).toBeDefined()
    expect(screen.getByText('Yes')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Review one payment retry' }))
    expect(runTest).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Retry with one Base Sepolia payment?' })).toBeDefined()
    expect(screen.getByText(/USD 0\.01 \(10000 atomic units\)/i)).toBeDefined()
    expect(screen.getByText(/0x1111111111111111111111111111111111111111/i)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm one Base Sepolia payment' }))

    await waitFor(() => expect(runTest).toHaveBeenCalledOnce())
    expect(runTest).toHaveBeenCalledWith(expect.objectContaining({
      businessId: 'business:one',
      offeringRef: canary.offeringRef,
      offeringRevision: canary.offeringRevision,
      publicationRef: canary.publicationRef,
      publicationRevision: canary.publicationRevision,
    }))
    expect(screen.getByText('Seller canary completed.')).toBeDefined()
    expect(onReload).toHaveBeenCalledOnce()
  })

  it('keeps a non-retryable refusal terminal without claiming every remediation needs new material', () => {
    const { receipt: _receipt, ...withoutReceipt } = completedCanary
    const canary = {
      ...withoutReceipt,
      state: 'refused',
      resultKind: 'refused',
      refusal: {
        code: 'provider_refused',
        retryable: false,
        nextAction: 'Check the provider response and follow its recorded remediation.',
      },
    } satisfies OwnerSellerCanaryReadback
    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={x402OfferingAtTest()}
        initialOffering={emptyOwnerOfferingEditorValue}
        canary={canary}
        callbacks={callbacks()}
      />,
    )

    expect(screen.getAllByText(/Check the provider response/i)).toHaveLength(2)
    expect(screen.getByText(/Re-admit only if.*actually changes the Operation material/i)).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Review one payment retry' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Promote to public catalogue' })).toBeNull()
  })

  it('does not offer a payment retry when retryable refusal evidence includes a retained receipt', () => {
    const canary = {
      ...completedCanary,
      state: 'refused',
      resultKind: 'refused',
      refusal: {
        code: 'provider_output_invalid',
        retryable: true,
        nextAction: 'Inspect the settled attempt before taking another action.',
      },
    } satisfies OwnerSellerCanaryReadback
    const runTest = vi.fn()
    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={x402OfferingAtTest()}
        initialOffering={emptyOwnerOfferingEditorValue}
        canary={canary}
        callbacks={callbacks({ runTest })}
      />,
    )

    expect(screen.getByText(/cannot safely offer another payment/i)).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Review one payment retry' })).toBeNull()
    expect(runTest).not.toHaveBeenCalled()
  })
})
