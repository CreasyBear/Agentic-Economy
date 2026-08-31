import { describe, expect, it } from 'vitest'

import {
  FUNDING_QUOTE_VALIDITY_MS,
  quoteFunding,
  readFundingConstraints,
} from '@/modules/money/public'

describe('funding quote contract', () => {
  it('publishes exact constraints and a fee-inclusive quote without side effects', () => {
    expect(readFundingConstraints()).toEqual({
      kind: 'funding_constraints',
      contractVersion: 'ae-funding-quote:v1',
      currency: 'USD',
      minimum: { currency: 'USD', units: '500', exponent: 2 },
      maximum: { currency: 'USD', units: '2500000', exponent: 2 },
      increment: { currency: 'USD', units: '1', exponent: 2 },
      processingFeeBps: 500,
      amountMeaning: 'buyer_credit_before_processing_fee',
      quotePath: '/api/v1/funding/quote',
    })

    const quote = quoteFunding({
      amount: { currency: 'USD', units: '1000', exponent: 2 },
      now: 1_000,
    })
    expect(quote).toMatchObject({
      kind: 'funding_quote',
      binding: false,
      generatedAt: 1_000,
      expiresAt: 1_000 + FUNDING_QUOTE_VALIDITY_MS,
      creditAmount: { currency: 'USD', units: '1000', exponent: 2 },
      processingFee: { currency: 'USD', units: '50', exponent: 2 },
      totalCharge: { currency: 'USD', units: '1050', exponent: 2 },
      processingFeeBps: 500,
      nextActions: [{
        action: 'funding.create',
        kind: 'human_handoff',
        href: '/owner/credit',
        requiresFreshHumanAuthority: true,
      }],
    })
    expect(quote?.quoteRef).toMatch(/^sha256:/u)
  })

  it('rejects unsupported currency, sub-cent, and out-of-range amounts', () => {
    expect(quoteFunding({ amount: { currency: 'EUR', units: '1000', exponent: 2 }, now: 0 })).toBeUndefined()
    expect(quoteFunding({ amount: { currency: 'USD', units: '5001', exponent: 3 }, now: 0 })).toBeUndefined()
    expect(quoteFunding({ amount: { currency: 'USD', units: '499', exponent: 2 }, now: 0 })).toBeUndefined()
    expect(quoteFunding({ amount: { currency: 'USD', units: '2500001', exponent: 2 }, now: 0 })).toBeUndefined()
  })
})
