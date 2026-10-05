"use node"

import { isDeepStrictEqual } from 'node:util'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { sealTreasurySnapshot, type TreasurySnapshot } from '@/modules/money/treasury-report'
import { X402_SPEND_WINDOW_MS } from '@/modules/money/x402-spend-admission'
import { TREASURY_FINALIZED_BLOCK_MAX_AGE_MS, type TreasuryBatch, type TreasuryChainObservation } from '@/modules/money/treasury'
import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'
import { configuredContext, readFormanceTreasuryAudit, readFormanceTreasurySnapshot,
  type FormanceContext, type FormanceTreasurySnapshotResult } from '../formance/gateway'
import { auditTreasuryCash, treasuryInFlight } from './cashAudit'
import { auditTreasuryFunding } from './fundingAudit'
import type { TreasuryAttemptSource, TreasuryCallSource, TreasuryFundingSourcesResult,
  TreasurySpendReservationSourcesResult, TreasurySpendExposureResult } from './auditSources'
import type { TreasurySnapshotContext } from './snapshotContext'
import { readTreasuryChainObservation } from './chainObservation'

type Unavailable = Readonly<{ kind: 'unavailable'; code: string }>
type Rows<T> = Unavailable | Readonly<{ kind: 'available'; rows: readonly T[] }>
type SourcePage<T> = Unavailable | Readonly<{ kind: 'available'; rows: readonly T[]; isDone: boolean; cursor: string | null }>
type Funding = Extract<TreasuryFundingSourcesResult, { kind: 'available' }>['rows'][number]
type Reservation = Extract<TreasurySpendReservationSourcesResult, { kind: 'available' }>['rows'][number]
type Sources = Readonly<{ batches: Rows<TreasuryBatch>; attempts: Rows<TreasuryAttemptSource>; calls: Rows<TreasuryCallSource>;
  funding: Rows<Funding>; reservations: Rows<Reservation>; exposure: TreasurySpendExposureResult }>
type Context = Pick<ActionCtx, 'runQuery' | 'runMutation'>
export type TreasurySnapshotResult = { kind: 'published'; replayed: boolean; newAlertRefs: string[] } | Unavailable
const unavailable = (code: string): Unavailable => ({ kind: 'unavailable', code })
const SOURCE_PAGE_LIMIT = 400
type SnapshotDependencies = Readonly<{
  admit: () => Promise<boolean>; formance?: FormanceContext; now?: number;
  chainRead?: typeof readTreasuryChainObservation;
}>

/**
 * Requires workload authority and one explicit deployment/custody identity.
 * Ensures a sealed historical report built from native insertion cutoff, complete
 * bounded pages and fresh independent processor/chain readback. Publication owns
 * monotonicity and alert episodes; a lost result can safely retry the same report.
 * Invariant: source outages do not fabricate zeros or resolve old contradictions.
 * Mutable sources are read twice: changed records make checks unavailable rather
 * than comparing different states. This deliberately trades availability under
 * concurrent writes for evidence integrity; it is not a cross-system transaction.
 * On violation: publish independent available metrics and explicit unavailable
 * checks, or refuse if even the current custody identity is unavailable.
 * Cost: complete history is bounded to 400 pages per source and 10k native rows;
 * saturating a bound raises unavailable. No partial history can pass as complete.
 * A single full retry costs another audit when booking catches up with the probe.
 * Keep that retry local: it restores fresh evidence without extending freshness,
 * rewriting historical clocks, or adding a cache or persistent retry state.
 */
export async function reconcileTreasurySnapshot(ctx: Context, dependencies: SnapshotDependencies): Promise<TreasurySnapshotResult> {
  return reconcileSnapshotAttempt(ctx, dependencies, true)
}

