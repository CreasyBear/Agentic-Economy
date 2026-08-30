import type { PayoutReviewWindow } from './contracts'

export function payoutReviewWindow(input: Readonly<{ now: number }>): PayoutReviewWindow {
  const now = new Date(input.now)
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const periodEndDate = new Date(Date.UTC(year, month, 0))
  const periodStartDate = new Date(Date.UTC(periodEndDate.getUTCFullYear(), periodEndDate.getUTCMonth(), 1))
  const reviewOpensAt = new Date(Date.UTC(year, month, 11, 0, 0, 0, 0))
  const reviewClosesAt = new Date(Date.UTC(year, month, 14, 23, 59, 59, 999))
  const phase = input.now < reviewOpensAt.getTime()
    ? 'before_review'
    : input.now <= reviewClosesAt.getTime()
      ? 'review'
      : 'auto_approval'
  return {
    periodStart: dateOnly(periodStartDate),
    periodEnd: dateOnly(periodEndDate),
    reviewOpensAt: reviewOpensAt.toISOString(),
    reviewClosesAt: reviewClosesAt.toISOString(),
    phase,
  }
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}
