import { describe, expect, it } from 'vitest'

import {
  exactAmountToDecimal,
  isSpendingPaused,
  matchingPresetId,
  monthlyQuotaGaugeFromFacts,
  parseSpendingLimitDecimal,
  parseSpendingLimitTriple,
  SPENDING_PRESETS,
  validateSpendingLimitOrder,
} from '@/modules/agent-access/spending-policy.view-model'

const aud = (units: string) => ({ currency: 'AUD' as const, units, exponent: 6 })

describe('spending-limit-policy (via view-model surface)', () => {
  describe('exactAmountToDecimal', () => {
    it('strips trailing fractional zeros and integer amounts', () => {
      expect(exactAmountToDecimal(aud('5000000'), '0')).toBe('5')
      expect(exactAmountToDecimal(aud('12500000'), '0')).toBe('12.5')
    })
  })

  describe('parseSpendingLimitDecimal', () => {
    it('parses without trimming by default', () => {
      expect(parseSpendingLimitDecimal('5')).toEqual(aud('5000000'))
      expect(parseSpendingLimitDecimal(' 5 ')).toBeUndefined()
    })

    it('trims when requested', () => {
      expect(parseSpendingLimitDecimal(' 5 ', { trim: true })).toEqual(aud('5000000'))
    })
  })

  describe('parseSpendingLimitTriple and validateSpendingLimitOrder', () => {
    it('parses a valid triple', () => {
      const parsed = parseSpendingLimitTriple('10', '50', '200')
      expect(parsed).toEqual({
        maximumSpendPerCall: aud('10000000'),
        maximumDailySpend: aud('50000000'),
        maximumMonthlySpend: aud('200000000'),
      })
    })

    it('allows equal limits in order validation', () => {
      const triple = parseSpendingLimitTriple('5', '5', '5')
      expect(triple).toBeDefined()
      expect(
        validateSpendingLimitOrder(
          triple!.maximumSpendPerCall,
          triple!.maximumDailySpend,
          triple!.maximumMonthlySpend,
        ),
      ).toBeNull()
    })

    it('rejects per-call greater than daily', () => {
      const triple = parseSpendingLimitTriple('50', '25', '100')
      expect(triple).toBeDefined()
      expect(
        validateSpendingLimitOrder(
          triple!.maximumSpendPerCall,
          triple!.maximumDailySpend,
          triple!.maximumMonthlySpend,
        ),
      ).toBe('per_call_gt_daily')
    })

    it('rejects daily greater than monthly', () => {
      const triple = parseSpendingLimitTriple('5', '100', '50')
      expect(triple).toBeDefined()
      expect(
        validateSpendingLimitOrder(
          triple!.maximumSpendPerCall,
          triple!.maximumDailySpend,
          triple!.maximumMonthlySpend,
        ),
      ).toBe('daily_gt_monthly')
    })
  })

  describe('matchingPresetId', () => {
    it('matches preset triples', () => {
      expect(matchingPresetId('2', '10', '50')).toBe('conservative')
      expect(matchingPresetId('5', '25', '100')).toBe('balanced')
      expect(matchingPresetId('20', '100', '500')).toBe('intensive')
      expect(matchingPresetId('1', '2', '3')).toBeNull()
    })

    it('exposes preset labels', () => {
      expect(SPENDING_PRESETS.balanced.perCall).toBe('5')
    })
  })

  describe('isSpendingPaused', () => {
    it('is false without budget and true when all units are zero', () => {
      expect(isSpendingPaused(undefined)).toBe(false)
      expect(
        isSpendingPaused({
          maximumSpendPerCall: aud('0'),
          maximumDailySpend: aud('0'),
          maximumMonthlySpend: aud('0'),
        }),
      ).toBe(true)
    })
  })

  describe('monthlyQuotaGaugeFromFacts', () => {
    const ceiling = aud('100000000')

    it('paused state', () => {
      const gauge = monthlyQuotaGaugeFromFacts({ isPaused: true })
      expect(gauge.label).toBe('Spending frozen — A$0.00 new spend authorized')
      expect(gauge.progressValue).toBe(0)
      expect(gauge).not.toHaveProperty('limitState')
    })

    it('missing ceiling', () => {
      const gauge = monthlyQuotaGaugeFromFacts({ isPaused: false })
      expect(gauge.label).toBe('Monthly settled: no monthly ceiling configured')
      expect(gauge).not.toHaveProperty('limitState')
    })

    it('currency mismatch and incomplete coverage', () => {
      const mismatch = monthlyQuotaGaugeFromFacts({
        isPaused: false,
        grantBudgetMonthlyCeiling: ceiling,
        monthlySettledSpend: { currency: 'USD', units: '1', exponent: 6 },
        monthlySpendCoverage: 'complete',
      })
      expect(mismatch.label).toMatch(/unavailable/)
      expect(mismatch).not.toHaveProperty('limitState')

      const incomplete = monthlyQuotaGaugeFromFacts({
        isPaused: false,
        grantBudgetMonthlyCeiling: ceiling,
        monthlySettledSpend: aud('1000000'),
        monthlySpendCoverage: 'incomplete',
      })
      expect(incomplete.label).toMatch(/unavailable/)
      expect(incomplete).not.toHaveProperty('limitState')

      const unknownCoverage = monthlyQuotaGaugeFromFacts({
        isPaused: false,
        grantBudgetMonthlyCeiling: ceiling,
        monthlySettledSpend: aud('1000000'),
      })
      expect(unknownCoverage.label).toBe('Monthly settled: unavailable / A$100.00')
      expect(unknownCoverage).not.toHaveProperty('limitState')
    })

    it('zero ceiling with and without burn', () => {
      const withBurn = monthlyQuotaGaugeFromFacts({
        isPaused: false,
        grantBudgetMonthlyCeiling: aud('0'),
        monthlySettledSpend: aud('1000000'),
        monthlySpendCoverage: 'complete',
      })
      expect(withBurn.progressValue).toBe(100)
      expect(withBurn.label).toBe('Monthly settled: A$1.00 / A$0.00')
      expect(withBurn).not.toHaveProperty('limitState')

      const noBurn = monthlyQuotaGaugeFromFacts({
        isPaused: false,
        grantBudgetMonthlyCeiling: aud('0'),
        monthlySettledSpend: aud('0'),
        monthlySpendCoverage: 'complete',
      })
      expect(noBurn.progressValue).toBe(0)
      expect(noBurn.label).toBe('Monthly settled: A$0.00 / A$0.00')
      expect(noBurn).not.toHaveProperty('limitState')

      const negativeCeiling = monthlyQuotaGaugeFromFacts({
        isPaused: false,
        grantBudgetMonthlyCeiling: { currency: 'AUD', units: '-1', exponent: 6 },
        monthlySettledSpend: aud('1000000'),
        monthlySpendCoverage: 'complete',
      })
      expect(negativeCeiling.progressValue).toBe(100)
      expect(negativeCeiling.label).toBe(
        'Monthly settled: A$1.00 / Amount unknown',
      )
      expect(negativeCeiling).not.toHaveProperty('limitState')
    })

    it('keeps negative spend unavailable with zero geometry', () => {
      const gauge = monthlyQuotaGaugeFromFacts({
        isPaused: false,
        grantBudgetMonthlyCeiling: ceiling,
        monthlySettledSpend: { currency: 'AUD', units: '-1', exponent: 6 },
        monthlySpendCoverage: 'complete',
      })

      expect(gauge).toMatchObject({
        label: 'Monthly settled: unavailable / A$100.00',
        progressValue: 0,
        progressAriaLabel: 'Monthly settled unavailable of A$100.00',
      })
      expect(gauge).not.toHaveProperty('limitState')
    })

    const gaugeAtPercent = (percent: number) =>
      monthlyQuotaGaugeFromFacts({
        isPaused: false,
        grantBudgetMonthlyCeiling: ceiling,
        monthlySettledSpend: aud(String(Math.round(percent * 1_000_000))),
        monthlySpendCoverage: 'complete',
      })

    it('tone at 0%, 70%, 70.1%, 90%, 90.1%, 100%, and 150% unclamped', () => {
      expect(gaugeAtPercent(0).toneClass).toBe('text-success-foreground')
      expect(gaugeAtPercent(70).toneClass).toBe('text-success-foreground')
      expect(gaugeAtPercent(70.1).toneClass).toBe('text-warning-foreground')
      expect(gaugeAtPercent(90).toneClass).toBe('text-warning-foreground')
      expect(gaugeAtPercent(90.1).toneClass).toBe('text-destructive')
      expect(gaugeAtPercent(90.1).approachingCopy).toBe('Approaching monthly limit')

      const at100 = gaugeAtPercent(100)
      expect(at100.progressValue).toBe(100)
      expect(at100.label).toContain('(100%)')

      const at150 = monthlyQuotaGaugeFromFacts({
        isPaused: false,
        grantBudgetMonthlyCeiling: ceiling,
        monthlySettledSpend: aud('150000000'),
        monthlySpendCoverage: 'complete',
      })
      expect(at150.label).toContain('(150%)')
      expect(at150.progressValue).toBe(100)
    })

    it('derives exact limit state for one atomic unit under, at, and over the ceiling', () => {
      const gaugeAtUnits = (units: string) =>
        monthlyQuotaGaugeFromFacts({
          isPaused: false,
          grantBudgetMonthlyCeiling: ceiling,
          monthlySettledSpend: aud(units),
          monthlySpendCoverage: 'complete',
        })

      const under = gaugeAtUnits('99999999')
      const at = gaugeAtUnits('100000000')
      const over = gaugeAtUnits('100000001')

      expect(under.limitState).toBe('under')
      expect(under.label).toContain('A$100.00 / A$100.00 (99.9%)')
      expect(at.limitState).toBe('at')
      expect(at.progressValue).toBe(100)
      expect(at.label).toContain('(100%)')
      expect(over.limitState).toBe('over')
      expect(over.progressValue).toBe(100)
      expect(over.label).toContain('(100%)')
    })

    it('keeps huge over-limit percentages finite and renders them without Infinity', () => {
      const gauge = monthlyQuotaGaugeFromFacts({
        isPaused: false,
        grantBudgetMonthlyCeiling: aud('1'),
        monthlySettledSpend: aud('9'.repeat(400)),
        monthlySpendCoverage: 'complete',
      })

      expect(gauge.limitState).toBe('over')
      expect(gauge.progressValue).toBe(100)
      expect(Number.isFinite(gauge.progressValue)).toBe(true)
      expect(gauge.label).not.toContain('Infinity')
      expect(gauge.progressAriaLabel).not.toContain('Infinity')
      expect(gauge.label).toContain(`${'9'.repeat(400)}00%`)
    })

    it('matches settled gauge copy at 12.5%', () => {
      const gauge = monthlyQuotaGaugeFromFacts({
        isPaused: false,
        grantBudgetMonthlyCeiling: ceiling,
        monthlySettledSpend: aud('12500000'),
        monthlySpendCoverage: 'complete',
      })
      expect(gauge.label).toBe('Monthly settled: A$12.50 / A$100.00 (12.5%)')
      expect(gauge.progressAriaLabel).toBe(
        'Monthly settled A$12.50 of A$100.00, 12.5 percent',
      )
    })

    it('normalizes differing amount exponents before computing utilization', () => {
      const gauge = monthlyQuotaGaugeFromFacts({
        isPaused: false,
        grantBudgetMonthlyCeiling: ceiling,
        monthlySettledSpend: { currency: 'AUD', units: '1250', exponent: 2 },
        monthlySpendCoverage: 'complete',
      })

      expect(gauge.label).toBe('Monthly settled: A$12.50 / A$100.00 (12.5%)')
      expect(gauge.progressValue).toBe(12.5)
      expect(gauge.progressAriaLabel).toBe(
        'Monthly settled A$12.50 of A$100.00, 12.5 percent',
      )
    })
  })
})
