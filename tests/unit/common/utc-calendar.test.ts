import { describe, expect, it } from 'vitest'

import { currentUtcDayBounds, currentUtcMonthBounds } from '@/modules/common/freshness'

describe('UTC calendar bounds', () => {
  it('returns UTC day bounds across a leap-day transition', () => {
    expect(currentUtcDayBounds(Date.UTC(2024, 1, 29, 23, 59, 59, 999))).toEqual({
      periodStartAt: Date.UTC(2024, 1, 29),
      periodEndAt: Date.UTC(2024, 2, 1),
    })
  })

  it('returns UTC month bounds across leap-day and year transitions', () => {
    expect(currentUtcMonthBounds(Date.UTC(2024, 1, 29, 23, 59, 59, 999))).toEqual({
      periodStartAt: Date.UTC(2024, 1, 1),
      periodEndAt: Date.UTC(2024, 2, 1),
    })

    expect(currentUtcMonthBounds(Date.UTC(2024, 11, 31, 23, 59, 59, 999))).toEqual({
      periodStartAt: Date.UTC(2024, 11, 1),
      periodEndAt: Date.UTC(2025, 0, 1),
    })
  })

  it.each([
    { label: 'NaN', timestamp: Number.NaN },
    { label: 'POSITIVE_INFINITY', timestamp: Number.POSITIVE_INFINITY },
    { label: 'NEGATIVE_INFINITY', timestamp: Number.NEGATIVE_INFINITY },
    { label: 'over-range positive', timestamp: 8_640_000_000_000_001 },
    { label: 'over-range negative', timestamp: -8_640_000_000_000_001 },
  ])('rejects nonfinite and out-of-Date-range timestamps ($label)', ({ timestamp }) => {
    expect(() => currentUtcDayBounds(timestamp)).toThrow(RangeError)
    expect(() => currentUtcMonthBounds(timestamp)).toThrow(RangeError)
  })
})
