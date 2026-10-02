import { describe, expect, it } from 'vitest'

import { formatExactAmount, parseDecimalExactAmount } from '@/modules/money/public'

import {
  computeGstPresentation,
  computePercentageAdjustedPrice,
  formatDelta,
  parseDisplayAudPrice,
  parsePositiveAudInput,
  roundAudChipValue,
} from './price-revision-preview'

describe('price-revision-preview', () => {
  describe('parsePositiveAudInput', () => {
    it('rejects empty, zero, negative, and over-precision values', () => {
      expect(parsePositiveAudInput('')).toBeUndefined()
      expect(parsePositiveAudInput('0.00')).toBeUndefined()
      expect(parsePositiveAudInput('-1.00')).toBeUndefined()
      expect(parsePositiveAudInput('12.345')).toBeUndefined()
    })

    it('accepts positive values up to 2 decimal places', () => {
      const parsed = parsePositiveAudInput('0.15')
      expect(parsed?.units).toBe('15')
    })
  })

  describe('parseDisplayAudPrice', () => {
    it('parses cent-ceiled AUD catalog prices including grouped thousands', () => {
      expect(parseDisplayAudPrice('A$0.01')?.units).toBe('1')
      expect(parseDisplayAudPrice('A$1,234.56')?.units).toBe('123456')
      expect(parseDisplayAudPrice('A$ 0.10')?.units).toBe('10')
    })

    it('does not mislabel an exact USD or USDC source price as AUD', () => {
      expect(parseDisplayAudPrice('USD 0.10')).toBeUndefined()
      expect(parseDisplayAudPrice('USDC 0.10')).toBeUndefined()
    })
  })

  describe('publish normalization via parseDecimalExactAmount + formatExactAmount', () => {
    it('keeps trailing zeros for fractional publish strings', () => {
      const parsed = parseDecimalExactAmount('AUD', '0.1', 2)
      expect(parsed).toBeDefined()
      expect(formatExactAmount(parsed)).toBe('0.10')
    })

    it('formats integer dollar input at exponent 2', () => {
      const parsed = parseDecimalExactAmount('AUD', '1', 2)
      expect(formatExactAmount(parsed)).toBe('1.00')
    })
  })

  describe('computeGstPresentation', () => {
    it('shows the call price with no GST, because GST is charged only at top-up', () => {
      const parsedNew = parsePositiveAudInput('0.15')
      const gst = computeGstPresentation('0.15', parsedNew)
      expect(gst.baseText).toBe('A$0.1500')
      expect(gst.gstText).toBe('A$0.0000')
      expect(gst.totalText).toBe('A$0.15')
    })

    it('returns em dashes when input is not a positive price', () => {
      expect(computeGstPresentation('', undefined)).toEqual({
        baseText: '—',
        gstText: '—',
        totalText: '—',
      })
    })

    it('keeps GST at zero for other call prices', () => {
      const parsed = parsePositiveAudInput('0.10')
      const gst = computeGstPresentation('0.10', parsed)
      expect(gst.baseText).toBe('A$0.1000')
      expect(gst.gstText).toBe('A$0.0000')
      expect(gst.totalText).toBe('A$0.10')
    })
  })

  describe('formatDelta', () => {
    it('uses unaligned unit magnitude with compareExactAmounts sign', () => {
      const current = parseDisplayAudPrice('A$ 0.10')
      const next = parsePositiveAudInput('0.15')
      expect(formatDelta(current, next)).toBe('+A$0.05')
    })

    it('reports No change when amounts match', () => {
      const current = parseDisplayAudPrice('A$ 0.10')
      const next = parsePositiveAudInput('0.10')
      expect(formatDelta(current, next)).toBe('No change')
    })
  })

  describe('roundAudChipValue', () => {
    it('floors chip results at 0.01', () => {
      expect(roundAudChipValue(0.001)).toBe('0.01')
    })

    it('rounds half cases with Math.round', () => {
      expect(roundAudChipValue(0.105)).toBe('0.11')
      expect(roundAudChipValue(0.104)).toBe('0.10')
    })
  })

  describe('computePercentageAdjustedPrice', () => {
    it('prefers parsed current catalog price over typed input', () => {
      const current = parseDisplayAudPrice('A$ 0.10')
      const fromCurrent = computePercentageAdjustedPrice(1.1, current, '9.99')
      expect(fromCurrent).toBe('0.11')

      const withoutCurrent = computePercentageAdjustedPrice(1.1, undefined, '0.10')
      expect(withoutCurrent).toBe('0.11')
    })
  })

  describe('large amounts and Number precision', () => {
    it('still formats delta through Number division for large unit gaps', () => {
      const current = parsePositiveAudInput('99999999.99')
      const next = parsePositiveAudInput('100000000.00')
      if (current === undefined || next === undefined) {
        throw new Error('expected parse success')
      }
      const delta = formatDelta(current, next)
      expect(delta).toMatch(/^\+A\$/)
    })
  })
})
