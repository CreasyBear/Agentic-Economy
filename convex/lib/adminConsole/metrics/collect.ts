import type { PaginationOptions, PaginationResult } from 'convex/server'
import { v, type Infer } from 'convex/values'
import type { MarketplaceMetricsSnapshotRefusalCode } from '@/lib/operator/admin-console/metrics.contracts'

import { addExactAmounts, amountFromParts, type ExactAmount } from '@/modules/money/public'
import { internal } from '../../../_generated/api'
import type { ActionCtx, QueryCtx } from '../../../_generated/server'
import { countMarketEvidenceBetween, type MarketEvidenceKind } from '../../../marketEvidence'
import { perthDayWindow, previousPerthDay } from './dayWindow'
import type { MarketplaceEntity, MarketplaceMetricCounts } from './write'

export const metricCallRowValue = v.object({
  callRef: v.string(),
  state: v.union(v.literal('completed'), v.literal('refused'), v.literal('outcome_unknown'), v.null()),
  workspaceRef: v.string(),
  agentRef: v.string(),
  providerRef: v.union(v.string(), v.null()),
  toolRef: v.string(),
})
export const metricQuoteRowValue = v.object({ consumed: v.boolean() })
export const metricUsageRowValue = v.object({ currency: v.string(), exponent: v.number(), units: v.string() })
export const metricResolutionRowValue = v.object({ callRef: v.string() })

export type MetricCallRow = Infer<typeof metricCallRowValue>
export type MetricQuoteRow = Infer<typeof metricQuoteRowValue>
export type MetricUsageRow = Infer<typeof metricUsageRowValue>
export type MetricResolutionRow = Infer<typeof metricResolutionRowValue>

export async function countEvidenceForWindowHandler(
  ctx: QueryCtx,
  args: Readonly<{ kind: MarketEvidenceKind; from: number; toExclusive: number }>,
): Promise<number> {
  return await countMarketEvidenceBetween(ctx, args.kind, args.from, args.toExclusive)
}

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

export async function pageUsageForWindowHandler(
  ctx: QueryCtx,
  args: Readonly<{ from: number; toExclusive: number; paginationOpts: PaginationOptions }>,
): Promise<PaginationResult<MetricUsageRow>> {
  const result = await ctx.db.query('moneyUsageEvents')
    .withIndex('by_chargeState_and_observedAt', (query) => query
      .eq('chargeState', 'paid')
      .gte('observedAt', args.from)
      .lt('observedAt', args.toExclusive))
    .paginate(args.paginationOpts)
  return { ...result, page: result.page.map((row) => ({
    currency: row.currency,
    exponent: row.exponent,
    units: row.amountUnits,
  })) }
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

export async function countOpenUncertainCallsHandler(ctx: QueryCtx): Promise<number> {
  return (await ctx.db.query('capabilityCalls')
    .withIndex('by_state_and_reconciliation_nextAttemptAt', (query) => query.eq('state', 'reconciliation_required'))
    .take(1_001)).length
}

function addEntity(target: Map<string, MarketplaceEntity>, entityKind: MarketplaceEntity['entityKind'], entityRef: string | null) {
  if (entityRef !== null) target.set(`${entityKind}:${entityRef}`, { entityKind, entityRef })
}

function sumPaidUsage(rows: readonly MetricUsageRow[]): ExactAmount | 'multiple_currencies' | 'unsupported_currency' | null {
  if (rows.length === 0) return null
  if (rows.some((row) => row.currency !== 'AUD')) return 'unsupported_currency'
  const scales = new Set(rows.map((row) => `${row.currency}:${row.exponent}`))
  if (scales.size !== 1) return 'multiple_currencies'
  let total = amountFromParts(rows[0]?.currency, '0', rows[0]?.exponent)
  if (total === undefined) throw new Error('marketplace_metrics_money_invalid')
  for (const row of rows) {
    const amount = amountFromParts(row.currency, row.units, row.exponent)
    const next = addExactAmounts(total, amount)
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
  const [attemptedCalls, completedCalls, uncertainCalls, settledCalls, calls, quotes, usage, resolutions, uncertainCallsOpenAtClose] = await Promise.all([
    ctx.runQuery(internal.adminConsoleMetrics.countEvidenceForWindow, { kind: 'ae_invocation', ...range }),
    ctx.runQuery(internal.adminConsoleMetrics.countEvidenceForWindow, { kind: 'ae_invocation_completed', ...range }),
    ctx.runQuery(internal.adminConsoleMetrics.countEvidenceForWindow, { kind: 'ae_reconciliation_required', ...range }),
    ctx.runQuery(internal.adminConsoleMetrics.countEvidenceForWindow, { kind: 'ae_settlement', ...range }),
    collectPages(async (paginationOpts) => await ctx.runQuery(internal.adminConsoleMetrics.pageCallsForWindow, { ...range, paginationOpts })),
    collectPages(async (paginationOpts) => await ctx.runQuery(internal.adminConsoleMetrics.pageQuotesForWindow, { ...range, paginationOpts })),
    collectPages(async (paginationOpts) => await ctx.runQuery(internal.adminConsoleMetrics.pageUsageForWindow, { ...range, paginationOpts })),
    collectPages(async (paginationOpts) => await ctx.runQuery(internal.adminConsoleMetrics.pageResolutionsForWindow, { ...range, paginationOpts })),
    ctx.runQuery(internal.adminConsoleMetrics.countOpenUncertainCalls, {}),
  ])
  const settledCallValue = sumPaidUsage(usage)
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
    money: settledCallValue === null ? 'not_configured' : 'settled_only',
    settledCalls,
    attemptedCalls,
    completedCalls,
    uncertainCalls,
    uncertainCallsOpenAtClose,
    quotesCreated: quotes.length,
    quotesConvertedAtClose: quotes.filter((quote) => quote.consumed).length,
    transactingWorkspaces: entityRows.filter((entity) => entity.entityKind === 'workspace').length,
    transactingAgents: entityRows.filter((entity) => entity.entityKind === 'agent').length,
    transactingProviders: entityRows.filter((entity) => entity.entityKind === 'provider').length,
    transactingTools: entityRows.filter((entity) => entity.entityKind === 'tool').length,
    terminalCalls: terminalCallRefs.size,
    terminalCallsWithResolution: new Set(resolutions.filter((row) => terminalCallRefs.has(row.callRef)).map((row) => row.callRef)).size,
  }
  const batches = entityRows.length === 0 ? [[]] : Array.from({ length: Math.ceil(entityRows.length / 500) }, (_, index) => entityRows.slice(index * 500, (index + 1) * 500))
  for (const [index, batch] of batches.entries()) {
    const final = index === batches.length - 1
    await ctx.runMutation(internal.adminConsoleMetrics.writeMarketplaceMetricsDay, {
      day,
      entities: batch,
      replace: index === 0,
      ...(final ? { counts } : {}),
    })
  }
  return { kind: 'written', day }
}
