import { describe, expect, it } from 'vitest'
import { displayPriceFromPricingConfig, type PricingConfig } from '@/modules/money/public'

const fixedAud: PricingConfig = {
  version: 'pricing:v3',
  kind: 'fixed_aud',
  currency: 'AUD',
  exponent: 6,
  amountUnits: '2500000',
}

const managedX402: PricingConfig = {
  version: 'pricing:v3',
  kind: 'managed_x402',
  effectTiming: 'payment_required_before_effect',
  sourceRequirement: { network: 'base', asset: 'USDC', atomicUnits: '10000' },
  pricingPolicyRef: 'policy:x402:example',
  publicDisplay: 'on_request',
}

describe('displayPriceFromPricingConfig', () => {
  it('maps a fixed_aud config to a fixed display price', () => {
    expect(displayPriceFromPricingConfig(fixedAud)).toEqual({
      kind: 'fixed',
      amount: { currency: 'AUD', exponent: 6, units: '2500000' },
    })
  })

  it('maps a managed_x402 (metered) config to on_request', () => {
    expect(displayPriceFromPricingConfig(managedX402)).toEqual({ kind: 'on_request' })
  })

  it('preserves currency and scale exactly rather than rescaling or reformatting', () => {
    const result = displayPriceFromPricingConfig(fixedAud)
    expect(result.kind).toBe('fixed')
    if (result.kind === 'fixed') {
      expect(result.amount.currency).toBe(fixedAud.currency)
      expect(result.amount.exponent).toBe(fixedAud.exponent)
      expect(result.amount.units).toBe(fixedAud.amountUnits)
    }
  })
})
