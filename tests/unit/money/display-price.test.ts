import { describe, expect, it } from 'vitest'
import {
  REFERENCE_RATE_MAX_AGE_MS,
  convertUsdcToAud,
  formatDisplayAmount,
  formatDisplayPrice,
  sumExactAmounts,
  quoteManagedX402BuyerAud,
  type ReferenceRate,
} from '@/modules/money/public'

const observation: ReferenceRate = {
  source: 'coinbase', base: 'USDC', quote: 'AUD', rate: '1.239', fetchedAt: 1000,
}
const aud = (units: string) => ({ currency: 'AUD', exponent: 6, units } as const)
const usdc = (units: string) => ({ currency: 'USDC', exponent: 6, units } as const)

// The persisted observation stays eligible across missed six-hour refreshes, not forever.
describe('buyer AUD presentation', () => {
  it('rounds known amounts upward only at the display boundary', () => {
    for (const [units, amount, price] of [
      ['0', 'A$0.00', 'A$0.00'], ['1', 'A$0.01', 'A$0.000001'], ['6943', 'A$0.01', 'A$0.007'],
      ['10000', 'A$0.01', 'A$0.01'], ['10001', 'A$0.02', 'A$0.011'],
      ['1239000', 'A$1.24', 'A$1.24'], ['12500000', 'A$12.50', 'A$12.50'],
      ['123456789012345678901234567', 'A$123456789012345678901.24', 'A$123456789012345678901.24'],
    ]) {
      // Balances settle to whole cents; a per-call price keeps two significant sub-cent digits.
      expect(formatDisplayAmount(aud(units!))).toBe(amount)
      expect(formatDisplayPrice({ kind: 'indicative', amount: aud(units!), validUntil: 2000 }, 1000)).toBe(price)
    }
    expect(formatDisplayAmount({ currency: 'AUD', exponent: 2, units: '123' })).toBe('A$1.23')
    expect(formatDisplayAmount({ currency: 'AUD', exponent: 0, units: '1' })).toBe('A$1.00')
    expect(formatDisplayAmount({ currency: 'AUD', exponent: 8, units: '1' })).toBe('A$0.01')
    expect(formatDisplayAmount(undefined)).toBe('Amount unknown')
    expect(formatDisplayAmount(usdc('5000'))).toBe('Amount unknown')
  })

  it('converts exact source USDC with fresh Coinbase evidence before sub-cent presentation', () => {
    expect(convertUsdcToAud(usdc('0'), observation, 1000)).toEqual(aud('0'))
    expect(formatDisplayPrice({
      kind: 'indicative', amount: usdc('0'), referenceRate: observation, validUntil: 2000,
    }, 1000)).toBe('A$0.00')
    expect(convertUsdcToAud(usdc('1'), observation, 1000)).toEqual(aud('2'))
    expect(convertUsdcToAud(usdc('1000000'), observation, 1000)).toEqual(aud('1239000'))
    expect(formatDisplayPrice({
      kind: 'indicative', amount: usdc('1000000'), referenceRate: observation, validUntil: 2000,
    }, 1000)).toBe('A$1.24')
    expect(formatDisplayPrice({
      kind: 'indicative', amount: usdc('1'), referenceRate: observation, validUntil: 2000,
    }, 1000)).toBe('A$0.000002')
    expect(formatDisplayPrice({
      kind: 'indicative', amount: usdc('1000'), referenceRate: observation, validUntil: 2000,
    }, 1000)).toBe('A$0.0013')

    const quote = quoteManagedX402BuyerAud({
      environment: 'production', requiredUsdcAtomicUnits: '1000000', observedAt: 1000, referenceRate: observation,
    })
    expect(quote.kind).toBe('quoted')
    if (quote.kind === 'quoted') {
      expect(quote.evidence.sourceAmount).toEqual(aud('1239000'))
      expect(quote.evidence.targetAmount).toEqual(usdc('1000000'))
    }
  })

  it('preserves the exact total before rounding, including large conversion values', () => {
    expect(formatDisplayAmount(aud('4999'))).toBe('A$0.01')
    expect(formatDisplayAmount(sumExactAmounts([aud('4999'), aud('4999')], aud('0')))).toBe('A$0.01')
    expect(convertUsdcToAud(usdc('999999999999999999999999999999'), observation, 1000))
      .toEqual(aud('1238999999999999999999999999999'))
  })

  it('formats USD fallbacks to cents and preserves significant sub-cent digits', () => {
    for (const [amount, label] of [
      [usdc('0'), 'US$0.00'],
      [usdc('10000'), 'US$0.01'],
      [usdc('100000'), 'US$0.10'],
      [usdc('1200000'), 'US$1.20'],
      [usdc('1234500'), 'US$1.2345'],
      [usdc('2000'), 'US$0.002'],
      [usdc('1'), 'US$0.000001'],
      [{ currency: 'USD', units: '1', exponent: 0 }, 'US$1.00'],
    ] as const) {
      expect(formatDisplayPrice({ kind: 'indicative', amount, validUntil: 2000 }, 1000)).toBe(label)
    }
  })

  it('falls back to USDC source value without fresh AUD evidence', () => {
    expect(formatDisplayPrice({ kind: 'indicative', amount: aud('1'), validUntil: 2000 }, 2000)).toBeUndefined()
    expect(formatDisplayPrice({ kind: 'indicative', amount: usdc('1'), validUntil: 2000 }, 1000)).toBe('US$0.000001')
    expect(formatDisplayPrice({
      kind: 'indicative', amount: usdc('1'), referenceRate: observation,
      validUntil: REFERENCE_RATE_MAX_AGE_MS + 2000,
    }, REFERENCE_RATE_MAX_AGE_MS + 1000)).toBe('US$0.000001')
    expect(formatDisplayPrice({
      kind: 'indicative', amount: { ...aud('1'), currency: 'EUR' }, validUntil: 2000,
    }, 1000)).toBeUndefined()
    expect(formatDisplayPrice({ kind: 'unavailable' })).toBeUndefined()
    expect(formatDisplayPrice(undefined)).toBeUndefined()
    expect(convertUsdcToAud(usdc('1'), observation, REFERENCE_RATE_MAX_AGE_MS + 1000)).toBeUndefined()
    expect(convertUsdcToAud(usdc('1'), { ...observation, rate: '0' }, 1000)).toBeUndefined()
    expect(convertUsdcToAud(usdc('1'), observation, 999)).toBeUndefined()
  })
})
