import { v, type ObjectType } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { MAX_USAGE_ROWS, validUsagePeriod } from './contracts'

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

export const readOwnerUsageArgs = {
  dimensionKind,
  dimensionRef: v.optional(v.string()),
  periodStartAt: v.number(),
  periodEndAt: v.number(),
}
export const readOwnerUsageResult = usageResult

export async function readOwnerUsageHandler(ctx: QueryCtx, args: ObjectType<typeof readOwnerUsageArgs>) {
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
}
