import { describe, expect, it } from 'vitest'

import {
  amountAtScale,
  amountFromParts,
  formatExactAmount,
  parseDecimalExactAmount,
  readExactAmount,
  zeroExactAmount,
} from '../../../src/modules/money/public'

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

  it.each([
    ['123456789012345.123456', 6, '123456789012345123456'],
    ['123456789012345678901234.123456', 6, '123456789012345678901234123456'],
    ['1.000000000000000001', 18, '1000000000000000001'],
    ['00012.3400', 2, '1234'],
    ['0.000000', 6, '0'],
    ['00000.', 0, '0'],
    ['1200', 0, '1200'],
  ])('preserves every digit of %s at scale %i', (decimal, exponent, units) => {
    const amount = parseDecimalExactAmount('AUD', decimal, exponent)
    expect(amount).toEqual({ currency: 'AUD', units, exponent })
    expect(parseDecimalExactAmount('AUD', formatExactAmount(amount), exponent)).toEqual(amount)
  })

  it.each(['1.000001', '123456789012345.123456', '-1', '+1', '1e3', '.5', '', ' 1', '1.2.3', '1\n', '1\r\n'])(
    'refuses %s rather than rounding or changing notation', decimal => {
      expect(parseDecimalExactAmount('AUD', decimal, 2)).toBeUndefined()
    },
  )
})
