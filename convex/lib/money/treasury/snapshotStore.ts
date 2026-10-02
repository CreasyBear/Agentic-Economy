import { v } from 'convex/values'
import { captureBackendException } from '@/lib/observability/degrade-backend'
import type { MutationCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { sealTreasurySnapshot, type TreasuryAlertCode, type TreasurySnapshot } from '@/modules/money/treasury-report'
import { configuredTreasuryIdentity } from './progress'
import { DEFAULT_TREASURY_THRESHOLDS, TREASURY_DRIFT_TOLERANCE_UNITS } from '@/modules/money/treasury'
import { readLatestTreasurySnapshot } from './health'

export const publishTreasurySnapshotResult = v.union(
  v.object({ kind: v.literal('published'), replayed: v.boolean(), newAlertRefs: v.array(v.string()) }),
  v.object({ kind: v.literal('unavailable'), code: v.string() }),
)
const ALL_ALERTS: readonly TreasuryAlertCode[] = [
  'float_low', 'observation_stale', 'cash_difference', 'settlement_difference', 'funding_difference',
  'reservation_overdue', 'reservation_difference', 'reconciliation_unavailable', 'reconciliation_stale', 'daily_limit_80_percent',
]

/**
 * Requires the current custody identity and a bounded sealed server snapshot.
 * Ensures monotonic publication and one durable alert episode per active condition.
 * Invariant: a late worker cannot replace newer evidence; unavailable evidence cannot resolve an earlier mismatch.
 * On violation: refuse with no writes. Exact concurrent retries replay the saved snapshot and alert identities.
 */
export async function publishTreasurySnapshot(ctx: MutationCtx, args: { snapshot: TreasurySnapshot }) {
  const snapshot = args.snapshot
  const now = Date.now()
  const identity = configuredTreasuryIdentity()
  const { snapshotRef, evidenceDigest, ...material } = snapshot
  if (identity === undefined || snapshot.custodyIdentityDigest !== canonicalDigest(identity)
    || snapshot.environment !== identity.environment || snapshot.custodyRef !== identity.custodyRef
    || snapshot.custodyGeneration !== identity.custodyGeneration
    || !Number.isSafeInteger(snapshot.snapshotAt) || snapshot.snapshotAt < 0 || snapshot.snapshotAt > now
    || snapshotRef !== sealTreasurySnapshot(material).snapshotRef || evidenceDigest !== sealTreasurySnapshot(material).evidenceDigest
    || !validSnapshotMetrics(snapshot)
    || snapshot.deposits.length > 20
    || snapshot.alerts.length > ALL_ALERTS.length || new Set(snapshot.alerts.map(alert => alert.code)).size !== snapshot.alerts.length
    || snapshot.alerts.some(alert => alert.evidenceRefs.length > 20)
    || (snapshot.inFlight.kind === 'available' && snapshot.inFlight.calls.length > 20)) {
    return { kind: 'unavailable' as const, code: 'treasury_snapshot_invalid' }
  }
  const existing = await ctx.db.query('moneyTreasurySnapshots').withIndex('by_snapshotRef', q => q.eq('snapshotRef', snapshotRef)).unique()
  if (existing !== null) return { kind: 'published' as const, replayed: true, newAlertRefs: [] }
  const latest = await readLatestTreasurySnapshot(ctx, identity)
  if (latest !== null && latest.snapshotAt >= snapshot.snapshotAt) return { kind: 'unavailable' as const, code: 'treasury_snapshot_superseded' }
  await ctx.db.insert('moneyTreasurySnapshots', snapshot)
  const observation = await ctx.db.query('moneyTreasuryObservations').withIndex('by_custody_and_observedAt', q => q
    .eq('environment', identity.environment).eq('custodyRef', identity.custodyRef).eq('custodyGeneration', identity.custodyGeneration)).order('desc').first()
  const observationFresh = observation !== null && observation.observedAt <= now && now - observation.observedAt < 10 * 60_000
  const settings = await ctx.db.query('moneyTreasurySettings').withIndex('by_environment', q => q.eq('environment', identity.environment)).unique()
  const thresholds = settings?.thresholds ?? DEFAULT_TREASURY_THRESHOLDS
  const floatProvenClear = snapshot.ledger.kind === 'available' && now - snapshot.snapshotAt < 20 * 60_000
    && BigInt(snapshot.ledger.availableUnits) > 0n && (thresholds.kind === 'fixed'
      ? BigInt(snapshot.ledger.availableUnits) >= BigInt(thresholds.lowWaterUnits)
      : BigInt(snapshot.ledger.availableUnits) * 7n >= BigInt(snapshot.ledger.payments7dUnits) * BigInt(thresholds.lowWaterDays))
  const newAlertRefs: string[] = []
  for (const code of ALL_ALERTS) {
    const previous = await ctx.db.query('moneyTreasuryAlerts').withIndex('by_scope_and_code', q => q
      .eq('environment', identity.environment).eq('custodyIdentityDigest', snapshot.custodyIdentityDigest).eq('code', code))
      .order('desc').first()
    const condition = snapshot.alerts.find(alert => alert.code === code)
    if (condition === undefined) {
      if (previous?.state === 'open' && conditionProvenClear(snapshot, code, observationFresh, floatProvenClear)) {
        await ctx.db.patch(previous._id, { state: 'resolved', resolvedAt: snapshot.snapshotAt, lastSeenAt: snapshot.snapshotAt, snapshotRef })
      }
      continue
    }
    if (previous?.state === 'open') {
      const retainCritical = previous.severity === 'critical' && condition.severity !== 'critical'
        && !conditionProvenClear(snapshot, code, observationFresh, floatProvenClear)
      await ctx.db.patch(previous._id, { severity: retainCritical ? 'critical' : condition.severity, lastSeenAt: snapshot.snapshotAt, snapshotRef,
        evidenceRefs: retainCritical ? [...new Set([...previous.evidenceRefs, ...condition.evidenceRefs])].slice(0, 20) : condition.evidenceRefs })
      if (previous.severity !== 'critical' && condition.severity === 'critical') reportAlert(previous.alertRef, snapshot, condition)
      continue
    }
    const alertRef = `treasury-alert:${canonicalDigest({ snapshotRef, code }).slice(7)}`
    await ctx.db.insert('moneyTreasuryAlerts', { alertRef, environment: identity.environment,
      custodyIdentityDigest: snapshot.custodyIdentityDigest, code, severity: condition.severity,
      state: 'open', firstSeenAt: snapshot.snapshotAt, lastSeenAt: snapshot.snapshotAt,
      snapshotRef, evidenceRefs: condition.evidenceRefs })
    newAlertRefs.push(alertRef)
    reportAlert(alertRef, snapshot, condition)
  }
  return { kind: 'published' as const, replayed: false, newAlertRefs }
}

function conditionProvenClear(snapshot: TreasurySnapshot, code: TreasuryAlertCode, observationFresh: boolean, floatProvenClear: boolean): boolean {
  switch (code) {
    case 'cash_difference': return snapshot.checks.cash.kind === 'matched'
    case 'settlement_difference': return snapshot.checks.settlements.kind === 'matched'
    case 'funding_difference': return snapshot.checks.funding.kind === 'matched'
    case 'reservation_difference':
    case 'reservation_overdue': return snapshot.checks.reservations.kind === 'matched'
    case 'float_low': return floatProvenClear
    case 'observation_stale': return observationFresh
    case 'daily_limit_80_percent': return snapshot.spending.kind === 'available'
    case 'reconciliation_unavailable':
    case 'reconciliation_stale': return Object.values(snapshot.checks).every(check => check.kind === 'matched')
  }
}


function validSnapshotMetrics(snapshot: TreasurySnapshot): boolean {
  const unsigned = (value: string) => /^(?:0|[1-9]\d{0,77})$/u.test(value)
  const signed = (value: string) => /^(?:0|-?[1-9]\d{0,77})$/u.test(value)
  const count = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 100_000
  const clock = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= snapshot.snapshotAt
  if (snapshot.historyStartedAt !== null && !clock(snapshot.historyStartedAt)) return false
  if ([snapshot.rawCashDifferenceUnits, snapshot.cashTimingAdjustmentUnits].some(value => value !== null && !signed(value))) return false
  for (const [name, check] of Object.entries(snapshot.checks)) {
    if (check.kind === 'unavailable') continue
    if (check.kind === 'attention') {
      if (!count(check.pendingCount) || (check.pendingUnits !== null && !unsigned(check.pendingUnits)) || check.evidenceRefs.length > 20) return false
    } else {
      if (!count(check.checkedCount) || !signed(check.expectedUnits) || !signed(check.observedUnits) || !signed(check.differenceUnits)
        || BigInt(check.observedUnits) - BigInt(check.expectedUnits) !== BigInt(check.differenceUnits)) return false
      if (check.kind === 'matched' && (name === 'cash' ? absolute(BigInt(check.differenceUnits)) > BigInt(TREASURY_DRIFT_TOLERANCE_UNITS) : check.differenceUnits !== '0')) return false
      if (check.kind === 'mismatch' && check.evidenceRefs.length > 20) return false
    }
  }
  if (snapshot.ledger.kind === 'available' && (snapshot.ledger.observedAt !== snapshot.snapshotAt
    || ![snapshot.ledger.availableUnits, snapshot.ledger.committedUnits, snapshot.ledger.bufferUnits,
      snapshot.ledger.payments24hUnits, snapshot.ledger.payments7dUnits, snapshot.ledger.purchasedAvailableAudUnits,
      snapshot.ledger.purchasedReservedAudUnits, snapshot.ledger.promotionalAvailableAudUnits, snapshot.ledger.promotionalReservedAudUnits].every(unsigned)
    || BigInt(snapshot.ledger.payments24hUnits) > BigInt(snapshot.ledger.payments7dUnits))) return false
  if (snapshot.chain.kind === 'available' && (!clock(snapshot.chain.observedAt) || !clock(snapshot.chain.blockTimestamp)
    || !unsigned(snapshot.chain.blockNumber) || !unsigned(snapshot.chain.totalUnits) || !/^0x[a-fA-F0-9]{64}$/u.test(snapshot.chain.blockHash))) return false
  if (snapshot.referenceRate.kind === 'available' && (!clock(snapshot.referenceRate.observedAt)
    || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(snapshot.referenceRate.usdcToAudRate)
    || Number(snapshot.referenceRate.usdcToAudRate) <= 0 || !Number.isFinite(Number(snapshot.referenceRate.usdcToAudRate)))) return false
  if (snapshot.spending.kind === 'available' && (snapshot.spending.observedAt !== snapshot.snapshotAt || !clock(snapshot.spending.windowStartsAt)
    || ![snapshot.spending.settledUnits, snapshot.spending.liabilityUnits, snapshot.spending.maximumUnits].every(unsigned)
    || snapshot.spending.maximumUnits === '0')) return false
  if (snapshot.inFlight.kind === 'available' && (snapshot.inFlight.observedAt !== snapshot.snapshotAt
    || !count(snapshot.inFlight.count) || !count(snapshot.inFlight.overdueCount) || !unsigned(snapshot.inFlight.amountUnits)
    || !unsigned(snapshot.inFlight.overdueUnits) || (snapshot.inFlight.oldestAt !== null && !clock(snapshot.inFlight.oldestAt))
    || snapshot.inFlight.calls.length > snapshot.inFlight.count
    || (snapshot.inFlight.listedCallsComplete && snapshot.inFlight.calls.length !== snapshot.inFlight.count)
    || snapshot.inFlight.calls.some(call => !clock(call.createdAt) || !unsigned(call.amountUnits)))) return false
  return snapshot.deposits.every(deposit => clock(deposit.bookedAt) && unsigned(deposit.amountUnits)
    && (deposit.chainTransactionHash === null || /^0x[a-fA-F0-9]{64}$/u.test(deposit.chainTransactionHash)))
}
function absolute(value: bigint) { return value < 0n ? -value : value }

// Durable alert identity lets the existing Convex log-stream receiver deduplicate
// transaction retries. Emit only new episodes and warning-to-critical escalation.
function reportAlert(alertRef: string, snapshot: TreasurySnapshot, alert: TreasurySnapshot['alerts'][number]) {
  captureBackendException('Treasury condition requires review', { operation: 'treasury.reconciliation.alert',
    alertRef, code: alert.code, environment: snapshot.environment, snapshotRef: snapshot.snapshotRef },
  alert.severity === 'critical' ? 'error' : 'warning')
}
