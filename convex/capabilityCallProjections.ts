import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { internalMutation, internalQuery, query } from './_generated/server'
import { resolveBusinessActor } from './authz'
import { upsertCallProjection, type CallDispatchProjectionShape } from './lib/callLifecycle/dispatch'

const callValue = v.object({
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

const dimensionKind = v.union(
  v.literal('account'),
  v.literal('agent'),
  v.literal('operation'),
  v.literal('provider'),
  v.literal('application'),
)

const usageResult = v.union(
  v.object({
    kind: v.literal('available'),
    dimensionKind,
    dimensionRef: v.string(),
    periodStartAt: v.number(),
    periodEndAt: v.number(),
    callCountUnits: v.string(),
    completedCountUnits: v.string(),
    outcomeUnknownCountUnits: v.string(),
    updatedAt: v.number(),
    source: v.literal('convex_call_evidence'),
  }),
  v.object({ kind: v.literal('empty') }),
  v.object({ kind: v.literal('unavailable'), code: v.literal('usage_window_too_large') }),
)

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

const MAX_USAGE_ROWS = 10_000
const MAX_ACTIVITY_PAGE_SIZE = 50
type ProjectedPaymentState = 'settled' | 'released' | 'unknown' | 'not_applicable'

function validUsagePeriod(periodStartAt: number, periodEndAt: number): boolean {
  return Number.isSafeInteger(periodStartAt)
    && Number.isSafeInteger(periodEndAt)
    && periodStartAt >= 0
    && periodEndAt > periodStartAt
    && periodEndAt - periodStartAt <= 366 * 24 * 60 * 60 * 1_000
}

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


export const listOwnerCalls = query({
  args: {
    principalRef: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(callValue),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') throw new Error('call_history_authentication_required')
    if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) {
      throw new Error('call_history_page_size_invalid')
    }
    const principalRef = args.principalRef
    const rows = principalRef === undefined
      ? ctx.db.query('capabilityCallProjections')
          .withIndex('by_accountRef_and_createdAt', (index) => index.eq('accountRef', actor.canonicalAccountRef))
      : ctx.db.query('capabilityCallProjections')
          .withIndex('by_accountRef_and_principalRef_and_createdAt', (index) => index
            .eq('accountRef', actor.canonicalAccountRef)
            .eq('principalRef', principalRef))
    const page = await rows.order('desc').paginate(args.paginationOpts)
    return {
      ...page,
      page: page.page.map(({ _id, _creationTime, ...call }) => call),
    }
  },
})

/**
 * Owner-only Agent readback. The principal is supplied by the canonical
 * owned-Agent directory on the server; Account identity always comes from the
 * authenticated owner session. Activity and usage use the same UTC-created
 * Call period, while activity remains independently paginated.
 */
export const readOwnerAgentReadback = query({
  args: {
    principalRef: v.string(),
    periodStartAt: v.number(),
    periodEndAt: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: ownerAgentReadback,
  handler: async (ctx, args) => {
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
  },
})

export const readOwnerUsage = query({
  args: {
    dimensionKind,
    dimensionRef: v.optional(v.string()),
    periodStartAt: v.number(),
    periodEndAt: v.number(),
  },
  returns: usageResult,
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') throw new Error('call_history_authentication_required')
    if (!validUsagePeriod(args.periodStartAt, args.periodEndAt)) {
      throw new Error('usage_period_invalid')
    }
    const dimensionRef = args.dimensionKind === 'account'
      ? actor.canonicalAccountRef
      : args.dimensionRef
    if (dimensionRef === undefined || dimensionRef.length === 0 || dimensionRef.length > 500) {
      throw new Error('usage_dimension_invalid')
    }
    if (args.dimensionKind === 'account'
      && args.dimensionRef !== undefined
      && args.dimensionRef !== actor.canonicalAccountRef) {
      throw new Error('usage_dimension_invalid')
    }
    const rows = args.dimensionKind === 'account'
      ? await ctx.db.query('capabilityCallProjections')
          .withIndex('by_accountRef_and_createdAt', (index) => index
            .eq('accountRef', actor.canonicalAccountRef)
            .gte('createdAt', args.periodStartAt)
            .lt('createdAt', args.periodEndAt))
          .take(MAX_USAGE_ROWS + 1)
      : args.dimensionKind === 'agent'
        ? await ctx.db.query('capabilityCallProjections')
            .withIndex('by_accountRef_and_principalRef_and_createdAt', (index) => index
              .eq('accountRef', actor.canonicalAccountRef)
              .eq('principalRef', dimensionRef)
              .gte('createdAt', args.periodStartAt)
              .lt('createdAt', args.periodEndAt))
            .take(MAX_USAGE_ROWS + 1)
        : args.dimensionKind === 'operation'
          ? await ctx.db.query('capabilityCallProjections')
              .withIndex('by_accountRef_and_toolRef_and_createdAt', (index) => index
                .eq('accountRef', actor.canonicalAccountRef)
                .eq('toolRef', dimensionRef)
                .gte('createdAt', args.periodStartAt)
                .lt('createdAt', args.periodEndAt))
              .take(MAX_USAGE_ROWS + 1)
          : args.dimensionKind === 'provider'
            ? await ctx.db.query('capabilityCallProjections')
                .withIndex('by_accountRef_and_providerRef_and_createdAt', (index) => index
                  .eq('accountRef', actor.canonicalAccountRef)
                  .eq('providerRef', dimensionRef)
                  .gte('createdAt', args.periodStartAt)
                  .lt('createdAt', args.periodEndAt))
                .take(MAX_USAGE_ROWS + 1)
            : await ctx.db.query('capabilityCallProjections')
                .withIndex('by_accountRef_and_applicationRef_and_createdAt', (index) => index
                  .eq('accountRef', actor.canonicalAccountRef)
                  .eq('applicationRef', dimensionRef)
                  .gte('createdAt', args.periodStartAt)
                  .lt('createdAt', args.periodEndAt))
                .take(MAX_USAGE_ROWS + 1)
    if (rows.length > MAX_USAGE_ROWS) {
      return { kind: 'unavailable' as const, code: 'usage_window_too_large' as const }
    }
    if (rows.length === 0) return { kind: 'empty' as const }
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
      dimensionKind: args.dimensionKind,
      dimensionRef,
      periodStartAt: args.periodStartAt,
      periodEndAt: args.periodEndAt,
      callCountUnits: BigInt(rows.length).toString(),
      completedCountUnits: completed.toString(),
      outcomeUnknownCountUnits: outcomeUnknown.toString(),
      updatedAt,
      source: 'convex_call_evidence' as const,
    }
  },
})

