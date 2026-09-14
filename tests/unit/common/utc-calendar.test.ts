import { describe, expect, it } from 'vitest'

import { currentUtcDayBounds, currentUtcMonthBounds } from '@/modules/common/utc-calendar'

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

  it('rejects nonfinite and out-of-Date-range timestamps', () => {
    const invalidTimestamps = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      8_640_000_000_000_001,
      -8_640_000_000_000_001,
    ]

    for (const timestamp of invalidTimestamps) {
      expect(() => currentUtcDayBounds(timestamp)).toThrow(RangeError)
      expect(() => currentUtcMonthBounds(timestamp)).toThrow(RangeError)
    }
  })
})
