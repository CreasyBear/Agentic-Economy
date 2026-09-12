import { describe, expect, it } from 'vitest'
import { formatDisplayAmount, formatDisplayPrice } from '@/modules/money/public'

describe('indicative AUD display', () => {
  it('caps sub-cent amounts with a tiny-value marker instead of showing raw precision', () => {
    for (const [units, label] of [['1', '<A$0.01'], ['6943', '<A$0.01']]) {
      expect(formatDisplayPrice({ kind: 'indicative', amount: { currency: 'AUD', exponent: 6, units: units! }, validUntil: 2000 }, 1000)).toBe(label)
    }
  })
  it('rounds to two decimal places instead of showing raw precision', () => {
    for (const [units, label] of [['1500000', 'About A$1.50'], ['10000000', 'About A$10.00'], ['1239000', 'About A$1.24']]) {
      expect(formatDisplayPrice({ kind: 'indicative', amount: { currency: 'AUD', exponent: 6, units: units! }, validUntil: 2000 }, 1000)).toBe(label)
    }
  })
  it('stops presenting expired prices as current', () => {
    expect(formatDisplayPrice({ kind: 'indicative', amount: { currency: 'AUD', exponent: 6, units: '1' }, validUntil: 2000 }, 2000)).toBe('AUD estimate temporarily unavailable')
    expect(formatDisplayPrice({ kind: 'unavailable' })).toBe('AUD estimate temporarily unavailable')
    expect(formatDisplayPrice(undefined)).toBeUndefined()
  })
})

describe('settled amount display', () => {
  it('caps and labels a known amount without an estimate prefix or validity window', () => {
    expect(formatDisplayAmount({ currency: 'AUD', exponent: 6, units: '0' })).toBe('A$0.00')
    expect(formatDisplayAmount({ currency: 'AUD', exponent: 6, units: '6943' })).toBe('<A$0.01')
    expect(formatDisplayAmount({ currency: 'AUD', exponent: 6, units: '12500000' })).toBe('A$12.50')
    expect(formatDisplayAmount({ currency: 'USDC', exponent: 6, units: '5000' })).toBe('<USDC 0.01')
    expect(formatDisplayAmount(undefined)).toBe('Amount unknown')
  })
})
