import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { accountHistoryResultSchema, type AccountHistoryResult } from '@/modules/money/public'

import {
  callSourceAction,
  callSourceQuery,
  sourceAction,
  sourceQuery,
} from '@/lib/server/convex-source'

const listOwnerCallsQuery = sourceQuery<{
  principalRef?: string
  periodStartAt?: number
  periodEndAt?: number
  paginationOpts: { numItems: number; cursor: string | null }
}, {
  page: Array<{
    callRef: string
    accountRef: string
    principalRef: string
    credentialRef: string
    applicationRef: string
    toolRef: string
    providerRef: string
    toolLabel: string
    state: 'completed' | 'refused' | 'outcome_unknown'
    deliveryState: 'delivered' | 'not_delivered' | 'unknown'
    paymentState: 'settled' | 'released' | 'unknown' | 'not_applicable'
    providerObligationState?: 'accrued' | 'held' | 'payable' | 'settled' | 'reversed' | 'disputed'
    providerAmountUnits?: string
    audAmountUnits?: string
    receiptRef?: string
    recoveryRef?: string
    serviceUsageRef?: string
    deliveredRequestUnits?: string
    currentDeliveredRequestUnits?: '1' | null
    measurementRevisionRef?: string
    observedAt?: number
    latencyMs: number
    createdAt: number
    updatedAt: number
  }>
  continueCursor: string
  isDone: boolean
}>('capabilityCallProjections:listOwnerCalls')

const dimensionInput = {
  dimensionKind: z.enum(['account', 'agent', 'operation', 'provider', 'application']),
  dimensionRef: z.string().min(1).max(500).optional(),
}
const rangeInput = z.strictObject({
  ...dimensionInput,
  periodStartAt: z.number().int().nonnegative().safe(),
  periodEndAt: z.number().int().positive().safe(),
}).refine(({ periodStartAt, periodEndAt }) => periodEndAt > periodStartAt
  && periodEndAt - periodStartAt <= 366 * 24 * 60 * 60 * 1_000, { message: 'usage_period_invalid' })
const periodInput = z.union([rangeInput, z.strictObject({
  ...dimensionInput,
  periodKind: z.enum(['day', 'month']),
  periodStart: z.string().regex(/^\d{4}-(?:\d{2})(?:-\d{2})?$/u),
})])
type PeriodInput = z.infer<typeof periodInput>
const countUnits = z.string().regex(/^(?:0|[1-9]\d*)$/u)

const usageResult = z.union([
  z.strictObject({
    kind: z.literal('available'),
    dimensionKind: z.enum(['account', 'agent', 'operation', 'provider', 'application']),
    dimensionRef: z.string(),
    periodStartAt: z.number(),
    periodEndAt: z.number(),
    callCountUnits: countUnits,
    completedCountUnits: countUnits,
    outcomeUnknownCountUnits: countUnits,
    deliveredRequestUnits: countUnits.optional(),
    currentDeliveredRequestUnits: countUnits.optional(),
    unknownCurrentDeliveryCallCountUnits: countUnits.optional(),
    serviceUnitCoverage: z.enum(['complete', 'incomplete']).optional(),
    serviceUnitDefinitionRef: z.literal('delivered_request:v1').optional(),
    settledSpendUnits: z.string().regex(/^(?:0|[1-9]\d*)$/u).optional(),
    amountCoverage: z.enum(['complete', 'incomplete']).optional(),
    updatedAt: z.number(),
    source: z.literal('convex_call_evidence'),
  }).refine((usage) => BigInt(usage.callCountUnits) >= BigInt(usage.completedCountUnits) + BigInt(usage.outcomeUnknownCountUnits),
    { message: 'usage_counts_inconsistent' }),
  z.strictObject({ kind: z.literal('empty') }),
  z.strictObject({ kind: z.literal('unavailable'), code: z.literal('usage_window_too_large') }),
])
type UsageResult = z.infer<typeof usageResult>

const spendResult = z.union([
  z.strictObject({
    kind: z.literal('available'),
    currency: z.literal('AUD'),
    exponent: z.literal(6),
    spendUnits: z.string(),
    transactionCountUnits: z.string(),
    periodStartAt: z.number(),
    periodEndAt: z.number(),
    observedAt: z.number(),
    source: z.literal('formance_transaction_cursor'),
    authoritativeForConsequences: z.literal(false),
  }),
  z.strictObject({ kind: z.literal('empty') }),
  z.strictObject({ kind: z.literal('setup_required'), code: z.string() }),
  z.strictObject({ kind: z.literal('unavailable'), code: z.string() }),
  z.strictObject({ kind: z.literal('refused'), code: z.string() }),
])
type SpendResult = z.infer<typeof spendResult>

