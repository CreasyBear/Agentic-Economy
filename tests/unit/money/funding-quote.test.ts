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
      contractVersion: 'ae-funding-quote:v3',
      currency: 'AUD',
      minimum: { currency: 'AUD', units: '5000000', exponent: 6 },
      maximum: { currency: 'AUD', units: '25000000000', exponent: 6 },
      increment: { currency: 'AUD', units: '10000', exponent: 6 },
      serviceFeeBps: 500,
      taxOnServiceFeeBps: 1000,
      amountMeaning: 'account_aud_principal',
      quotePath: '/api/v1/funding/quote',
    })

    const quote = quoteFunding({
      amount: { currency: 'AUD', units: '10000000', exponent: 6 },
      now: 1_000,
    })
    expect(quote).toMatchObject({
      kind: 'funding_quote',
      binding: false,
      generatedAt: 1_000,
      expiresAt: 1_000 + FUNDING_QUOTE_VALIDITY_MS,
      principalAmount: { currency: 'AUD', units: '10000000', exponent: 6 },
      serviceFee: { currency: 'AUD', units: '500000', exponent: 6 },
      taxOnServiceFee: { currency: 'AUD', units: '50000', exponent: 6 },
      totalPayment: { currency: 'AUD', units: '10550000', exponent: 6 },
      serviceFeeBps: 500,
      taxOnServiceFeeBps: 1000,
      nextActions: [{
        action: 'funding.handoff.create',
        kind: 'human_handoff',
        href: '/api/v1/account/funding-sessions',
        requiresFreshHumanAuthority: false,
      }],
    })
    expect(quote?.quoteRef).toMatch(/^sha256:/u)
  })

  it('rejects unsupported currency, sub-cent, and out-of-range amounts', () => {
    expect(quoteFunding({ amount: { currency: 'EUR', units: '10000000', exponent: 6 }, now: 0 })).toBeUndefined()
    expect(quoteFunding({ amount: { currency: 'AUD', units: '5000001', exponent: 6 }, now: 0 })).toBeUndefined()
    expect(quoteFunding({ amount: { currency: 'AUD', units: '4990000', exponent: 6 }, now: 0 })).toBeUndefined()
    expect(quoteFunding({ amount: { currency: 'AUD', units: '25000010000', exponent: 6 }, now: 0 })).toBeUndefined()
  })
})
