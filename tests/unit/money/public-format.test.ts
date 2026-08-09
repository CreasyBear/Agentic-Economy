import { describe, expect, it } from 'vitest'

import { formatCurrencyAmount, type ExactAmount } from '@/modules/money/public'

describe('public currency amount formatting', () => {
  it('preserves the exact currency label and invalid amount fallback', () => {
    const amount: ExactAmount = { currency: 'USD', units: '1234', exponent: 2 }

    expect(formatCurrencyAmount(amount)).toBe('USD 12.34')
    expect(formatCurrencyAmount({ currency: 'USD', units: 'not-canonical', exponent: 2 })).toBe('USD —')
  })
})