const readOwnerUsageQuery = sourceQuery<{
  dimensionKind: PeriodInput['dimensionKind']
  dimensionRef?: string
  periodStartAt: number
  periodEndAt: number
}, UsageResult>('capabilityCallProjections:readOwnerUsage')

const readOwnerSpendAction = sourceAction<{
  periodStartAt: number
  periodEndAt: number
}, SpendResult>('moneyOwnerSpend:readOwnerSpend')

const callsInput = z.strictObject({
  cursor: z.string().max(2_000).nullable().optional(),
  principalRef: z.string().min(1).max(200).optional(),
  periodStartAt: z.number().int().nonnegative().safe().optional(),
  periodEndAt: z.number().int().positive().safe().optional(),
}).refine(({ periodStartAt, periodEndAt }) => (periodStartAt === undefined && periodEndAt === undefined)
  || (periodStartAt !== undefined && periodEndAt !== undefined && periodEndAt > periodStartAt), { message: 'usage_period_invalid' })

const accountHistoryInput = z.strictObject({ cursor: z.string().min(1).max(4096).optional() })
const readOwnerHistoryAction = sourceAction<{ cursor?: string }, AccountHistoryResult>('moneyOwnerSpend:readOwnerHistory')

export const readOwnerAccountHistoryServer = createServerFn({ method: 'GET' })
  .validator((data) => accountHistoryInput.parse(data ?? {}))
  .handler(async ({ data }) => accountHistoryResultSchema.parse(await callSourceAction(
    readOwnerHistoryAction, data.cursor === undefined ? {} : { cursor: data.cursor },
  )))

export const readOwnerCallsServer = createServerFn({ method: 'GET' })
  .validator((data) => callsInput.parse(data ?? {}))
  .handler(async ({ data }) => await callSourceQuery(listOwnerCallsQuery, {
    ...(data.principalRef === undefined ? {} : { principalRef: data.principalRef }),
    ...(data.periodStartAt === undefined ? {} : { periodStartAt: data.periodStartAt }),
    ...(data.periodEndAt === undefined ? {} : { periodEndAt: data.periodEndAt }),
    paginationOpts: { numItems: 50, cursor: data.cursor ?? null },
  }))

export const readOwnerUsageServer = createServerFn({ method: 'GET' })
  .validator((data) => periodInput.parse(data))
  .handler(async ({ data }) => {
    const period = periodBounds(data)
    return usageResult.parse(await callSourceQuery(readOwnerUsageQuery, {
      dimensionKind: data.dimensionKind,
      ...(data.dimensionRef === undefined ? {} : { dimensionRef: data.dimensionRef }),
      ...period,
    }))
  })

export const readOwnerSpendServer = createServerFn({ method: 'GET' })
  .validator((data) => periodInput.parse(data))
  .handler(async ({ data }) => {
    if (data.dimensionKind !== 'account' || data.dimensionRef !== undefined) {
      return { kind: 'refused' as const, code: 'spend_dimension_not_supported' }
    }
    return spendResult.parse(await callSourceAction(
      readOwnerSpendAction,
      periodBounds(data),
    ))
  })

function periodBounds(input: PeriodInput): {
  periodStartAt: number
  periodEndAt: number
} {
  if ('periodStartAt' in input) return { periodStartAt: input.periodStartAt, periodEndAt: input.periodEndAt }
  if (input.periodKind === 'day') {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.periodStart)) {
      throw new Error('usage_period_invalid')
    }
    const periodStartAt = Date.parse(`${input.periodStart}T00:00:00.000Z`)
    if (!Number.isSafeInteger(periodStartAt)
      || new Date(periodStartAt).toISOString().slice(0, 10) !== input.periodStart) {
      throw new Error('usage_period_invalid')
    }
    return { periodStartAt, periodEndAt: periodStartAt + 24 * 60 * 60 * 1_000 }
  }
  if (!/^\d{4}-\d{2}$/u.test(input.periodStart)) throw new Error('usage_period_invalid')
  const periodStartAt = Date.parse(`${input.periodStart}-01T00:00:00.000Z`)
  if (!Number.isSafeInteger(periodStartAt)
    || new Date(periodStartAt).toISOString().slice(0, 7) !== input.periodStart) {
    throw new Error('usage_period_invalid')
  }
  const start = new Date(periodStartAt)
  const periodEndAt = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)
  return { periodStartAt, periodEndAt }
}
