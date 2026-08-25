import { describe, expect, it } from 'vitest'

import {
  amountAtScale,
  amountFromParts,
  readExactAmount,
  zeroExactAmount,
} from '../../../src/modules/money/internal/exact-amount'

describe('exact amount constructors', () => {
  it('parses canonical parts and rejects a currency mismatch at scale', () => {
    const parsed = amountFromParts('USD', '500', 2)
    expect(parsed).toEqual({ currency: 'USD', units: '500', exponent: 2 })
    expect(readExactAmount(parsed)).toEqual(parsed)
    expect(amountAtScale(parsed, 'USD', 4)).toEqual({
      currency: 'USD',
      units: '50000',
      exponent: 4,
    })
    expect(amountAtScale(parsed, 'EUR', 2)).toBeUndefined()
    expect(zeroExactAmount('USD', 2)).toEqual({ currency: 'USD', units: '0', exponent: 2 })
    expect(amountFromParts('usd', '500', 2)).toBeUndefined()
  })
})
