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

const liveCallValue = v.object({
  callRef: v.string(), credentialRef: v.string(), toolRef: v.string(),
  phase: v.union(v.literal('awaiting_authority'), v.literal('queued'), v.literal('running'), v.literal('recovery_required'), v.literal('finished')),
  createdAt: v.number(), updatedAt: v.number(),
})
const ownerAgentReadback = v.object({
  activity: paginationResultValidator(callValue),
  usage: ownerAgentUsageResult,
  liveCalls: v.optional(v.array(liveCallValue)),
  watchedCall: v.optional(v.union(
    v.object({ kind: v.literal('missing') }),
    v.object({ kind: v.literal('observed'), live: liveCallValue, activity: v.optional(callValue) }),
  )),
})

const MAX_ACTIVITY_PAGE_SIZE = 50

export const readOwnerAgentReadbackArgs = {
  principalRef: v.string(),
  callRef: v.optional(v.string()),
  periodStartAt: v.number(),
  periodEndAt: v.number(),
  paginationOpts: paginationOptsValidator,
}
export const readOwnerAgentReadbackResult = ownerAgentReadback

type ProjectedPaymentState = 'settled' | 'released' | 'unknown' | 'not_applicable'

/** Requires recorded Call, delivery and payment facts. Ensures an exact sum only
 * when every charge is known: releases and terminal no-delivery refusals count zero.
 * Invariant: absent account receipts on completed or uncertain Calls never prove zero.
 * On missing or contradictory evidence preserve incomplete coverage and omit the sum. */
export function settledChargeSummary(rows: readonly Readonly<{
  state: 'completed' | 'refused' | 'outcome_unknown'
  deliveryState: 'delivered' | 'not_delivered' | 'unknown'
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
    if (row.paymentState === 'not_applicable' && row.state === 'refused' && row.deliveryState === 'not_delivered') continue
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
    deliveryState: 'delivered' | 'not_delivered' | 'unknown'
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
  if (args.callRef !== undefined && (args.callRef.length === 0 || args.callRef.length > 500)) throw new Error('call_history_call_invalid')
  const [activity, usageRows, recentCalls, pendingCalls, uncertainCalls, watched] = await Promise.all([
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
    // Requires authenticated Account + exact Agent. Ensures only recorded
    // lifecycle facts, with no input, secret or financial side effect. Account
    // mismatch is excluded before projection; missing rows mean no observation.
    // One bounded index read replaces polling terminal history as live progress.
    ctx.db.query('capabilityCalls')
      .withIndex('by_principalId_and_createdAt', index => index.eq('principalId', args.principalRef))
      .order('desc').take(MAX_ACTIVITY_PAGE_SIZE),
    ctx.db.query('capabilityCalls').withIndex('by_principalId_and_state', index => index
      .eq('principalId', args.principalRef).eq('state', 'pending')).order('desc').take(MAX_ACTIVITY_PAGE_SIZE),
    ctx.db.query('capabilityCalls').withIndex('by_principalId_and_state', index => index
      .eq('principalId', args.principalRef).eq('state', 'reconciliation_required')).order('desc').take(MAX_ACTIVITY_PAGE_SIZE),
    args.callRef === undefined ? Promise.resolve(undefined) : readWatchedCall(ctx, actor.canonicalAccountRef, args.principalRef, args.callRef),
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
    liveCalls: [...new Map([...pendingCalls, ...uncertainCalls, ...recentCalls]
      .filter(row => row.ownerId === actor.canonicalAccountRef).map(row => [row.callRef, row])).values()].map(projectLiveCall),
    ...(watched === undefined ? {} : { watchedCall: watched }),
  }
}

function projectLiveCall(row: import('../../../_generated/dataModel').Doc<'capabilityCalls'>) {
  return {
    callRef: row.callRef, credentialRef: row.credentialId, toolRef: row.toolRef,
    phase: row.state === 'reconciliation_required' ? 'recovery_required' as const
      : row.state !== 'pending' ? 'finished' as const
      : row.result?.kind === 'needs_authority' ? 'awaiting_authority' as const
      : row.dispatchState === 'running' ? 'running' as const : 'queued' as const,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  }
}

/** Requires authenticated Account + selected Agent/Call. Ensures exact lifecycle
 * and receipt evidence outside reporting windows. Invariant: references never
 * authorize a read and observations never mutate. On mismatch: missing, without
 * distinguishing a foreign Call from an absent one. Two bounded indexed reads
 * replace an unbounded history scan; monthly usage keeps its own contract. */
async function readWatchedCall(ctx: QueryCtx, accountRef: string, principalRef: string, callRef: string) {
  const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', index => index.eq('callRef', callRef)).unique()
  if (call === null || call.ownerId !== accountRef || call.principalId !== principalRef) return { kind: 'missing' as const }
  const activity = await ctx.db.query('capabilityCallProjections').withIndex('by_callRef', index => index.eq('callRef', callRef)).unique()
  if (activity !== null && (activity.accountRef !== accountRef || activity.principalRef !== principalRef)) return { kind: 'missing' as const }
  return { kind: 'observed' as const, live: projectLiveCall(call),
    ...(activity === null ? {} : { activity: (({ _id, _creationTime, ...value }) => value)(activity) }) }
}