async function reconcileSnapshotAttempt(ctx: Context, dependencies: SnapshotDependencies, canRefreshCheckpoint: boolean): Promise<TreasurySnapshotResult> {
  const bootstrapAt = dependencies.now ?? Date.now()
  if (!Number.isSafeInteger(bootstrapAt) || bootstrapAt < 0 || bootstrapAt > Date.now()) return unavailable('treasury_snapshot_cutoff_invalid')
  const bootstrap = await ctx.runQuery(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: bootstrapAt })
  if (bootstrap.kind !== 'available') return bootstrap
  const probeStartedAt = Date.now()
  // The reader captures its own original start clock. Never backdate a fresh
  // network read to bootstrapAt or move only the report clock after source reads.
  const chainReadback = bootstrap.progress.kind === 'ready'
    ? await (dependencies.chainRead ?? readTreasuryChainObservation)({ environment: bootstrap.identity.environment,
      address: bootstrap.identity.address, checkpoint: bootstrap.progress.checkpoint })
      .catch(() => unavailable('treasury_chain_unavailable'))
    : unavailable('treasury_chain_history_unavailable')
  const snapshotAt = dependencies.now ?? (chainReadback.kind === 'observed' ? chainReadback.observedAt : probeStartedAt)
  if (!Number.isSafeInteger(snapshotAt) || snapshotAt < 0 || snapshotAt > Date.now()) return unavailable('treasury_snapshot_cutoff_invalid')
  const base: TreasurySnapshotContext = await ctx.runQuery(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: snapshotAt })
  if (base.kind !== 'available') return base
  const configured = dependencies.formance === undefined ? configuredContext() : { kind: 'configured' as const, context: dependencies.formance }
  const context = configured.kind === 'configured' && configured.context.configuration.environment === base.identity.environment
    ? configured.context : undefined
  const input = { custodyRef: base.identity.custodyRef, custodyGeneration: base.identity.custodyGeneration, snapshotAt }
  const [sources, metrics, audit] = await Promise.all([
    readSources(ctx, snapshotAt),
    context === undefined ? unavailable('treasury_ledger_configuration_unavailable') : readFormanceTreasurySnapshot(context, input),
    context === undefined ? unavailable('treasury_ledger_configuration_unavailable') : readFormanceTreasuryAudit(context, input),
  ])
  const ledger = ledgerMetric(metrics)
  const noHistory = unavailable('treasury_source_history_unavailable')
  let cash: Awaited<ReturnType<typeof auditTreasuryCash>> = {
    cash: noHistory, settlements: noHistory, reservations: noHistory, chain: noHistory,
    inFlight: sources.calls.kind === 'available' ? treasuryInFlight(sources.calls.rows, snapshotAt) : sources.calls,
    rawCashDifferenceUnits: null, cashTimingAdjustmentUnits: null, historyStartedAt: null, deposits: [], depositsComplete: false,
  }
  if (audit.kind === 'available' && sources.batches.kind === 'available' && sources.attempts.kind === 'available'
    && sources.calls.kind === 'available' && sources.reservations.kind === 'available') {
    try {
      cash = await auditTreasuryCash({ identity: base.identity, snapshotAt, progress: base.progress,
        batches: sources.batches.rows, attempts: sources.attempts.rows, calls: sources.calls.rows,
        reservations: sources.reservations.rows, transactions: audit.transactions, ledger, chainReadback })
    } catch (cause) { degradeBackend(cause, undefined, { site: 'reconcileTreasurySnapshot.cash', reason: 'source_unavailable' }) }
  }
  let funding: TreasurySnapshot['checks']['funding'] = sources.funding.kind !== 'available' ? sources.funding
    : audit.kind !== 'available' ? unavailable(audit.code) : await auditTreasuryFunding([...sources.funding.rows], audit.transactions, base.identity.environment)
  let spending: TreasurySnapshot['spending'] = sources.exposure.kind === 'available' && base.maximumUnits !== null
    ? { kind: 'available', observedAt: snapshotAt, windowStartsAt: Math.max(0, snapshotAt - X402_SPEND_WINDOW_MS),
      settledUnits: sources.exposure.settledLast24hUnits, liabilityUnits: sources.exposure.liabilityUnits, maximumUnits: base.maximumUnits }
    : unavailable('treasury_spend_exposure_unavailable')
  const [afterBase, afterSources, afterAudit] = await Promise.all([
    ctx.runQuery(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: snapshotAt }),
    readSources(ctx, snapshotAt),
    context === undefined ? unavailable('treasury_ledger_configuration_unavailable') : readFormanceTreasuryAudit(context, input),
  ])
  // Complete, validated histories have their own page/row bounds. Compare their
  // values without imposing the smaller single-JSON-value digest limit; all
  // published identity and evidence digests retain their canonical material.
  const stable = isDeepStrictEqual(base, afterBase) && isDeepStrictEqual(sources, afterSources)
    && isDeepStrictEqual(audit, afterAudit)
  if (!stable) {
    const changed = unavailable('treasury_sources_changed_during_audit')
    cash = { ...cash, cash: changed, settlements: changed, reservations: changed }
    funding = changed; spending = changed
  }
  const { cash: cashCheck, settlements, reservations, ...cashMetrics } = cash
  const material: Omit<TreasurySnapshot, 'snapshotRef' | 'evidenceDigest'> = {
    snapshotAt, environment: base.identity.environment, custodyRef: base.identity.custodyRef,
    custodyGeneration: base.identity.custodyGeneration, custodyIdentityDigest: canonicalDigest(base.identity),
    ledger, referenceRate: base.referenceRate, spending, ...cashMetrics,
    checks: { cash: cashCheck, settlements, funding, reservations }, alerts: [],
  }
  // A newly finalized range can finish booking after this cutoff. Retry at most
  // once, only after the exact probed checkpoint is now booked. The new attempt
  // obtains its own real RPC start clock and rereads every financial source;
  // changed eligible sources never take this path.
  if (canRefreshCheckpoint && dependencies.now === undefined && stable && cashCheck.kind === 'unavailable'
    && advancedReadback(bootstrap, chainReadback)) {
    const current = await ctx.runQuery(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: Date.now() })
    if (current.kind === 'available' && current.progress.kind === 'ready' && chainReadback.kind === 'observed'
      && canonicalDigest(current.identity) === canonicalDigest(bootstrap.identity)
      && canonicalDigest(current.progress.checkpoint) === canonicalDigest(chainReadback.checkpoint)) {
      return reconcileSnapshotAttempt(ctx, dependencies, false)
    }
  }
  material.alerts = treasuryAlerts(material, base)
  if (!await dependencies.admit()) return unavailable('treasury_workload_authority_unavailable')
  return await ctx.runMutation(internal.moneyTreasuryReconciliation.publishSnapshot, { snapshot: sealTreasurySnapshot(material) })
}

