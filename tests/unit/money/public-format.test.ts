import { describe, expect, it } from 'vitest'

import { formatCurrencyAmount } from '@/modules/money/public'

describe('formatCurrencyAmount', () => {
  it('prints AUD as A$ with at least two decimals and no trailing zeros beyond them', () => {
    expect(formatCurrencyAmount({ currency: 'AUD', units: '12000', exponent: 6 })).toBe('A$0.012')
    expect(formatCurrencyAmount({ currency: 'AUD', units: '3000', exponent: 6 })).toBe('A$0.003')
    expect(formatCurrencyAmount({ currency: 'AUD', units: '5000000', exponent: 6 })).toBe('A$5.00')
    expect(formatCurrencyAmount({ currency: 'AUD', units: '550', exponent: 2 })).toBe('A$5.50')
    expect(formatCurrencyAmount({ currency: 'AUD', units: '7', exponent: 0 })).toBe('A$7.00')
    expect(formatCurrencyAmount({ currency: 'AUD', units: '1', exponent: 6 })).toBe('A$0.000001')
  })

  it('prints other currencies as amount then code', () => {
    expect(formatCurrencyAmount({ currency: 'USDC', units: '20000', exponent: 6 })).toBe('0.02 USDC')
    expect(formatCurrencyAmount({ currency: 'USDC', units: '2000', exponent: 6 })).toBe('0.002 USDC')
    expect(formatCurrencyAmount({ currency: 'USD', units: '1234', exponent: 2 })).toBe('12.34 USD')
  })

  it('prints -- when the amount is missing or not canonical', () => {
    expect(formatCurrencyAmount(undefined)).toBe('--')
    expect(formatCurrencyAmount(null)).toBe('--')
    expect(formatCurrencyAmount({ currency: 'USD', units: 'not-canonical', exponent: 2 })).toBe('--')
  })
})
