import { v, type Infer } from 'convex/values'

import { addExactAmounts, amountFromParts } from '@/modules/money/public'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { emptyMarketplaceFunding, type MarketplaceFunding } from '@/modules/observability/public'
import { internal } from '../../../_generated/api'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { env } from '../../../_generated/server'
import { metricCallRowValue, metricQuoteRowValue, metricResolutionRowValue } from './collect'
import { hadPriorActivity, writeMarketplaceMetricsDayHandler } from './write'

export const buildPhaseValue = v.union(v.literal('calls'), v.literal('quotes'), v.literal('resolutions'))
export const buildProgressValue = v.union(v.null(), v.object({
  day: v.string(), phase: buildPhaseValue, cursor: v.union(v.string(), v.null()),
  environment: v.union(v.literal('sandbox'), v.literal('production'), v.null()),
}))
export const buildStepValue = v.union(
  v.object({ kind: v.literal('progress') }),
  v.object({ kind: v.literal('written') }),
  v.object({ kind: v.literal('missing') }),
  v.object({ kind: v.literal('refused'), code: v.union(v.literal('multiple_currencies'), v.literal('unsupported_currency')) }),
)
export const buildPageArgs = {
  day: v.string(), entityDay: v.string(), phase: buildPhaseValue,
  expectedCursor: v.union(v.string(), v.null()),
  nextCursor: v.string(), done: v.boolean(),
  calls: v.optional(v.array(metricCallRowValue)),
  quotes: v.optional(v.array(metricQuoteRowValue)),
  resolutions: v.optional(v.array(metricResolutionRowValue)),
}

type BuildPage = Readonly<{
  day: string
  entityDay: string
  phase: 'calls' | 'quotes' | 'resolutions'
  expectedCursor: string | null
  nextCursor: string
  done: boolean
  calls?: readonly Infer<typeof metricCallRowValue>[]
  quotes?: readonly Infer<typeof metricQuoteRowValue>[]
  resolutions?: readonly Infer<typeof metricResolutionRowValue>[]
}>

type Build = Doc<'marketplaceMetricBuilds'>
type EntityKind = Doc<'marketplaceEntityDays'>['entityKind']

export async function readMarketplaceMetricsBuild(ctx: QueryCtx, entityDay: string) {
  const row = await ctx.db.query('marketplaceMetricBuilds')
    .withIndex('by_entityDay', (query) => query.eq('entityDay', entityDay)).unique()
  return row === null ? null : { day: row.day, phase: row.phase, cursor: row.cursor, environment: row.funding?.environment ?? null }
}

export async function startMarketplaceMetricsBuild(ctx: MutationCtx, day: string, entityDay: string) {
  const environment = deploymentPaymentEnvironment(env)
  if (environment === undefined) throw new Error('marketplace_metrics_environment_unavailable')
  if (!entityDay.startsWith(`${day}#`)) throw new Error('marketplace_metrics_stage_day_invalid')
  const existing = await ctx.db.query('marketplaceMetricBuilds').withIndex('by_entityDay', q => q.eq('entityDay', entityDay)).unique()
  if (existing !== null) {
    if (existing.day !== day || existing.funding?.environment !== environment) throw new Error('marketplace_metrics_build_identity_changed')
    return
  }
  await ctx.db.insert('marketplaceMetricBuilds', {
    day, entityDay, phase: 'calls', cursor: null,
    funding: emptyMarketplaceFunding(environment),
    settledCallValue: null, settledCalls: 0, attemptedCalls: 0, completedCalls: 0,
    uncertainCalls: 0, uncertainCallsOpenAtClose: 0, quotesCreated: 0,
    quotesConvertedAtClose: 0, transactingWorkspaces: 0, transactingAgents: 0,
    transactingProviders: 0, transactingTools: 0, returningWorkspaces: 0,
    newTransactingProviders: 0, terminalCalls: 0, terminalCallsWithResolution: 0,
  })
  await ctx.scheduler.runAfter(60 * 60 * 1_000, internal.adminConsoleMetrics.writeMarketplaceMetricsDay, {
    day, entityDay, phase: 'cleanup',
  })
}

async function addBuyingAccount(ctx: MutationCtx, day: string, accountRef: string): Promise<boolean> {
  const existing = await ctx.db.query('marketplaceEntityDays')
    .withIndex('by_entityKind_and_entityRef_and_day', q => q.eq('entityKind', 'buyer').eq('entityRef', accountRef).eq('day', day)).unique()
  if (existing === null) {
    await ctx.db.insert('marketplaceEntityDays', { day, entityKind: 'buyer', entityRef: accountRef, completedPurchases: 1 })
    return true
  }
  await ctx.db.patch(existing._id, { completedPurchases: (existing.completedPurchases ?? 0) + 1 })
  return false
}

