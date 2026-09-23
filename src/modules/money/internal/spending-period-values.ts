import { v, type Infer } from 'convex/values'
import { canonicalDigest } from '../../common/canonical-digest'

const period = v.object({
  periodStartAt: v.number(),
  periodEndAt: v.number(),
  revision: v.number(),
  limitUnits: v.string(),
})

// Optional only on historical storage rows. New financial admission requires both.
export const spendingPeriodsValue = v.object({
  version: v.literal('ae.spending-periods:v1'),
  daily: period,
  monthly: period,
})
export type SpendingPeriods = Infer<typeof spendingPeriodsValue>

export const spendingPeriodAdjustmentValue = v.object({
  principalRef: v.string(),
  periodKind: v.union(v.literal('day'), v.literal('month')),
  periodStartAt: v.number(),
  periodEndAt: v.number(),
  revision: v.number(),
  previousLimitUnits: v.string(),
  targetLimitUnits: v.string(),
  authorityDigest: v.string(),
})
export type SpendingPeriodAdjustment = Infer<typeof spendingPeriodAdjustmentValue>

/** Stable effect identity shared by the native writer and durable acknowledgement.
 * Amounts and authority remain in the native command digest, not this retry key. */
export function spendingPeriodAdjustmentReference(input: SpendingPeriodAdjustment): string {
  const value = { principalRef: input.principalRef, periodKind: input.periodKind,
    periodStartAt: input.periodStartAt, revision: input.revision }
  const digest = canonicalDigest({ format: 'ae.formance-transaction-reference:v1', value }).slice(7)
  return `ae-p4:${digest}:spending-period-adjustment`
}
