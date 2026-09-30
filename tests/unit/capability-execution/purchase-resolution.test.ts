import { describe, expect, it } from 'vitest'

import {
  AGENTIC_ECONOMY_SELLER_REF,
  buildPurchaseResolutionRecord,
  type PurchaseResolutionBuildInput,
} from '@/modules/capability-execution/purchase-resolution'

const baseInput = (): PurchaseResolutionBuildInput => ({
  callRef: 'operation-invocation:purchase-resolution',
  quoteRef: 'operation-commitment:purchase-resolution',
  accountRef: 'account:customer',
  customerRef: 'legal-customer:buyer',
  agentPrincipalRef: 'principal:agent',
  sellerRef: AGENTIC_ECONOMY_SELLER_REF,
  providerRef: 'business:provider',
  paymentRecipientRef: '0xpayee',
  callState: 'completed',
  deliveryState: 'delivered',
  paymentState: 'settled',
  providerObligationState: 'settled',
  receiptState: 'settled',
  receiptRefundState: 'not_applicable',
  considerationAmount: { currency: 'AUD', units: '6000000', exponent: 6 },
  considerationNetUnits: '5454545',
  considerationGstUnits: '545455',
  providerObligationAmount: { currency: 'USDC', units: '1500000', exponent: 6 },
  resolvedAt: Date.UTC(2026, 8, 17, 4, 0, 0),
})

describe('buildPurchaseResolutionRecord', () => {
  it('admits a terminal completed purchase with GST attribution and separate provider obligation', () => {
    const first = buildPurchaseResolutionRecord(baseInput())
    const second = buildPurchaseResolutionRecord(baseInput())
    expect(first).toMatchObject({ kind: 'admitted' })
    if (first.kind !== 'admitted' || second.kind !== 'admitted') return
    expect(first.record).toMatchObject({
      terminalState: 'completed',
      sellerRef: AGENTIC_ECONOMY_SELLER_REF,
      providerRef: 'business:provider',
      paymentRecipientRef: '0xpayee',
      considerationAmount: { currency: 'AUD', units: '6000000', exponent: 6 },
      considerationNetUnits: '5454545',
      considerationGstUnits: '545455',
      providerObligationAmount: { currency: 'USDC', units: '1500000', exponent: 6 },
    })
    expect(first.record.resolutionRef).toBe(second.record.resolutionRef)
    expect(first.record.recordDigest).toBe(second.record.recordDigest)
    expect(first.record.resolutionRef).toMatch(/^purchase-resolution:[0-9a-f]{64}$/)
  })

  it('closes a paid delivery refusal without reporting successful delivery or inventing a refund', () => {
    const paidRefusal = { ...baseInput(), callState: 'refused' as const, deliveryState: 'not_delivered' as const }
    expect(buildPurchaseResolutionRecord(paidRefusal)).toMatchObject({ kind: 'admitted',
      record: { terminalState: 'completed', deliveryState: 'not_delivered', paymentState: 'settled' } })
    expect(buildPurchaseResolutionRecord({ ...paidRefusal, receiptRefundState: 'unknown' }))
      .toEqual({ kind: 'open', reason: 'not_terminal' })
    expect(buildPurchaseResolutionRecord({ ...paidRefusal, callState: 'reconciliation_required' }))
      .toEqual({ kind: 'open', reason: 'not_terminal' })
  })

  it('stays open when delivery or payment facts are unknown', () => {
    expect(buildPurchaseResolutionRecord({ ...baseInput(), deliveryState: 'unknown' }))
      .toEqual({ kind: 'open', reason: 'delivery_unknown' })
    expect(buildPurchaseResolutionRecord({ ...baseInput(), paymentState: 'unknown' }))
      .toEqual({ kind: 'open', reason: 'payment_unknown' })
  })

  it('refuses consideration math mismatch and role collisions', () => {
    expect(buildPurchaseResolutionRecord({
      ...baseInput(),
      considerationGstUnits: '1',
    })).toEqual({ kind: 'refused', reason: 'consideration_mismatch' })
    expect(buildPurchaseResolutionRecord({
      ...baseInput(),
      customerRef: 'principal:agent',
    })).toEqual({ kind: 'refused', reason: 'customer_is_agent' })
    expect(buildPurchaseResolutionRecord({
      ...baseInput(),
      providerRef: AGENTIC_ECONOMY_SELLER_REF,
    })).toEqual({ kind: 'refused', reason: 'party_role_collision' })
  })

  it('materializes refunded and disputed terminal states distinctly', () => {
    expect(buildPurchaseResolutionRecord({
      ...baseInput(),
      callState: 'completed',
      receiptState: 'refunded',
      providerObligationState: 'reversed',
    })).toMatchObject({ kind: 'admitted', record: { terminalState: 'refunded' } })
    expect(buildPurchaseResolutionRecord({
      ...baseInput(),
      providerObligationState: 'disputed',
    })).toMatchObject({ kind: 'admitted', record: { terminalState: 'disputed' } })
  })
})
