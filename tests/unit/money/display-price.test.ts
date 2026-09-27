import { describe, expect, it } from 'vitest'
import {
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

describe('buyer AUD presentation', () => {
  it('rounds known amounts upward only at the display boundary', () => {
    for (const [units, label] of [
      ['0', 'A$0.00'], ['1', 'A$0.01'], ['6943', 'A$0.01'],
      ['10000', 'A$0.01'], ['10001', 'A$0.02'],
      ['1239000', 'A$1.24'], ['12500000', 'A$12.50'],
      ['123456789012345678901234567', 'A$123456789012345678901.24'],
    ]) {
      expect(formatDisplayAmount(aud(units!))).toBe(label)
      expect(formatDisplayPrice({ kind: 'indicative', amount: aud(units!), validUntil: 2000 }, 1000)).toBe(label)
    }
    expect(formatDisplayAmount({ currency: 'AUD', exponent: 2, units: '123' })).toBe('A$1.23')
    expect(formatDisplayAmount({ currency: 'AUD', exponent: 0, units: '1' })).toBe('A$1.00')
    expect(formatDisplayAmount({ currency: 'AUD', exponent: 8, units: '1' })).toBe('A$0.01')
    expect(formatDisplayAmount(undefined)).toBe('Amount unknown')
    expect(formatDisplayAmount(usdc('5000'))).toBe('Amount unknown')
  })

  it('converts exact source USDC with fresh Coinbase evidence before ceil-cent presentation', () => {
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
    }, 1000)).toBe('A$0.01')

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

  it('refuses stale, invalid or unsupported buyer prices instead of presenting source currency', () => {
    const unavailable = 'AUD estimate temporarily unavailable'
    expect(formatDisplayPrice({ kind: 'indicative', amount: aud('1'), validUntil: 2000 }, 2000)).toBe(unavailable)
    expect(formatDisplayPrice({ kind: 'indicative', amount: usdc('1'), validUntil: 2000 }, 1000)).toBe(unavailable)
    expect(formatDisplayPrice({ kind: 'indicative', amount: usdc('1'), referenceRate: observation, validUntil: 999999 }, 301000)).toBe(unavailable)
    expect(formatDisplayPrice({ kind: 'indicative', amount: { ...aud('1'), currency: 'USD' }, validUntil: 2000 }, 1000)).toBe(unavailable)
    expect(formatDisplayPrice({ kind: 'unavailable' })).toBe(unavailable)
    expect(formatDisplayPrice(undefined)).toBeUndefined()
    expect(convertUsdcToAud(usdc('1'), observation, 301000)).toBeUndefined()
    expect(convertUsdcToAud(usdc('1'), { ...observation, rate: '0' }, 1000)).toBeUndefined()
    expect(convertUsdcToAud(usdc('1'), observation, 999)).toBeUndefined()
  })
})