export const prepareOwnerSpendRead = internalQuery({
  args: {
    periodStartAt: v.number(),
    periodEndAt: v.number(),
  },
  returns: v.union(
    v.object({ kind: v.literal('allowed'), accountRef: v.string() }),
    v.object({ kind: v.literal('refused'), code: v.string() }),
  ),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') {
      return { kind: 'refused' as const, code: 'call_history_authentication_required' }
    }
    if (!Number.isSafeInteger(args.periodStartAt)
      || !Number.isSafeInteger(args.periodEndAt)
      || args.periodStartAt < 0
      || args.periodEndAt <= args.periodStartAt
      || args.periodEndAt - args.periodStartAt > 366 * 24 * 60 * 60 * 1_000) {
      return { kind: 'refused' as const, code: 'spend_period_invalid' }
    }
    return { kind: 'allowed' as const, accountRef: actor.canonicalAccountRef }
  },
})

export const rebuild = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ continueCursor: v.string(), isDone: v.boolean(), rebuilt: v.number() }),
  handler: async (ctx, args) => {
    if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 100) {
      throw new Error('call_projection_rebuild_page_size_invalid')
    }
    const page = await ctx.db.query('capabilityCalls')
      .order('asc')
      .paginate(args.paginationOpts)
    let rebuilt = 0
    for (const row of page.page) {
      if (
        row.sellerOnboardingCanary !== undefined
        || row.result === undefined
        || row.dispatchState === undefined
        || row.state === 'pending'
        || row.state === 'cancelled'
      ) continue
      await upsertCallProjection(ctx, row, {
        state: row.state,
        result: row.result,
        ...(row.usage === undefined ? {} : { usage: row.usage }),
        ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
        ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
        dispatchState: row.dispatchState,
      } as CallDispatchProjectionShape, row.updatedAt)
      rebuilt += 1
    }
    return { continueCursor: page.continueCursor, isDone: page.isDone, rebuilt }
  },
})
