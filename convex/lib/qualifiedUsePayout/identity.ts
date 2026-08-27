import type { Doc } from '../../_generated/dataModel'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import type { StableHashValue } from '../../../src/modules/common/stable-hash'
import type { QualifiedUseReceipt } from '../../../src/modules/money/public'
import type { DailyPayoutIdentity } from './contracts'

function utcDayStartAt(timestamp: number): number {
  const date = new Date(timestamp)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function utcPeriodStartIso(now: number, daysAgo: number): string {
  return new Date(utcDayStartAt(now) - daysAgo * 86_400_000).toISOString()
}

export function dailyPayoutIdentity(
  businessId: string,
  currency: string,
  qualifiedAt: number,
): DailyPayoutIdentity {
  const timestamp = new Date(qualifiedAt).getTime()
  if (!Number.isFinite(timestamp))
    throw new Error('qualified_use_payout_allocation_invalid')
  const periodStartAt = utcDayStartAt(timestamp)
  const periodEndAt = periodStartAt + 86_400_000
  const periodStart = new Date(periodStartAt).toISOString()
  const periodEnd = new Date(periodEndAt).toISOString()
  return {
    payoutRef: canonicalDigest({
      format: 'money-daily-payout:v1',
      businessId,
      currency,
      periodStart,
      periodEnd,
    } as StableHashValue),
    periodStart,
    periodEnd,
    periodStartAt,
    periodEndAt,
  }
}
export function dailyPayoutIdentityFromRow(
  row: Doc<'moneyPayouts'>,
): DailyPayoutIdentity | undefined {
  if (row.cadence !== 'daily') return undefined
  const periodStartAt = Date.parse(row.periodStart)
  if (!Number.isFinite(periodStartAt)) return undefined
  let period: DailyPayoutIdentity
  try {
    period = dailyPayoutIdentity(row.businessId, row.currency, periodStartAt)
  } catch {
    return undefined
  }
  return row.payoutRef === period.payoutRef &&
    row.periodStart === period.periodStart &&
    row.periodEnd === period.periodEnd
    ? period
    : undefined
}

export function qualifiedUseAllocationRef(
  receipt: Pick<QualifiedUseReceipt, 'qualifiedUseRef' | 'materialDigest'>,
): string {
  return canonicalDigest({
    format: 'money-qualified-use-allocation:v1',
    qualifiedUseRef: receipt.qualifiedUseRef,
    materialDigest: receipt.materialDigest,
  } as StableHashValue)
}

