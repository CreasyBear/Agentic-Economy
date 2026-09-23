import type { PaginationOptions, PaginationResult } from 'convex/server'
import { v, type Infer } from 'convex/values'
import type { MarketplaceMetricsSnapshotRefusalCode } from '@/lib/operator/admin-console/metrics.contracts'

import { addExactAmounts, amountFromParts, type ExactAmount } from '@/modules/money/public'
import { internal } from '../../../_generated/api'
import type { ActionCtx, QueryCtx } from '../../../_generated/server'
import { perthDayWindow, previousPerthDay } from './dayWindow'
import type { MarketplaceEntity, MarketplaceMetricCounts } from './write'

export const metricCallRowValue = v.object({
  callRef: v.string(),
  state: v.union(v.literal('completed'), v.literal('refused'), v.literal('outcome_unknown'), v.null()),
  openAtSnapshot: v.boolean(),
  paidAmount: v.union(v.null(), v.object({ currency: v.string(), exponent: v.number(), units: v.string() })),
  workspaceRef: v.string(),
  agentRef: v.string(),
  providerRef: v.union(v.string(), v.null()),
  toolRef: v.string(),
})
export const metricQuoteRowValue = v.object({ consumed: v.boolean() })
export const metricResolutionRowValue = v.object({ callRef: v.string() })

export type MetricCallRow = Infer<typeof metricCallRowValue>
export type MetricQuoteRow = Infer<typeof metricQuoteRowValue>
export type MetricResolutionRow = Infer<typeof metricResolutionRowValue>

export async function pageCallsForWindowHandler(
  ctx: QueryCtx,
  args: Readonly<{ from: number; toExclusive: number; paginationOpts: PaginationOptions }>,
): Promise<PaginationResult<MetricCallRow>> {
  const result = await ctx.db.query('capabilityCalls')
    .withIndex('by_createdAt', (query) => query.gte('createdAt', args.from).lt('createdAt', args.toExclusive))
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
    }
  }))
  return { ...result, page }
}

export async function pageQuotesForWindowHandler(
  ctx: QueryCtx,
  args: Readonly<{ from: number; toExclusive: number; paginationOpts: PaginationOptions }>,
): Promise<PaginationResult<MetricQuoteRow>> {
  const result = await ctx.db.query('capabilityQuotes')
    .withIndex('by_createdAt', (query) => query.gte('createdAt', args.from).lt('createdAt', args.toExclusive))
    .paginate(args.paginationOpts)
  return { ...result, page: result.page.map((row) => ({ consumed: row.consumedCallRef !== undefined })) }
}

export async function pageResolutionsForWindowHandler(
  ctx: QueryCtx,
  args: Readonly<{ from: number; toExclusive: number; paginationOpts: PaginationOptions }>,
): Promise<PaginationResult<MetricResolutionRow>> {
  const result = await ctx.db.query('purchaseResolutionRecords')
    .withIndex('by_resolvedAt', (query) => query.gte('resolvedAt', args.from).lt('resolvedAt', args.toExclusive))
    .paginate(args.paginationOpts)
  return { ...result, page: result.page.map((row) => ({ callRef: row.callRef })) }
}

function addEntity(target: Map<string, MarketplaceEntity>, entityKind: MarketplaceEntity['entityKind'], entityRef: string | null) {
  if (entityRef !== null) target.set(`${entityKind}:${entityRef}`, { entityKind, entityRef })
}

function sumPaidUsage(rows: readonly MetricCallRow[]): ExactAmount | 'multiple_currencies' | 'unsupported_currency' | null {
  const paid = rows.flatMap((row) => row.paidAmount === null ? [] : [row.paidAmount])
  if (paid.length === 0) return null
  if (paid.some((amount) => amount.currency !== 'AUD')) return 'unsupported_currency'
  if (new Set(paid.map((amount) => `${amount.currency}:${amount.exponent}`)).size !== 1) return 'multiple_currencies'
  let total = amountFromParts(paid[0]?.currency, '0', paid[0]?.exponent)
  if (total === undefined) throw new Error('marketplace_metrics_money_invalid')
  for (const row of paid) {
    const next = addExactAmounts(total, amountFromParts(row.currency, row.units, row.exponent))
    if (next === undefined) throw new Error('marketplace_metrics_money_invalid')
    total = next
  }
  return total
}

