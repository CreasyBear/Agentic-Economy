import { describe, expect, it } from 'vitest'

import {
  computeProviderFeeBreakdown,
  computeRakeSplit,
  normalizePricingConfig,
  parseDecimalExactAmount,
  pricingConfigDigest,
  resolveInvocationPrice,
  type ExactAmount,
  type PricingConfig,
} from '../../../src/modules/money/public'

describe('money pricing configuration', () => {
  it('resolves zero-price and free-tier calls before paid calls', () => {
    const zero: PricingConfig = { version: 'pricing:v2', unit: 'call', paidAmount: amount('USD', '0', 2) }
    expect(resolveInvocationPrice({ config: zero, freeCallsUsed: 99, priceDigest: 'price:zero' })).toEqual({
      kind: 'free',
      reason: 'zero_price',
      amount: amount('USD', '0', 2),
      priceDigest: 'price:zero',
    })
    const capped: PricingConfig = { version: 'pricing:v2', unit: 'call', paidAmount: amount('USD', '500', 2), freeTier: { maxCalls: 2, window: 'day' } }
    expect(resolveInvocationPrice({ config: capped, freeCallsUsed: 0, priceDigest: 'price:cap' }).kind).toBe('free')
    expect(resolveInvocationPrice({ config: capped, freeCallsUsed: 2, priceDigest: 'price:cap' })).toEqual({
      kind: 'paid',
      amount: amount('USD', '500', 2),
      priceDigest: 'price:cap',
    })
  })

  it('converts exact decimal prices and refuses discarded non-zero precision', () => {
    expect(parseDecimalExactAmount('USDC', '0.007', 6)).toEqual(amount('USDC', '7000', 6))
    expect(parseDecimalExactAmount('USDC', '0.007', 2)).toBeUndefined()
  })

  it('rejects invalid configuration and currency mismatch', () => {
    expect(resolveInvocationPrice({
      config: { version: 'pricing:v2', unit: 'call', paidAmount: amount('usd', '500', 2) },
      freeCallsUsed: 0,
      priceDigest: 'price:bad',
    })).toEqual({ kind: 'refused', code: 'pricing_config_invalid' })
    const config: PricingConfig = { version: 'pricing:v2', unit: 'call', paidAmount: amount('USD', '500', 2) }
    expect(resolveInvocationPrice({ config, freeCallsUsed: 0, expectedCurrency: 'AUD', priceDigest: 'price:bad' })).toEqual({ kind: 'refused', code: 'currency_mismatch' })
  })

  it('changes digest when pricing changes and splits exact units', () => {
    const one: PricingConfig = { version: 'pricing:v2', unit: 'call', paidAmount: amount('USD', '501', 2) }
    const two: PricingConfig = { ...one, paidAmount: amount('USD', '502', 2) }
    expect(pricingConfigDigest(one)).not.toBe(pricingConfigDigest(two))
    expect(computeRakeSplit(amount('USDC', '7000', 6), { rakeBps: 1000 })).toEqual({
      grossAmount: amount('USDC', '7000', 6),
      rakeBps: 1000,
      rake: amount('USDC', '700', 6),
      providerNet: amount('USDC', '6300', 6),
    })
    expect(computeRakeSplit(amount('USD', '501', 2), { rakeBps: 0 })).toEqual({
      grossAmount: amount('USD', '501', 2),
      rakeBps: 0,
      rake: amount('USD', '0', 2),
      providerNet: amount('USD', '501', 2),
    })
    expect(computeRakeSplit(amount('USD', '501', 2), { rakeBps: 10_000 })).toEqual({
      grossAmount: amount('USD', '501', 2),
      rakeBps: 10_000,
      rake: amount('USD', '501', 2),
      providerNet: amount('USD', '0', 2),
    })
  })

  it('computes exact provider fees with upward rounding', () => {
    expect(computeProviderFeeBreakdown(amount('USD', '0', 2))).toEqual({
      providerAmount: amount('USD', '0', 2),
      platformFee: amount('USD', '0', 2),
      totalAmount: amount('USD', '0', 2),
      feeBps: 1_000,
    })
    expect(computeProviderFeeBreakdown(amount('USD', '1', 2))).toEqual({
      providerAmount: amount('USD', '1', 2),
      platformFee: amount('USD', '1', 2),
      totalAmount: amount('USD', '2', 2),
      feeBps: 1_000,
    })
    expect(computeProviderFeeBreakdown(amount('USD', '9007199254740991', 2))).toEqual({
      providerAmount: amount('USD', '9007199254740991', 2),
      platformFee: amount('USD', '900719925474100', 2),
      totalAmount: amount('USD', '9907919180215091', 2),
      feeBps: 1_000,
    })
    expect(computeProviderFeeBreakdown(amount('USD', '9223372036854775807', 2))).toEqual({
      providerAmount: amount('USD', '9223372036854775807', 2),
      platformFee: amount('USD', '922337203685477581', 2),
      totalAmount: amount('USD', '10145709240540253388', 2),
      feeBps: 1_000,
    })
  })

  it('accepts and digests an exact provider/platform fee pair', () => {
    const config: PricingConfig = {
      version: 'pricing:v2',
      unit: 'call',
      paidAmount: amount('USD', '11', 2),
      providerAmount: amount('USD', '10', 2),
      platformFee: amount('USD', '1', 2),
    }
    expect(normalizePricingConfig(config)).toEqual({ kind: 'valid', config })
    expect(pricingConfigDigest(config)).not.toBe(pricingConfigDigest({ ...config, platformFee: amount('USD', '2', 2) }))
    expect(normalizePricingConfig({ ...config, providerAmount: undefined })).toEqual({ kind: 'invalid', code: 'pricing_config_invalid' })
    expect(normalizePricingConfig({ ...config, platformFee: amount('USD', '2', 2) })).toEqual({ kind: 'invalid', code: 'pricing_config_invalid' })
  })
})

function amount(currency: string, units: string, exponent: number): ExactAmount {
  return { currency, units, exponent }
}
