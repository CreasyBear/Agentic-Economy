import { describe, expect, it } from 'vitest'

import {
  FUNDING_QUOTE_VALIDITY_MS,
  commercialPolicyControlsFromFundingProjection,
  quoteFunding,
  readFundingConstraints,
  SANDBOX_COMMERCIAL_POLICY_CONTROLS,
} from '@/modules/money/public'

const LIVE_SERVICE_FEE_BPS = 250

function liveFundingControls() {
  return {
    ...SANDBOX_COMMERCIAL_POLICY_CONTROLS,
    operations: {
      ...SANDBOX_COMMERCIAL_POLICY_CONTROLS.operations,
      fundingServiceFeeBps: LIVE_SERVICE_FEE_BPS,
    },
  }
}

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

  it('quotes from admitted commercial-policy controls when they are not the sandbox fork', () => {
    const controls = liveFundingControls()
    expect(readFundingConstraints(controls).serviceFeeBps).toBe(LIVE_SERVICE_FEE_BPS)
    expect(readFundingConstraints().serviceFeeBps).toBe(500)

    const quote = quoteFunding({
      amount: { currency: 'AUD', units: '10000000', exponent: 6 },
      now: 1_000,
      controls,
    })
    expect(quote).toMatchObject({
      kind: 'funding_quote',
      binding: false,
      principalAmount: { currency: 'AUD', units: '10000000', exponent: 6 },
      serviceFee: { currency: 'AUD', units: '250000', exponent: 6 },
      taxOnServiceFee: { currency: 'AUD', units: '30000', exponent: 6 },
      totalPayment: { currency: 'AUD', units: '10280000', exponent: 6 },
      serviceFeeBps: LIVE_SERVICE_FEE_BPS,
      taxOnServiceFeeBps: 1000,
    })
  })

  it('rebuilds quote controls from a public projection that omits digest and legal max', () => {
    const controls = commercialPolicyControlsFromFundingProjection({
      minimumPrincipalUnits: '5000000',
      maximumPrincipalUnits: '25000000000',
      incrementUnits: '10000',
      serviceFeeBps: LIVE_SERVICE_FEE_BPS,
      taxOnServiceFeeBps: 1000,
    })
    expect(quoteFunding({
      amount: { currency: 'AUD', units: '10000000', exponent: 6 },
      now: 1_000,
      controls,
    })).toMatchObject({
      serviceFeeBps: LIVE_SERVICE_FEE_BPS,
      serviceFee: { currency: 'AUD', units: '250000', exponent: 6 },
    })
  })
})