async function collectPages<T>(
  load: (paginationOpts: PaginationOptions) => Promise<PaginationResult<T>>,
): Promise<T[]> {
  const rows: T[] = []
  let cursor: string | null = null
  let done = false
  while (!done) {
    const result = await load({ cursor, numItems: 500 })
    rows.push(...result.page)
    cursor = result.continueCursor
    done = result.isDone
  }
  return rows
}

export async function snapshotMarketplaceMetricsDayHandler(
  ctx: ActionCtx,
  args: Readonly<{ day?: string }>,
): Promise<Readonly<{ kind: 'written'; day: string }> | Readonly<{ kind: 'refused'; code: MarketplaceMetricsSnapshotRefusalCode }>> {
  const day = args.day ?? previousPerthDay(Date.now())
  const window = perthDayWindow(day)
  if (window.kind === 'refused') return window
  const range = { from: window.from, toExclusive: window.toExclusive }
  const [callRows, quotes, resolutions] = await Promise.all([
    collectPages(async (paginationOpts) => await ctx.runQuery(internal.adminConsoleMetrics.pageCallsForWindow, { ...range, paginationOpts })),
    collectPages(async (paginationOpts) => await ctx.runQuery(internal.adminConsoleMetrics.pageQuotesForWindow, { ...range, paginationOpts })),
    collectPages(async (paginationOpts) => await ctx.runQuery(internal.adminConsoleMetrics.pageResolutionsForWindow, { ...range, paginationOpts })),
  ])
  const calls = [...new Map(callRows.map((call) => [call.callRef, call])).values()]
  const settledCallValue = sumPaidUsage(calls)
  if (settledCallValue === 'multiple_currencies' || settledCallValue === 'unsupported_currency') {
    return { kind: 'refused', code: settledCallValue }
  }
  const entities = new Map<string, MarketplaceEntity>()
  const terminalCallRefs = new Set<string>()
  for (const call of calls) {
    if (call.state === 'completed' || call.state === 'refused' || call.state === 'outcome_unknown') terminalCallRefs.add(call.callRef)
    if (call.state !== 'completed') continue
    addEntity(entities, 'workspace', call.workspaceRef)
    addEntity(entities, 'agent', call.agentRef)
    addEntity(entities, 'provider', call.providerRef)
    addEntity(entities, 'tool', call.toolRef)
  }
  const entityRows = [...entities.values()]
  const counts: MarketplaceMetricCounts = {
    settledCallValue,
    money: settledCallValue === null ? 'no_settled_usage' : 'settled_only',
    settledCalls: calls.filter((call) => call.paidAmount !== null).length,
    attemptedCalls: calls.length,
    completedCalls: calls.filter((call) => call.state === 'completed').length,
    uncertainCalls: calls.filter((call) => call.state === 'outcome_unknown').length,
    // This is open at snapshot, not historical open-at-day-close.
    uncertainCallsOpenAtClose: calls.filter((call) => call.openAtSnapshot).length,
    quotesCreated: quotes.length,
    quotesConvertedAtClose: quotes.filter((quote) => quote.consumed).length,
    transactingWorkspaces: entityRows.filter((entity) => entity.entityKind === 'workspace').length,
    transactingAgents: entityRows.filter((entity) => entity.entityKind === 'agent').length,
    transactingProviders: entityRows.filter((entity) => entity.entityKind === 'provider').length,
    transactingTools: entityRows.filter((entity) => entity.entityKind === 'tool').length,
    terminalCalls: terminalCallRefs.size,
    terminalCallsWithResolution: new Set(resolutions.filter((row) => terminalCallRefs.has(row.callRef)).map((row) => row.callRef)).size,
  }
  const pendingClear = await ctx.runMutation(internal.adminConsoleMetrics.writeMarketplaceMetricsDay, {
    day, entities: [], counts, replace: true, complete: false,
  })
  let remaining = pendingClear
  while (remaining) {
    remaining = await ctx.runMutation(internal.adminConsoleMetrics.writeMarketplaceMetricsDay, {
      day, entities: [], replace: true, complete: false,
    })
  }
  const batches = entityRows.length === 0 ? [[]] : Array.from({ length: Math.ceil(entityRows.length / 500) }, (_, index) => entityRows.slice(index * 500, (index + 1) * 500))
  for (const [index, batch] of batches.entries()) {
    await ctx.runMutation(internal.adminConsoleMetrics.writeMarketplaceMetricsDay, {
      day, entities: batch, replace: false, complete: index === batches.length - 1,
    })
  }
  return { kind: 'written', day }
}
