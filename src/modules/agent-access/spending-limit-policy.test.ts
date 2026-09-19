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
    })

    it('missing ceiling', () => {
      const gauge = monthlyQuotaGaugeFromFacts({ isPaused: false })
      expect(gauge.label).toBe('Monthly settled: no monthly ceiling configured')
    })

    it('currency mismatch and incomplete coverage', () => {
      const mismatch = monthlyQuotaGaugeFromFacts({
        isPaused: false,
        grantBudgetMonthlyCeiling: ceiling,
        monthlySettledSpend: { currency: 'USD', units: '1', exponent: 6 },
        monthlySpendCoverage: 'complete',
      })
      expect(mismatch.label).toMatch(/unavailable/)

      const incomplete = monthlyQuotaGaugeFromFacts({
        isPaused: false,
        grantBudgetMonthlyCeiling: ceiling,
        monthlySettledSpend: aud('1000000'),
        monthlySpendCoverage: 'incomplete',
      })
      expect(incomplete.label).toMatch(/unavailable/)
    })

    it('zero ceiling with and without burn', () => {
      const withBurn = monthlyQuotaGaugeFromFacts({
        isPaused: false,
        grantBudgetMonthlyCeiling: aud('0'),
        monthlySettledSpend: aud('1000000'),
        monthlySpendCoverage: 'complete',
      })
      expect(withBurn.progressValue).toBe(100)
      expect(withBurn.label).not.toMatch(/%/)

      const noBurn = monthlyQuotaGaugeFromFacts({
        isPaused: false,
        grantBudgetMonthlyCeiling: aud('0'),
        monthlySettledSpend: aud('0'),
        monthlySpendCoverage: 'complete',
      })
      expect(noBurn.progressValue).toBe(0)
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
  })
})