function advancedReadback(context: Extract<TreasurySnapshotContext, { kind: 'available' }>, proof: TreasuryChainObservation | Unavailable): boolean {
  return context.progress.kind === 'ready' && proof.kind === 'observed'
    && proof.environment === context.identity.environment && proof.network === context.identity.network
    && proof.asset === context.identity.asset && proof.address === context.identity.address && proof.caughtUp
    && Number.isSafeInteger(proof.observedAt) && proof.observedAt >= 0
    && Number.isSafeInteger(proof.blockTimestamp) && proof.blockTimestamp >= 0 && proof.blockTimestamp <= proof.observedAt
    && proof.observedAt - proof.blockTimestamp < TREASURY_FINALIZED_BLOCK_MAX_AGE_MS
    && proof.fromBlock === (BigInt(context.progress.checkpoint.blockNumber) + 1n).toString()
    && /^(?:0|[1-9]\d{0,77})$/u.test(proof.checkpoint.blockNumber)
    && BigInt(proof.checkpoint.blockNumber) > BigInt(context.progress.checkpoint.blockNumber)
}

async function readSources(ctx: Context, cutoffAt: number): Promise<Sources> {
  const [batches, attempts, calls, funding, reservations, exposure] = await Promise.all([
    readPages<TreasuryBatch>(cursor => ctx.runQuery(internal.moneyTreasuryReconciliation.readBatchSources, { cutoffAt, ...cursorArg(cursor) })),
    readPages<TreasuryAttemptSource>(cursor => ctx.runQuery(internal.moneyTreasuryReconciliation.readAttemptSources, { cutoffAt, ...cursorArg(cursor) })),
    readPages<TreasuryCallSource>(cursor => ctx.runQuery(internal.moneyTreasuryReconciliation.readCallSources, { cutoffAt, ...cursorArg(cursor) })),
    readPages<Funding>(cursor => ctx.runQuery(internal.moneyTreasuryReconciliation.readFundingSources, { cutoffAt, ...cursorArg(cursor) })),
    readPages<Reservation>(cursor => ctx.runQuery(internal.moneyTreasuryReconciliation.readSpendReservationSources, { cutoffAt, ...cursorArg(cursor) })),
    ctx.runQuery(internal.moneyTreasuryReconciliation.readSpendExposure, { cutoffAt }),
  ])
  return { batches, attempts, calls, funding, reservations, exposure }
}
const cursorArg = (cursor: string | undefined) => cursor === undefined ? {} : { cursor }
async function readPages<T>(read: (cursor?: string) => Promise<SourcePage<T>>): Promise<Rows<T>> {
  const deadline = Date.now() + 30_000
  const rows: T[] = []; const cursors = new Set<string>(); let cursor: string | undefined
  try {
    for (let count = 0; count < SOURCE_PAGE_LIMIT; count += 1) {
      if (Date.now() >= deadline) return unavailable('treasury_source_read_budget_exceeded')
      const page = await read(cursor)
      if (page.kind !== 'available') return page
      if (page.rows.length > 25) return unavailable('treasury_source_page_invalid')
      rows.push(...page.rows)
      if (page.isDone) return { kind: 'available', rows }
      if (page.cursor === null || cursors.has(page.cursor)) return unavailable('treasury_source_cursor_invalid')
      cursors.add(page.cursor); cursor = page.cursor
    }
  } catch (cause) {
    return degradeBackend(cause, unavailable('treasury_source_read_unavailable'), { site: 'readTreasurySnapshotPages', reason: 'source_unavailable' })
  }
  return unavailable('treasury_source_history_incomplete')
}

