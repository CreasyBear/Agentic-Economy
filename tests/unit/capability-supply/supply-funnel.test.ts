import { describe, expect, it } from 'vitest'

import { defaultSupplyPricingConfig, realPricingConfigPort, stubPricingConfigPort } from '@/modules/capability-supply/internal/supply-funnel/pricing-port'
import { resolveSupplyPricing } from '@/modules/capability-supply/supply-funnel.functions'

describe('supply funnel pricing', () => {
  it('uses the zero-price call default', () => {
    const result = resolveSupplyPricing(defaultSupplyPricingConfig)
    expect(result.kind).toBe('ready')
    if (result.kind === 'ready') expect(result.preview.resolution).toMatchObject({ kind: 'free', reason: 'zero_price' })
  })

  it('refuses paid pricing through the named stub seam', () => {
    const config = { ...defaultSupplyPricingConfig, paidAmountMinor: 100 }
    expect(stubPricingConfigPort.normalize(config)).toEqual({ kind: 'refused', reason: 'price_unavailable' })
  })

  it('shows deterministic gross, fee, and provider net through the real port', () => {
    const config = { ...defaultSupplyPricingConfig, paidAmountMinor: 100 }
    const normalized = realPricingConfigPort.normalize(config)
    expect(normalized.kind).toBe('valid')
    if (normalized.kind === 'valid') {
      const resolved = realPricingConfigPort.resolve({ config: normalized.config, freeCallsUsed: 0 })
      expect(resolved).toMatchObject({ kind: 'ready', preview: { grossAmountMinor: 100, feeAmountMinor: 10, providerNetAmountMinor: 90 } })
    }
  })
})
