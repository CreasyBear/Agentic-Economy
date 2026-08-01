import { describe, expect, it } from 'vitest'

import {
  computeRakeSplit,
  pricingConfigDigest,
  resolveInvocationPrice,
  type PricingConfig,
} from '../../../src/modules/money/public'

describe('money pricing configuration', () => {
  it('resolves zero-price and free-tier calls before paid calls', () => {
    const zero: PricingConfig = { version: 'pricing:v1', unit: 'call', currency: 'USD', paidAmountMinor: 0 }
    expect(resolveInvocationPrice({ config: zero, freeCallsUsed: 99, priceDigest: 'price:zero' })).toEqual({ kind: 'free', reason: 'zero_price', currency: 'USD', amountMinor: 0, priceDigest: 'price:zero' })
    const capped: PricingConfig = { version: 'pricing:v1', unit: 'call', currency: 'USD', paidAmountMinor: 500, freeTier: { maxCalls: 2, window: 'day' } }
    expect(resolveInvocationPrice({ config: capped, freeCallsUsed: 0, priceDigest: 'price:cap' }).kind).toBe('free')
    expect(resolveInvocationPrice({ config: capped, freeCallsUsed: 2, priceDigest: 'price:cap' })).toEqual({ kind: 'paid', currency: 'USD', amountMinor: 500, priceDigest: 'price:cap' })
  })

  it('rejects invalid configuration and currency mismatch', () => {
    expect(resolveInvocationPrice({ config: { version: 'pricing:v1', unit: 'call', currency: 'usd', paidAmountMinor: 500 }, freeCallsUsed: 0, priceDigest: 'price:bad' })).toEqual({ kind: 'refused', code: 'pricing_config_invalid' })
    const config: PricingConfig = { version: 'pricing:v1', unit: 'call', currency: 'USD', paidAmountMinor: 500 }
    expect(resolveInvocationPrice({ config, freeCallsUsed: 0, expectedCurrency: 'AUD', priceDigest: 'price:bad' })).toEqual({ kind: 'refused', code: 'currency_mismatch' })
  })

  it('changes digest when pricing changes and floors rake exactly', () => {
    const one: PricingConfig = { version: 'pricing:v1', unit: 'call', currency: 'USD', paidAmountMinor: 501 }
    const two: PricingConfig = { ...one, paidAmountMinor: 502 }
    expect(pricingConfigDigest(one)).not.toBe(pricingConfigDigest(two))
    expect(computeRakeSplit(501, { rakeBps: 1000 })).toEqual({ grossAmountMinor: 501, rakeBps: 1000, rakeMinor: 50, providerNetMinor: 451 })
    expect(computeRakeSplit(501, { rakeBps: 0 })).toEqual({ grossAmountMinor: 501, rakeBps: 0, rakeMinor: 0, providerNetMinor: 501 })
    expect(computeRakeSplit(501, { rakeBps: 10_000 })).toEqual({ grossAmountMinor: 501, rakeBps: 10_000, rakeMinor: 501, providerNetMinor: 0 })
  })
})