function ledgerMetric(metrics: FormanceTreasurySnapshotResult): TreasurySnapshot['ledger'] {
  return metrics.kind !== 'available' ? unavailable(metrics.code) : {
    kind: 'available', observedAt: metrics.snapshotAt, ...metrics.treasury,
    payments24hUnits: metrics.settledUsdc.last24hUnits, payments7dUnits: metrics.settledUsdc.last7dUnits,
    paymentBasis: 'gross_provider_payments', purchasedAvailableAudUnits: metrics.liabilityAud.purchasedAvailableUnits,
    purchasedReservedAudUnits: metrics.liabilityAud.purchasedReservedUnits,
    promotionalAvailableAudUnits: metrics.liabilityAud.promotionalAvailableUnits,
    promotionalReservedAudUnits: metrics.liabilityAud.promotionalReservedUnits,
  }
}

export function treasuryAlerts(snapshot: Omit<TreasurySnapshot, 'snapshotRef' | 'evidenceDigest'>,
  context: Extract<TreasurySnapshotContext, { kind: 'available' }>): TreasurySnapshot['alerts'] {
  const alerts: TreasurySnapshot['alerts'] = []
  const add = (code: TreasurySnapshot['alerts'][number]['code'], severity: 'warning' | 'critical', evidenceRefs: readonly string[] = []) => {
    alerts.push({ code, severity, evidenceRefs: [...evidenceRefs].slice(0, 20) })
  }
  if (snapshot.ledger.kind === 'available') {
    const below = context.thresholds.kind === 'fixed'
      ? BigInt(snapshot.ledger.availableUnits) < BigInt(context.thresholds.lowWaterUnits)
      : BigInt(snapshot.ledger.availableUnits) * 7n < BigInt(snapshot.ledger.payments7dUnits) * BigInt(context.thresholds.lowWaterDays)
    if (below || snapshot.ledger.availableUnits === '0') add('float_low', 'warning')
  }
  if (context.observation === null || context.observation.observedAt > snapshot.snapshotAt
    || snapshot.snapshotAt - context.observation.observedAt >= 10 * 60_000) add('observation_stale', 'warning')
  for (const [name, code] of [['cash', 'cash_difference'], ['settlements', 'settlement_difference'], ['funding', 'funding_difference'], ['reservations', 'reservation_difference']] as const) {
    const check = snapshot.checks[name]
    if (check.kind === 'mismatch') add(code, 'critical', check.evidenceRefs)
    else if (check.kind === 'attention') add(code, 'warning', check.evidenceRefs)
  }
  if (snapshot.inFlight.kind === 'available' && snapshot.inFlight.overdueCount > 0) add('reservation_overdue', 'warning', snapshot.inFlight.calls.map(row => row.callRef))
  if (Object.values(snapshot.checks).some(check => check.kind === 'unavailable')) add('reconciliation_unavailable', 'warning')
  if (snapshot.chain.kind !== 'available' || snapshot.snapshotAt - snapshot.chain.observedAt >= 20 * 60_000
    || snapshot.snapshotAt - snapshot.chain.blockTimestamp >= TREASURY_FINALIZED_BLOCK_MAX_AGE_MS) add('reconciliation_stale', 'warning')
  if (snapshot.spending.kind === 'available'
    && (BigInt(snapshot.spending.settledUnits) + BigInt(snapshot.spending.liabilityUnits)) * 100n >= BigInt(snapshot.spending.maximumUnits) * 80n) {
    add('daily_limit_80_percent', 'warning')
  }
  return alerts
}
