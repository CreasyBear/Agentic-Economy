import type { PaginationOptions, PaginationResult } from 'convex/server'
import { v, type Infer } from 'convex/values'
import type { MarketplaceMetricsSnapshotRefusalCode } from '@/lib/operator/admin-console/metrics.contracts'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { callFundingValue, classifyCallFunding } from '@/modules/observability/public'

import { internal } from '../../../_generated/api'
import type { ActionCtx, QueryCtx } from '../../../_generated/server'
import { env } from '../../../_generated/server'
import { perthDayWindow, previousPerthDay } from './dayWindow'

export const metricCallRowValue = v.object({
  callRef: v.string(),
  state: v.union(v.literal('completed'), v.literal('refused'), v.literal('outcome_unknown'), v.null()),
  openAtSnapshot: v.boolean(),
  paidAmount: v.union(v.null(), v.object({ currency: v.string(), exponent: v.number(), units: v.string() })),
  workspaceRef: v.string(),
  agentRef: v.string(),
  providerRef: v.union(v.string(), v.null()),
  toolRef: v.string(),
  funding: v.optional(callFundingValue),
})
export const metricQuoteRowValue = v.object({ consumed: v.boolean() })
export const metricResolutionRowValue = v.object({ callRef: v.string() })

type MetricCallRow = Infer<typeof metricCallRowValue>
type MetricQuoteRow = Infer<typeof metricQuoteRowValue>
type MetricResolutionRow = Infer<typeof metricResolutionRowValue>

export async function pageCallsForWindowHandler(
  ctx: QueryCtx,
  args: Readonly<{ from: number; toExclusive: number; paginationOpts: PaginationOptions }>,
): Promise<PaginationResult<MetricCallRow>> {
  const environment = deploymentPaymentEnvironment(env)
  if (environment === undefined) throw new Error('marketplace_metrics_environment_unavailable')
  const result = await ctx.db.query('capabilityCalls')
    .withIndex('by_environment_and_createdAt', (query) => query.eq('environment', environment).gte('createdAt', args.from).lt('createdAt', args.toExclusive))
    .paginate(args.paginationOpts)
  const page = await Promise.all(result.page.map(async (row): Promise<MetricCallRow> => {
    const projection = await ctx.db.query('capabilityCallProjections')
      .withIndex('by_callRef', (query) => query.eq('callRef', row.callRef))
      .unique()
    const state = projection?.state
      ?? (row.state === 'completed' || row.state === 'refused'
        ? row.state
        : row.state === 'reconciliation_required' ? 'outcome_unknown' : null)
    return {
      callRef: row.callRef,
      state,
      openAtSnapshot: row.state === 'reconciliation_required',
      paidAmount: row.usage?.chargeState === 'paid' ? row.usage.amount : null,
      workspaceRef: row.ownerId,
      agentRef: row.principalId,
      providerRef: state === 'completed' ? projection?.providerRef ?? null : null,
      toolRef: row.toolRef,
      funding: classifyCallFunding(row),
    }
  }))
  return { ...result, page }
}

export async function pageQuotesForWindowHandler(
  ctx: QueryCtx,
  args: Readonly<{ from: number; toExclusive: number; paginationOpts: PaginationOptions }>,
): Promise<PaginationResult<MetricQuoteRow>> {
  const environment = deploymentPaymentEnvironment(env)
  if (environment === undefined) throw new Error('marketplace_metrics_environment_unavailable')
  const result = await ctx.db.query('capabilityQuotes')
    .withIndex('by_createdAt', (query) => query.gte('createdAt', args.from).lt('createdAt', args.toExclusive))
    .filter(query => query.eq(query.field('environment'), environment))
    .paginate(args.paginationOpts)
  return { ...result, page: result.page.map((row) => ({ consumed: row.consumedCallRef !== undefined })) }
}

