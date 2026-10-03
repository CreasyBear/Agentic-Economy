import { v } from 'convex/values'

export const callValue = v.object({
  callRef: v.string(),
  accountRef: v.string(),
  principalRef: v.string(),
  credentialRef: v.string(),
  applicationRef: v.string(),
  toolRef: v.string(),
  providerRef: v.string(),
  toolLabel: v.string(),
  state: v.union(v.literal('completed'), v.literal('refused'), v.literal('outcome_unknown')),
  deliveryState: v.union(v.literal('delivered'), v.literal('not_delivered'), v.literal('unknown')),
  paymentState: v.union(v.literal('settled'), v.literal('released'), v.literal('unknown'), v.literal('not_applicable')),
  providerObligationState: v.optional(v.union(
    v.literal('accrued'), v.literal('held'), v.literal('payable'), v.literal('settled'), v.literal('reversed'), v.literal('disputed'),
  )),
  providerAmountUnits: v.optional(v.string()),
  audAmountUnits: v.optional(v.string()),
  receiptRef: v.optional(v.string()),
  recoveryRef: v.optional(v.string()),
  latencyMs: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const MAX_USAGE_ROWS = 10_000

export function validCallHistoryPeriod(periodStartAt: number, periodEndAt: number): boolean {
  return Number.isSafeInteger(periodStartAt)
    && Number.isSafeInteger(periodEndAt)
    && periodStartAt >= 0
    && periodEndAt > periodStartAt
}

export function validUsagePeriod(periodStartAt: number, periodEndAt: number): boolean {
  return validCallHistoryPeriod(periodStartAt, periodEndAt)
    && periodEndAt - periodStartAt <= 366 * 24 * 60 * 60 * 1_000
}
