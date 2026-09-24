import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v, type ObjectType } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { callValue, MAX_USAGE_ROWS, validUsagePeriod } from './contracts'

const ownerAgentUsageResult = v.union(
  v.object({
    kind: v.literal('available'),
    dimensionKind: v.literal('agent'),
    dimensionRef: v.string(),
    periodStartAt: v.number(),
    periodEndAt: v.number(),
    callCountUnits: v.string(),
    completedCountUnits: v.string(),
    outcomeUnknownCountUnits: v.string(),
    settledSpendUnits: v.optional(v.string()),
    amountCoverage: v.union(v.literal('complete'), v.literal('incomplete')),
    updatedAt: v.number(),
    source: v.literal('convex_call_evidence'),
  }),
  v.object({
    kind: v.literal('empty'),
    dimensionKind: v.literal('agent'),
    dimensionRef: v.string(),
    periodStartAt: v.number(),
    periodEndAt: v.number(),
  }),
  v.object({ kind: v.literal('unavailable'), code: v.literal('usage_window_too_large') }),
)

const ownerAgentReadback = v.object({
  activity: paginationResultValidator(callValue),
  usage: ownerAgentUsageResult,
})

const MAX_ACTIVITY_PAGE_SIZE = 50

export const readOwnerAgentReadbackArgs = {
  principalRef: v.string(),
  periodStartAt: v.number(),
  periodEndAt: v.number(),
  paginationOpts: paginationOptsValidator,
}
export const readOwnerAgentReadbackResult = ownerAgentReadback

type ProjectedPaymentState = 'settled' | 'released' | 'unknown' | 'not_applicable'

function settledChargeSummary(rows: readonly Readonly<{
  paymentState: ProjectedPaymentState
  audAmountUnits?: string
}>[]): Readonly<{
  amountCoverage: 'complete' | 'incomplete'
  settledSpendUnits?: string
}> {
  let settledSpend = 0n
  let amountCoverage: 'complete' | 'incomplete' = 'complete'
  for (const row of rows) {
    if (row.paymentState === 'released') continue
    if (row.paymentState !== 'settled') {
      amountCoverage = 'incomplete'
      continue
    }
    const units = row.audAmountUnits
    if (units === undefined || !/^(?:0|[1-9]\d*)$/u.test(units)) {
      amountCoverage = 'incomplete'
      continue
    }
    settledSpend += BigInt(units)
  }
  return amountCoverage === 'complete'
    ? { amountCoverage, settledSpendUnits: settledSpend.toString() }
    : { amountCoverage }
}

function projectOwnerAgentUsage(
  principalRef: string,
  periodStartAt: number,
  periodEndAt: number,
  rows: readonly Readonly<{
    state: 'completed' | 'refused' | 'outcome_unknown'
    paymentState: ProjectedPaymentState
    audAmountUnits?: string
    updatedAt: number
  }>[],
) {
  if (rows.length === 0) {
    return {
      kind: 'empty' as const,
      dimensionKind: 'agent' as const,
      dimensionRef: principalRef,
      periodStartAt,
      periodEndAt,
    }
  }
  let completed = 0n
  let outcomeUnknown = 0n
  let updatedAt = 0
  for (const row of rows) {
    if (row.state === 'completed') completed += 1n
    if (row.state === 'outcome_unknown') outcomeUnknown += 1n
    updatedAt = Math.max(updatedAt, row.updatedAt)
  }
  return {
    kind: 'available' as const,
    dimensionKind: 'agent' as const,
    dimensionRef: principalRef,
    periodStartAt,
    periodEndAt,
    callCountUnits: BigInt(rows.length).toString(),
    completedCountUnits: completed.toString(),
    outcomeUnknownCountUnits: outcomeUnknown.toString(),
    ...settledChargeSummary(rows),
    updatedAt,
    source: 'convex_call_evidence' as const,
  }
}

/**
 * Owner-only Agent readback. The principal is supplied by the canonical
 * owned-Agent directory on the server; Account identity always comes from the
 * authenticated owner session. Activity and usage use the same UTC-created
 * Call period, while activity remains independently paginated.
 */
export async function readOwnerAgentReadbackHandler(ctx: QueryCtx, args: ObjectType<typeof readOwnerAgentReadbackArgs>) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') throw new Error('call_history_authentication_required')
  if (args.principalRef.length === 0 || args.principalRef.length > 500) {
    throw new Error('usage_dimension_invalid')
  }
  if (!validUsagePeriod(args.periodStartAt, args.periodEndAt)) {
    throw new Error('usage_period_invalid')
  }
  if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > MAX_ACTIVITY_PAGE_SIZE) {
    throw new Error('call_history_page_size_invalid')
  }
  const [activity, usageRows] = await Promise.all([
    ctx.db.query('capabilityCallProjections')
      .withIndex('by_accountRef_and_principalRef_and_createdAt', (index) => index
        .eq('accountRef', actor.canonicalAccountRef)
        .eq('principalRef', args.principalRef)
        .gte('createdAt', args.periodStartAt)
        .lt('createdAt', args.periodEndAt))
      .order('desc')
      .paginate(args.paginationOpts),
    ctx.db.query('capabilityCallProjections')
      .withIndex('by_accountRef_and_principalRef_and_createdAt', (index) => index
        .eq('accountRef', actor.canonicalAccountRef)
        .eq('principalRef', args.principalRef)
        .gte('createdAt', args.periodStartAt)
        .lt('createdAt', args.periodEndAt))
      .take(MAX_USAGE_ROWS + 1),
  ])
  const usage = usageRows.length > MAX_USAGE_ROWS
    ? { kind: 'unavailable' as const, code: 'usage_window_too_large' as const }
    : projectOwnerAgentUsage(
        args.principalRef,
        args.periodStartAt,
        args.periodEndAt,
        usageRows,
      )
  return {
    activity: {
      ...activity,
      page: activity.page.map(({ _id, _creationTime, ...call }) => call),
    },
    usage,
  }
}