function includeFunding(totals: MarketplaceFunding, call: Infer<typeof metricCallRowValue>) {
  const funding = call.funding
  if (funding?.kind === 'unclassified' || (funding === undefined && call.paidAmount !== null)) totals.unclassifiedCalls += 1
  if (funding?.kind === 'refunded') {
    totals.refundedCalls += 1
    totals.refundedPurchasedUnits = (BigInt(totals.refundedPurchasedUnits) + BigInt(funding.purchasedUnits)).toString()
  }
  if (funding?.kind !== 'settled') return
  totals.purchasedUnits = (BigInt(totals.purchasedUnits) + BigInt(funding.purchasedUnits)).toString()
  totals.promotionalUnits = (BigInt(totals.promotionalUnits) + BigInt(funding.promotionalUnits)).toString()
  if (BigInt(funding.purchasedUnits) > 0n) {
    totals.customerFundedCalls += 1
    if (call.state === 'completed') totals.completedCustomerFundedCalls += 1
  } else if (BigInt(funding.promotionalUnits) > 0n) totals.promotionalOnlyCalls += 1
}

async function staged(ctx: MutationCtx, day: string, entityKind: EntityKind, entityRef: string) {
  return await ctx.db.query('marketplaceEntityDays')
    .withIndex('by_entityKind_and_entityRef_and_day', (query) => query
      .eq('entityKind', entityKind).eq('entityRef', entityRef).eq('day', day))
    .first() !== null
}

async function insertOnce(ctx: MutationCtx, day: string, entityKind: EntityKind, entityRef: string) {
  if (await staged(ctx, day, entityKind, entityRef)) return false
  await ctx.db.insert('marketplaceEntityDays', { day, entityKind, entityRef })
  return true
}

async function addEntity(ctx: MutationCtx, build: Build, kind: 'workspace' | 'agent' | 'provider' | 'tool', ref: string | null, increments: Record<string, number>) {
  if (ref === null || !(await insertOnce(ctx, build.entityDay, kind, ref))) return
  const key = ({ workspace: 'transactingWorkspaces', agent: 'transactingAgents', provider: 'transactingProviders', tool: 'transactingTools' } as const)[kind]
  increments[key] = (increments[key] ?? 0) + 1
  if (kind === 'workspace' || kind === 'provider') {
    const returning = await hadPriorActivity(ctx, build.day, kind, ref)
    if (kind === 'workspace' && returning) increments.returningWorkspaces = (increments.returningWorkspaces ?? 0) + 1
    if (kind === 'provider' && !returning) increments.newTransactingProviders = (increments.newTransactingProviders ?? 0) + 1
  }
}

function moneyForPage(build: Build, calls: readonly Infer<typeof metricCallRowValue>[]) {
  let money = build.settledCallValue
  for (const call of calls) {
    const paid = call.paidAmount
    if (paid === null) continue
    if (paid.currency !== 'AUD') return { kind: 'refused', code: 'unsupported_currency' } as const
    if (money !== null && money.exponent !== paid.exponent) return { kind: 'refused', code: 'multiple_currencies' } as const
    const amount = amountFromParts(paid.currency, paid.units, paid.exponent)
    if (amount === undefined) throw new Error('marketplace_metrics_money_invalid')
    money = money === null ? amount : addExactAmounts(money, amount) ?? null
    if (money === null) throw new Error('marketplace_metrics_money_invalid')
  }
  return { kind: 'valid', money } as const
}

export async function advanceMarketplaceMetricsBuild(ctx: MutationCtx, args: BuildPage): Promise<
  { kind: 'progress' } | { kind: 'written' } | { kind: 'missing' }
  | { kind: 'refused'; code: 'multiple_currencies' | 'unsupported_currency' }
