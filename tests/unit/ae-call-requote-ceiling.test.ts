import { describe, expect, it } from 'vitest'
import { assertRequoteWithinCeiling } from '../../tools/ae/commands/call'

const quote = (units: string) => ({ kind: 'committed', price: { units, exponent: 6, currency: 'AUD' } }) as never

describe('ae call re-quote ceiling', () => {
  it('refuses a higher re-quote', () => {
    expect(() => assertRequoteWithinCeiling(quote('1000000'), quote('1000001'))).toThrow(/price_changed/)
  })
  it('proceeds on equal or lower', () => {
    expect(() => assertRequoteWithinCeiling(quote('1000000'), quote('1000000'))).not.toThrow()
    expect(() => assertRequoteWithinCeiling(quote('1000000'), quote('900000'))).not.toThrow()
  })
  it('--max-spend permits a higher re-quote up to the ceiling', () => {
    expect(() => assertRequoteWithinCeiling(quote('1000000'), quote('1200000'), '1.20')).not.toThrow()
    expect(() => assertRequoteWithinCeiling(quote('1000000'), quote('1200001'), '1.20')).toThrow(/price_changed/)
  })
})
