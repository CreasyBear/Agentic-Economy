export type UtcCalendarBounds = Readonly<{
  periodStartAt: number
  periodEndAt: number
}>

export function currentUtcDayBounds(now: number = Date.now()): UtcCalendarBounds {
  const date = validDate(now)
  const periodStart = new Date(date.getTime())
  periodStart.setUTCHours(0, 0, 0, 0)
  const periodStartAt = validBoundsTimestamp(periodStart.getTime())

  const periodEnd = new Date(periodStartAt)
  periodEnd.setUTCDate(periodEnd.getUTCDate() + 1)

  return {
    periodStartAt,
    periodEndAt: validBoundsTimestamp(periodEnd.getTime()),
  }
}

export function currentUtcMonthBounds(now: number = Date.now()): UtcCalendarBounds {
  const date = validDate(now)
  const periodStart = new Date(date.getTime())
  periodStart.setUTCDate(1)
  periodStart.setUTCHours(0, 0, 0, 0)
  const periodStartAt = validBoundsTimestamp(periodStart.getTime())

  const periodEnd = new Date(periodStartAt)
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1, 1)
  periodEnd.setUTCHours(0, 0, 0, 0)

  return {
    periodStartAt,
    periodEndAt: validBoundsTimestamp(periodEnd.getTime()),
  }
}

function validDate(now: number): Date {
  if (!Number.isFinite(now)) throw new RangeError('utc_calendar_timestamp_invalid')

  const date = new Date(now)
  if (!Number.isFinite(date.getTime())) throw new RangeError('utc_calendar_timestamp_invalid')
  return date
}

function validBoundsTimestamp(timestamp: number): number {
  if (!Number.isFinite(timestamp)) throw new RangeError('utc_calendar_bounds_out_of_range')
  return timestamp
}
