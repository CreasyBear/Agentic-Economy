import { describe, expect, it } from 'vitest'

import { buildThresholdSummary } from './payout-policy-copy'
import { publicationPriceSummary } from './supply-source-native-start-presentation'

describe('supply money presentation', () => {
  it('ceil-displays sub-cent AUD listing amounts without changing the exact publication price', () => {
    const pricing = { kind: 'fixed_aud', amount: { currency: 'AUD', exponent: 6, units: '1' } } as const

    expect(publicationPriceSummary(pricing)).toBe('A$0.01')
    expect(pricing.amount.units).toBe('1')
  })

  it('states the exact supplier payout threshold rather than a rounded-down trigger', () => {
    expect(buildThresholdSummary('10.000001')).toBe(
      'Transfers will trigger when accumulated balance reaches A$10.000001.',
    )
    expect(buildThresholdSummary('10')).toBe(
      'Transfers will trigger when accumulated balance reaches A$10.00.',
    )
  })
})