export async function pageResolutionsForWindowHandler(
  ctx: QueryCtx,
  args: Readonly<{ from: number; toExclusive: number; paginationOpts: PaginationOptions }>,
): Promise<PaginationResult<MetricResolutionRow>> {
  const environment = deploymentPaymentEnvironment(env)
  if (environment === undefined) throw new Error('marketplace_metrics_environment_unavailable')
  const result = await ctx.db.query('purchaseResolutionRecords')
    .withIndex('by_resolvedAt', (query) => query.gte('resolvedAt', args.from).lt('resolvedAt', args.toExclusive))
    .paginate(args.paginationOpts)
  const rows = await Promise.all(result.page.map(async row => {
    const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', row.callRef)).unique()
    return call?.environment === environment ? { callRef: row.callRef } : null
  }))
  return { ...result, page: rows.filter(row => row !== null) }
}

// One invocation reads at most eight source pages; a continuation owns the
// next cursor. Source rows never accumulate across pages or action invocations.
const PAGE_SIZE = 25
const PAGES_PER_ACTION = 8

export async function snapshotMarketplaceMetricsDayHandler(
  ctx: ActionCtx,
  args: Readonly<{ day?: string; entityDay?: string }>,
): Promise<
  Readonly<{ kind: 'written' | 'queued'; day: string }>
  | Readonly<{ kind: 'refused'; code: MarketplaceMetricsSnapshotRefusalCode }>
> {
  const environment = deploymentPaymentEnvironment(env)
  if (environment === undefined) return { kind: 'refused', code: 'environment_unavailable' }
  const day = args.day ?? previousPerthDay(Date.now())
  const window = perthDayWindow(day)
  if (window.kind === 'refused') return window
  const entityDay = args.entityDay ?? `${day}#${crypto.randomUUID()}`
  if (args.entityDay === undefined) {
    await ctx.runMutation(internal.adminConsoleMetrics.startMarketplaceMetricsBuild, { day, entityDay })
  }
  const range = { from: window.from, toExclusive: window.toExclusive }
  for (let index = 0; index < PAGES_PER_ACTION; index += 1) {
    const build = await ctx.runQuery(internal.adminConsoleMetrics.readMarketplaceMetricsBuild, { entityDay })
    if (build === null || build.day !== day) throw new Error('marketplace_metrics_build_missing')
    if (build.environment !== environment) return { kind: 'refused', code: 'environment_unavailable' }
    const paginationOpts = { cursor: build.cursor, numItems: PAGE_SIZE }
    const common = { day, entityDay, phase: build.phase, expectedCursor: build.cursor }
    const staged = build.phase === 'calls'
      ? await ctx.runQuery(internal.adminConsoleMetrics.pageCallsForWindow, { ...range, paginationOpts })
        .then((page) => ctx.runMutation(internal.adminConsoleMetrics.advanceMarketplaceMetricsBuild, {
          ...common, nextCursor: page.continueCursor, done: page.isDone, calls: page.page,
        }))
      : build.phase === 'quotes'
        ? await ctx.runQuery(internal.adminConsoleMetrics.pageQuotesForWindow, { ...range, paginationOpts })
          .then((page) => ctx.runMutation(internal.adminConsoleMetrics.advanceMarketplaceMetricsBuild, {
            ...common, nextCursor: page.continueCursor, done: page.isDone, quotes: page.page,
          }))
        : await ctx.runQuery(internal.adminConsoleMetrics.pageResolutionsForWindow, { ...range, paginationOpts })
          .then((page) => ctx.runMutation(internal.adminConsoleMetrics.advanceMarketplaceMetricsBuild, {
            ...common, nextCursor: page.continueCursor, done: page.isDone, resolutions: page.page,
          }))
    if (staged.kind === 'refused') return staged
    if (staged.kind === 'missing') throw new Error('marketplace_metrics_build_missing')
    if (staged.kind === 'written') return { kind: 'written', day }
  }
  await ctx.scheduler.runAfter(0, internal.adminConsoleMetrics.snapshotMarketplaceMetricsDay, { day, entityDay })
  return { kind: 'queued', day }
}
