import type { PaymentReadinessCheck } from '@/modules/money/payment-readiness'
import { cdpX402CustodyConfigurationFromEnvironment } from '@/modules/capability-supply/convex'
import { env, type QueryCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { TREASURY_SNAPSHOT_MAX_AGE_MS, type TreasurySnapshot, type TreasuryResumeRefusalCode } from '@/modules/money/treasury-report'
import type { TreasuryIdentity } from '@/modules/money/treasury'
import { configuredTreasuryIdentity } from './progress'
import { readTreasurySpendExposure } from './auditSources'
import { x402SpendPolicyFromEnvironment } from '@/modules/money/x402-spend-admission'

export async function readLatestTreasurySnapshot(ctx: Pick<QueryCtx, 'db'>, identity: TreasuryIdentity): Promise<TreasurySnapshot | null> {
  const row = await ctx.db.query('moneyTreasurySnapshots')
    .withIndex('by_environment_and_snapshotAt', q => q.eq('environment', identity.environment)).order('desc').first()
  if (row === null || row.custodyIdentityDigest !== canonicalDigest(identity)) return null
  const { _id, _creationTime, ...snapshot } = row
  void _id; void _creationTime
  return snapshot
}

/** Resume admits new exposure only after fresh complete checks for the current wallet. */
export async function treasuryResumeRefusal(ctx: Pick<QueryCtx, 'db'>, environment: 'sandbox' | 'production', now: number): Promise<TreasuryResumeRefusalCode | undefined> {
  // Observation/reconciliation may continue while signing is explicitly disabled.
  if (cdpX402CustodyConfigurationFromEnvironment(env) === undefined) return 'treasury_configuration_unavailable'
  const identity = configuredTreasuryIdentity()
  if (identity === undefined || identity.environment !== environment) return 'treasury_configuration_unavailable'
  const [snapshot, observation, exposure] = await Promise.all([
    readLatestTreasurySnapshot(ctx, identity),
    ctx.db.query('moneyTreasuryObservations').withIndex('by_custody_and_observedAt', q => q
      .eq('environment', environment).eq('custodyRef', identity.custodyRef).eq('custodyGeneration', identity.custodyGeneration))
      .order('desc').first(),
    readTreasurySpendExposure(ctx, { cutoffAt: now }),
  ])
  if (observation === null || !Number.isSafeInteger(observation.observedAt) || observation.observedAt < 0
    || observation.observedAt > now || now - observation.observedAt >= 10 * 60_000) return 'treasury_observation_stale'
  // Restored or damaged source rows must refuse before arithmetic, without
  // falling back to an older observation that could conceal the current fact.
  if (!/^(?:0|[1-9]\d{0,15})$/u.test(observation.totalUnits)) return 'treasury_capacity_unavailable'
  if (snapshot === null || snapshot.snapshotAt > now || now - snapshot.snapshotAt >= TREASURY_SNAPSHOT_MAX_AGE_MS) return 'treasury_reconciliation_stale'
  if (Object.values(snapshot.checks).some(check => check.kind !== 'matched')
    || snapshot.ledger.kind !== 'available' || snapshot.chain.kind !== 'available' || !snapshot.chain.caughtUp
    || snapshot.spending.kind !== 'available') return 'treasury_reconciliation_required'
  const policy = x402SpendPolicyFromEnvironment(env, { environment, network: identity.network, asset: identity.asset })
  if (policy === undefined || exposure.kind !== 'available' || snapshot.chain.observedAt > now
    || now - snapshot.chain.observedAt >= TREASURY_SNAPSHOT_MAX_AGE_MS
    || now - snapshot.chain.blockTimestamp >= TREASURY_SNAPSHOT_MAX_AGE_MS) return 'treasury_reconciliation_required'
  if (BigInt(snapshot.ledger.availableUnits) <= 0n
    || BigInt(observation.totalUnits) <= BigInt(identity.bufferTargetUnits)
    || BigInt(exposure.totalExposureUnits) >= BigInt(policy.platformDailyMaximumUnits)) {
    return 'treasury_capacity_unavailable'
  }
  return undefined
}

/** Shared current source verdict and original source expiry for probes and admission. */
export async function readTreasuryPaymentReadinessCheck(
  ctx: Pick<QueryCtx, 'db'>, environment: 'sandbox' | 'production', now: number,
): Promise<PaymentReadinessCheck> {
  const refusal = await treasuryResumeRefusal(ctx, environment, now)
  if (refusal !== undefined) return { kind: 'failed', code: refusal }
  const identity = configuredTreasuryIdentity()
  if (identity === undefined) return { kind: 'failed', code: 'treasury_configuration_unavailable' }
  const [snapshot, observation] = await Promise.all([
    readLatestTreasurySnapshot(ctx, identity),
    ctx.db.query('moneyTreasuryObservations').withIndex('by_custody_and_observedAt', q => q
      .eq('environment', environment).eq('custodyRef', identity.custodyRef).eq('custodyGeneration', identity.custodyGeneration))
      .order('desc').first(),
  ])
  if (snapshot === null || snapshot.chain.kind !== 'available' || observation === null) {
    return { kind: 'failed', code: 'treasury_reconciliation_required' }
  }
  return { kind: 'passed', validUntil: Math.min(
    snapshot.snapshotAt + TREASURY_SNAPSHOT_MAX_AGE_MS,
    snapshot.chain.observedAt + TREASURY_SNAPSHOT_MAX_AGE_MS,
    snapshot.chain.blockTimestamp + TREASURY_SNAPSHOT_MAX_AGE_MS,
    observation.observedAt + 10 * 60_000,
  ) }
}
