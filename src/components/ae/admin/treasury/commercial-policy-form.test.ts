import { describe, expect, it } from 'vitest'

import { PACKAGE4_FORMANCE_REQUIREMENTS } from '@/modules/money/public'
import { buildPolicyInput, proposedProductionPolicyFields, type PolicyPreparation } from './commercial-policy-form'

const NOW = Date.UTC(2026, 9, 3, 0, 0)

function preparation(family: PolicyPreparation['family']): PolicyPreparation {
  return {
    kind: 'ready', environment: 'production', family, conflict: false,
    requiresSecondApproval: true, requirements: PACKAGE4_FORMANCE_REQUIREMENTS, current: null,
  }
}

describe('proposed production policy fields', () => {
  it('suggests bounded editable terms for each family without confirming controls', () => {
    const tax = proposedProductionPolicyFields('tax', NOW)
    expect(tax).toMatchObject({ serviceFeeTax: '10', callTax: '0', invoiceIssuance: 'disabled_pending_approval' })
    expect(proposedProductionPolicyFields('accounting_client_money', NOW)).toMatchObject({
      minimumFunding: '5', maximumFunding: '20', fundingIncrement: '0.01', customerMaximum: '20',
    })
    expect(proposedProductionPolicyFields('privacy_retention', NOW).retentionDays).toBe('2557')
    expect(proposedProductionPolicyFields('treasury_custody', NOW)).toMatchObject({ minimumBuffer: '0.50', rpoMinutes: '5', rtoMinutes: '60' })
    expect(proposedProductionPolicyFields('operations', NOW)).toMatchObject({
      serviceFee: '5', pricingMargin: '0', commitmentSeconds: '300', reportsPerDay: '3',
    })
    for (const family of [
      'commercial_perimeter', 'tax', 'accounting_client_money',
      'privacy_retention', 'treasury_custody', 'operations',
    ] as const) {
      const fields = proposedProductionPolicyFields(family, NOW)
      expect(new Date(fields.expiresAt).getTime() - new Date(fields.effectiveAt).getTime()).toBe(30 * 24 * 60 * 60 * 1_000)
      expect(fields).toMatchObject({
        perimeterConfirmed: false, legalHoldConfirmed: false, custodyConfirmed: false,
        backupConfirmed: false, restoreConfirmed: false, dailyCloseConfirmed: false,
      })
    }
  })

  it('does not turn a suggested operations target into an approved control', () => {
    const result = buildPolicyInput(preparation('operations'), proposedProductionPolicyFields('operations', NOW), 'policy:draft')
    expect(result).toMatchObject({ kind: 'invalid' })
  })

  it('emits only implemented Call tax and margin terms even if stale drafts contain other rates', () => {
    const tax = buildPolicyInput(preparation('tax'), {
      ...proposedProductionPolicyFields('tax', NOW), callTax: '10',
    }, 'policy:tax:draft')
    expect(tax).toMatchObject({ kind: 'ready', input: { control: { callTaxBps: 0 } } })
    const operations = buildPolicyInput(preparation('operations'), {
      ...proposedProductionPolicyFields('operations', NOW), pricingMargin: '10',
      backupConfirmed: true, restoreConfirmed: true, dailyCloseConfirmed: true,
    }, 'policy:operations:draft')
    expect(operations).toMatchObject({ kind: 'ready', input: { control: { buyerPricingMarginBps: 0 } } })
  })
})
