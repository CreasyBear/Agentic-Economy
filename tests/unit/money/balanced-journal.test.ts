import { describe, expect, it } from 'vitest'

import {
  AUD_EXPONENT,
  ACCOUNT_FUNDING_POLICY_V1,
  applyJournalTransaction,
  calculateAudFundingFinancials,
  canonicalAudUnits,
  prepareBalancedJournalTransaction,
  projectionChecksum,
  quoteAudAccountFunding,
  rebuildJournalProjections,
  type MoneyJournalAccount,
  type MoneyJournalPostingInput,
} from '@/modules/money/public'

const accounts = Object.freeze([
  {
    ledgerAccountRef: 'ledger-account:cash-clearing',
    accountRef: 'platform',
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    accountKind: 'cash_clearing_asset',
    normalBalance: 'debit',
  },
  {
    ledgerAccountRef: 'ledger-account:customer-prepayment',
    accountRef: 'acc_customer',
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    accountKind: 'customer_prepayment_liability',
    normalBalance: 'credit',
  },
  {
    ledgerAccountRef: 'ledger-account:service-fee',
    accountRef: 'platform',
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    accountKind: 'service_fee_revenue',
    normalBalance: 'credit',
  },
  {
    ledgerAccountRef: 'ledger-account:tax-payable',
    accountRef: 'platform',
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    accountKind: 'tax_payable_liability',
    normalBalance: 'credit',
  },
] as const satisfies readonly MoneyJournalAccount[])

function fundingPostings(): readonly MoneyJournalPostingInput[] {
  const financials = calculateAudFundingFinancials({
    principalUnits: 10_000_000n,
    serviceFeeBps: 250,
    taxOnServiceFeeBps: 1_000,
  })
  return [
    { postingRef: 'posting:cash', ledgerAccountRef: accounts[0].ledgerAccountRef, side: 'debit', amountUnits: financials.totalUnits },
    { postingRef: 'posting:principal', ledgerAccountRef: accounts[1].ledgerAccountRef, side: 'credit', amountUnits: financials.principalUnits },
    { postingRef: 'posting:fee', ledgerAccountRef: accounts[2].ledgerAccountRef, side: 'credit', amountUnits: financials.serviceFeeUnits },
    { postingRef: 'posting:tax', ledgerAccountRef: accounts[3].ledgerAccountRef, side: 'credit', amountUnits: financials.taxUnits },
  ]
}

describe('balanced AUD journal', () => {
  it('uses canonical six-decimal AUD units without floating-point coercion', () => {
    expect(AUD_EXPONENT).toBe(6)
    expect(canonicalAudUnits('12.345678')).toBe(12_345_678n)
    expect(canonicalAudUnits('0.000001')).toBe(1n)
    expect(canonicalAudUnits('12.3456780')).toBeUndefined()
    expect(canonicalAudUnits('1e3')).toBeUndefined()
    expect(canonicalAudUnits('0')).toBeUndefined()
    expect(canonicalAudUnits('-1')).toBeUndefined()
    expect(canonicalAudUnits('1000000000000000000000000.000000')).toBeUndefined()
  })

  it('keeps funding principal, service fee, tax and total distinct while crediting principal exactly', () => {
    expect(calculateAudFundingFinancials({
      principalUnits: 10_000_000n,
      serviceFeeBps: 250,
      taxOnServiceFeeBps: 1_000,
    })).toEqual({
      principalUnits: 10_000_000n,
      serviceFeeUnits: 250_000n,
      taxUnits: 25_000n,
      totalUnits: 10_275_000n,
    })
    expect(quoteAudAccountFunding(ACCOUNT_FUNDING_POLICY_V1.minimumPrincipalUnits))
      .toEqual({
        principalUnits: ACCOUNT_FUNDING_POLICY_V1.minimumPrincipalUnits,
        serviceFeeUnits: 250_000n,
        taxUnits: 30_000n,
        totalUnits: 5_280_000n,
      })
    expect(quoteAudAccountFunding(5_000_001n)).toBeUndefined()
    expect(quoteAudAccountFunding(ACCOUNT_FUNDING_POLICY_V1.minimumPrincipalUnits - 1n))
      .toBeUndefined()
  })

  it('prepares one immutable single-asset transaction only when debits equal credits', () => {
    const prepared = prepareBalancedJournalTransaction({
      transactionRef: 'journal-transaction:funding:one',
      idempotencyKey: 'funding:one',
      accountRef: 'acc_customer',
      kind: 'funding_settlement',
      asset: 'AUD',
      exponent: AUD_EXPONENT,
      postings: fundingPostings(),
      evidenceRefs: ['stripe-payment-intent:pi_redacted'],
      occurredAt: 1,
    }, accounts)

    expect(prepared).toMatchObject({
      kind: 'prepared',
      transaction: {
        asset: 'AUD',
        exponent: AUD_EXPONENT,
        debitUnits: 10_275_000n,
        creditUnits: 10_275_000n,
      },
    })
    expect(Object.isFrozen(prepared)).toBe(true)

    expect(prepareBalancedJournalTransaction({
      transactionRef: 'journal-transaction:funding:unbalanced',
      idempotencyKey: 'funding:unbalanced',
      accountRef: 'acc_customer',
      kind: 'funding_settlement',
      asset: 'AUD',
      exponent: AUD_EXPONENT,
      postings: fundingPostings().slice(1),
      evidenceRefs: [],
      occurredAt: 1,
    }, accounts)).toEqual({ kind: 'refused', code: 'journal_unbalanced' })
  })

  it('rebuilds the same projection and checksum as incremental application', () => {
    const prepared = prepareBalancedJournalTransaction({
      transactionRef: 'journal-transaction:funding:projection',
      idempotencyKey: 'funding:projection',
      accountRef: 'acc_customer',
      kind: 'funding_settlement',
      asset: 'AUD',
      exponent: AUD_EXPONENT,
      postings: fundingPostings(),
      evidenceRefs: ['stripe-payment-intent:pi_redacted'],
      occurredAt: 1,
    }, accounts)
    if (prepared.kind !== 'prepared') throw new Error('journal fixture invalid')

    const incrementallyApplied = applyJournalTransaction([], accounts, prepared.transaction)
    const rebuilt = rebuildJournalProjections(accounts, [prepared.transaction])
    expect(incrementallyApplied).toEqual(rebuilt)
    expect(projectionChecksum(incrementallyApplied)).toBe(projectionChecksum(rebuilt))
    expect(rebuilt.find((row) => row.ledgerAccountRef === 'ledger-account:customer-prepayment'))
      .toMatchObject({ balanceUnits: 10_000_000n })
  })

  it('refuses a posting that would drive a normal-balance projection below zero', () => {
    const transaction = prepareBalancedJournalTransaction({
      transactionRef: 'journal-transaction:overdraw',
      idempotencyKey: 'overdraw:one',
      accountRef: 'acc_customer',
      kind: 'funding_adjustment',
      asset: 'AUD',
      exponent: AUD_EXPONENT,
      postings: [
        { postingRef: 'posting:cash-credit', ledgerAccountRef: accounts[0].ledgerAccountRef, side: 'credit', amountUnits: 1n },
        { postingRef: 'posting:liability-debit', ledgerAccountRef: accounts[1].ledgerAccountRef, side: 'debit', amountUnits: 1n },
      ],
      evidenceRefs: ['adjustment:one'],
      occurredAt: 1,
    }, accounts)
    if (transaction.kind !== 'prepared') throw new Error('journal fixture invalid')
    expect(() => applyJournalTransaction([], accounts, transaction.transaction))
      .toThrow('journal_projection_negative')
  })
})
