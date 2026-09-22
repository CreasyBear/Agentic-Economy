const PERTH_OFFSET_MS = 8 * 60 * 60_000
const DAY_MS = 24 * 60 * 60_000
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u

export type PerthDayWindowResult =
  | Readonly<{ kind: 'valid'; from: number; toExclusive: number }>
  | Readonly<{ kind: 'refused'; code: 'malformed_day' }>

export function perthDayWindow(day: string): PerthDayWindowResult {
  const match = DAY_PATTERN.exec(day)
  if (match === null) return { kind: 'refused', code: 'malformed_day' }
  const year = Number(match[1])
  const month = Number(match[2])
  const date = Number(match[3])
  const midnightUtc = Date.UTC(year, month - 1, date)
  if (new Date(midnightUtc).toISOString().slice(0, 10) !== day) {
    return { kind: 'refused', code: 'malformed_day' }
  }
  const from = midnightUtc - PERTH_OFFSET_MS
  return { kind: 'valid', from, toExclusive: from + DAY_MS }
}

export function perthDayOf(ms: number): string {
  return new Date(ms + PERTH_OFFSET_MS).toISOString().slice(0, 10)
}

export function previousPerthDay(now: number): string {
  return perthDayOf(now - DAY_MS)
}

export function shiftPerthDay(day: string, offsetDays: number): string | null {
  const window = perthDayWindow(day)
  return window.kind === 'refused' ? null : perthDayOf(window.from + offsetDays * DAY_MS)
}
