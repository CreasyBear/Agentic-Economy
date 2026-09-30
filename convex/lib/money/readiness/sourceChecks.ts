import { v, type Infer } from 'convex/values'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { paymentReadinessCheckValue, type PaymentReadinessCheck } from '@/modules/money/payment-readiness'
import { REFERENCE_RATE_MAX_AGE_MS } from '@/modules/money/public'
import { TREASURY_SNAPSHOT_MAX_AGE_MS } from '@/modules/money/treasury-report'
import { env, type QueryCtx } from '../../../_generated/server'
import { readCommercialPolicyGate } from '../../adminConsole/actions/commercialPolicy'
import { readReferenceRate } from '../referenceRate/store'
import { readLatestTreasurySnapshot, treasuryResumeRefusal } from '../treasury/health'
import { configuredTreasuryIdentity } from '../treasury/progress'

export const paymentReadinessSourceChecksValue = v.object({
  reference_rate: paymentReadinessCheckValue,
  commercial_policy: paymentReadinessCheckValue,
  treasury: paymentReadinessCheckValue,
})
export type PaymentReadinessSourceChecks = Infer<typeof paymentReadinessSourceChecksValue>

/** Current source facts in one read transaction; a snapshot cannot extend their original expiry. */
export async function readPaymentReadinessSourceChecks(
  ctx: QueryCtx,
  args: { environment: 'sandbox' | 'production'; now: number },
): Promise<PaymentReadinessSourceChecks> {
  if (deploymentPaymentEnvironment(env) !== args.environment
    || !Number.isSafeInteger(args.now) || args.now < 0 || args.now > Date.now()) {
    const failed = failure('readiness_environment_mismatch')
    return { reference_rate: failed, commercial_policy: failed, treasury: failed }
  }
  const [rate, policy, treasury] = await Promise.all([
    readReferenceRate(ctx.db, args.now),
    readCommercialPolicyGate(ctx.db, { ...args,
      ...(args.environment === 'sandbox' ? { sandboxFixture: 'managed_x402_deterministic_v1' as const } : {}) }),
    readTreasuryCheck(ctx, args.environment, args.now),
  ])
  let commercial: PaymentReadinessCheck = policy.kind === 'refused'
    ? failure(policy.code) : { kind: 'passed', validUntil: args.now + 10 * 60_000 }
  if (policy.kind === 'admitted' && args.environment === 'production') {
    const approvals = await Promise.all(policy.policyRefs.map(policyRef => ctx.db.query('moneyCommercialPolicies')
      .withIndex('by_policyRef', q => q.eq('policyRef', policyRef)).unique()))
    commercial = approvals.length === 0 || approvals.some(row => row === null)
      ? failure('commercial_policy_missing')
      : { kind: 'passed', validUntil: Math.min(...approvals.flatMap(row => row === null ? [] : [row.expiresAt])) }
  }
  return {
    reference_rate: rate === null ? failure('reference_rate_stale')
      : { kind: 'passed', validUntil: rate.fetchedAt + REFERENCE_RATE_MAX_AGE_MS },
    commercial_policy: commercial,
    treasury,
  }
}

async function readTreasuryCheck(ctx: QueryCtx, environment: 'sandbox' | 'production', now: number): Promise<PaymentReadinessCheck> {
  const refusal = await treasuryResumeRefusal(ctx, environment, now)
  if (refusal !== undefined) return failure(refusal)
  const identity = configuredTreasuryIdentity()
  if (identity === undefined) return failure('treasury_configuration_unavailable')
  const [snapshot, observation] = await Promise.all([
    readLatestTreasurySnapshot(ctx, identity),
    ctx.db.query('moneyTreasuryObservations').withIndex('by_custody_and_observedAt', q => q
      .eq('environment', environment).eq('custodyRef', identity.custodyRef).eq('custodyGeneration', identity.custodyGeneration))
      .order('desc').first(),
  ])
  if (snapshot === null || snapshot.chain.kind !== 'available' || observation === null) {
    return failure('treasury_reconciliation_required')
  }
  return { kind: 'passed', validUntil: Math.min(
    snapshot.snapshotAt + TREASURY_SNAPSHOT_MAX_AGE_MS,
    snapshot.chain.observedAt + TREASURY_SNAPSHOT_MAX_AGE_MS,
    snapshot.chain.blockTimestamp + TREASURY_SNAPSHOT_MAX_AGE_MS,
    observation.observedAt + 10 * 60_000,
  ) }
}

function failure(code: string): PaymentReadinessCheck { return { kind: 'failed', code } }
