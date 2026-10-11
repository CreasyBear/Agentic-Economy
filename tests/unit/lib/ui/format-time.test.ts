import { describe, expect, it } from 'vitest'

import { formatCompactCount, formatCount, formatDate, formatDateInputValue, formatDuration, formatListTime, formatTimestamp } from '@/lib/ui/format-time'

const AT = Date.UTC(2026, 6, 2, 5, 14)

describe('format-time', () => {
  it('formats record timestamps in the given time zone', () => {
    expect(formatTimestamp(AT, 'UTC')).toBe('2 Jul 2026, 5:14 am')
    expect(formatTimestamp(AT, 'Australia/Perth')).toBe('2 Jul 2026, 1:14 pm')
    expect(formatTimestamp(new Date(AT).toISOString(), 'Australia/Perth')).toBe('2 Jul 2026, 1:14 pm')
  })

  it('formats dates in the given time zone', () => {
    expect(formatDate(Date.UTC(2026, 6, 1, 20), 'UTC')).toBe('1 Jul 2026')
    expect(formatDate(Date.UTC(2026, 6, 1, 20), 'Australia/Perth')).toBe('2 Jul 2026')
  })

  it('shows list times as relative under 7 days, then as a date', () => {
    expect(formatListTime(AT - 3 * 60 * 60 * 1000, 'UTC', AT)).toBe('3 hours ago')
    expect(formatListTime(AT - 10_000, 'UTC', AT)).toBe('just now')
    expect(formatListTime(AT - 6 * 24 * 60 * 60 * 1000, 'UTC', AT)).toBe('6 days ago')
    expect(formatListTime(AT - 8 * 24 * 60 * 60 * 1000, 'UTC', AT)).toBe('24 Jun 2026')
  })

  it('formats durations compactly', () => {
    expect(formatDuration(850)).toBe('850ms')
    expect(formatDuration(1_234)).toBe('1.2s')
    expect(formatDuration(12_400)).toBe('12s')
    expect(formatDuration(86_800)).toBe('1.4min')
  })

  it('formats counts, grouped or compact', () => {
    expect(formatCount(1_234_567)).toBe('1,234,567')
    expect(formatCount(12_345n)).toBe('12,345')
    expect(formatCompactCount(950)).toBe('950')
    expect(formatCompactCount(12_345)).toBe('12.3K')
  })

  it('formats date input values in the given time zone', () => {
    expect(formatDateInputValue(Date.UTC(2026, 6, 1, 20), 'UTC')).toBe('2026-07-01')
    expect(formatDateInputValue(Date.UTC(2026, 6, 1, 20), 'Australia/Perth')).toBe('2026-07-02')
  })
})

describe('monthBoundsInZone', () => {
  it('uses Perth month boundaries, not UTC', async () => {
    const { monthBoundsInZone } = await import('@/lib/ui/format-time')
    // 2026-06-30T17:00Z is 1 Jul 01:00 in Perth (UTC+8)
    expect(monthBoundsInZone(Date.UTC(2026, 5, 30, 17), 'Australia/Perth')).toEqual({ month: '2026-07', startAt: Date.UTC(2026, 5, 30, 16), endAt: Date.UTC(2026, 6, 31, 16) })
    expect(monthBoundsInZone(Date.UTC(2026, 11, 15), 'Australia/Perth').endAt).toBe(Date.UTC(2026, 11, 31, 16))
  })
})
