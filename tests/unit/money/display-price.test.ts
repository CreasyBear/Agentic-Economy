import { describe, expect, it } from 'vitest'
import { formatDisplayPrice } from '@/modules/money/public'

describe('indicative AUD display', () => {
  it('preserves positive sub-cent amounts and labels estimates consistently', () => {
    for (const [units, label] of [['1', 'About A$0.000001'], ['1500000', 'About A$1.50'], ['10000000', 'About A$10.00']]) {
      expect(formatDisplayPrice({ kind: 'indicative', amount: { currency: 'AUD', exponent: 6, units: units! }, validUntil: 2000 }, 1000)).toBe(label)
    }
  })
  it('stops presenting expired prices as current', () => {
    expect(formatDisplayPrice({ kind: 'indicative', amount: { currency: 'AUD', exponent: 6, units: '1' }, validUntil: 2000 }, 2000)).toBe('AUD estimate temporarily unavailable')
    expect(formatDisplayPrice({ kind: 'unavailable' })).toBe('AUD estimate temporarily unavailable')
    expect(formatDisplayPrice(undefined)).toBeUndefined()
  })
})