> {
  const build = await ctx.db.query('marketplaceMetricBuilds')
    .withIndex('by_entityDay', (query) => query.eq('entityDay', args.entityDay)).unique()
  if (build === null) return { kind: 'missing' }
  if (build.day !== args.day || build.phase !== args.phase || build.cursor !== args.expectedCursor) {
    throw new Error('marketplace_metrics_build_cursor_changed')
  }
  const increments: Record<string, number> = {}
  if (build.funding === undefined) throw new Error('marketplace_metrics_build_requires_restart')
  if (build.funding.environment !== deploymentPaymentEnvironment(env)) throw new Error('marketplace_metrics_environment_changed')
  const funding = { ...build.funding }
  let money = build.settledCallValue
  if (args.phase === 'calls') {
    const calls = [...new Map((args.calls ?? []).map((call) => [call.callRef, call])).values()]
    const unseen = []
    for (const call of calls) if (!(await staged(ctx, build.entityDay, 'call', call.callRef))) unseen.push(call)
    const checked = moneyForPage(build, unseen)
    if (checked.kind === 'refused') return checked
    money = checked.money
    for (const call of unseen) {
      await insertOnce(ctx, build.entityDay, 'call', call.callRef)
      includeFunding(funding, call)
      increments.attemptedCalls = (increments.attemptedCalls ?? 0) + 1
      if (call.paidAmount !== null) increments.settledCalls = (increments.settledCalls ?? 0) + 1
      if (call.state === 'outcome_unknown') increments.uncertainCalls = (increments.uncertainCalls ?? 0) + 1
      if (call.openAtSnapshot) increments.uncertainCallsOpenAtClose = (increments.uncertainCallsOpenAtClose ?? 0) + 1
      if (call.state === 'completed' || call.state === 'refused' || call.state === 'outcome_unknown') {
        await insertOnce(ctx, build.entityDay, 'terminal', call.callRef)
        increments.terminalCalls = (increments.terminalCalls ?? 0) + 1
      }
      if (call.state !== 'completed') continue
      if (call.funding?.kind === 'settled' && BigInt(call.funding.purchasedUnits) > 0n
        && await addBuyingAccount(ctx, build.entityDay, call.workspaceRef)) funding.buyingAccounts += 1
      increments.completedCalls = (increments.completedCalls ?? 0) + 1
      await addEntity(ctx, build, 'workspace', call.workspaceRef, increments)
      await addEntity(ctx, build, 'agent', call.agentRef, increments)
      await addEntity(ctx, build, 'provider', call.providerRef, increments)
      await addEntity(ctx, build, 'tool', call.toolRef, increments)
    }
  } else if (args.phase === 'quotes') {
    increments.quotesCreated = args.quotes?.length ?? 0
    increments.quotesConvertedAtClose = args.quotes?.filter((row) => row.consumed).length ?? 0
  } else {
    for (const callRef of new Set((args.resolutions ?? []).map((row) => row.callRef))) {
      if (!(await staged(ctx, build.entityDay, 'terminal', callRef))) continue
      if (await insertOnce(ctx, build.entityDay, 'resolved', callRef)) {
        increments.terminalCallsWithResolution = (increments.terminalCallsWithResolution ?? 0) + 1
      }
    }
  }
  const nextPhase = args.done ? args.phase === 'calls' ? 'quotes' : args.phase === 'quotes' ? 'resolutions' : null : args.phase
  const counts = Object.fromEntries(Object.entries(increments).map(([field, count]) => [field, (build[field as keyof Build] as number) + count]))
  if (nextPhase !== null) {
    await ctx.db.patch(build._id, { ...counts, settledCallValue: money, funding,
      phase: nextPhase, cursor: args.done ? null : args.nextCursor })
    return { kind: 'progress' }
  }
  await writeMarketplaceMetricsDayHandler(ctx, {
    day: build.day, entityDay: build.entityDay, phase: 'publish', sourceStartedAt: build._creationTime,
    counts: {
      funding,
      settledCallValue: money, money: money === null ? 'no_settled_usage' : 'settled_only',
      settledCalls: (counts.settledCalls as number | undefined) ?? build.settledCalls,
      attemptedCalls: (counts.attemptedCalls as number | undefined) ?? build.attemptedCalls,
      completedCalls: (counts.completedCalls as number | undefined) ?? build.completedCalls,
      uncertainCalls: (counts.uncertainCalls as number | undefined) ?? build.uncertainCalls,
      uncertainCallsOpenAtClose: (counts.uncertainCallsOpenAtClose as number | undefined) ?? build.uncertainCallsOpenAtClose,
      quotesCreated: (counts.quotesCreated as number | undefined) ?? build.quotesCreated,
      quotesConvertedAtClose: (counts.quotesConvertedAtClose as number | undefined) ?? build.quotesConvertedAtClose,
      transactingWorkspaces: build.transactingWorkspaces,
      transactingAgents: build.transactingAgents,
      transactingProviders: build.transactingProviders,
      transactingTools: build.transactingTools,
      returningWorkspaces: build.returningWorkspaces,
      newTransactingWorkspaces: build.transactingWorkspaces - build.returningWorkspaces,
      newTransactingProviders: build.newTransactingProviders,
      terminalCalls: build.terminalCalls,
      terminalCallsWithResolution: (counts.terminalCallsWithResolution as number | undefined) ?? build.terminalCallsWithResolution,
    },
  })
  await ctx.db.delete(build._id)
  await ctx.scheduler.runAfter(0, internal.adminConsoleMetrics.writeMarketplaceMetricsDay, {
    day: build.day, entityDay: build.entityDay, phase: 'refs',
  })
  return { kind: 'written' }
}
