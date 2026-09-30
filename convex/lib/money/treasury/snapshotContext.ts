import { v, type Infer } from 'convex/values'
import { treasuryIdentityValue, treasuryProgressValue, treasuryThresholdsValue, DEFAULT_TREASURY_THRESHOLDS } from '@/modules/money/treasury'
import { treasuryReferenceRateValue } from '@/modules/money/treasury-report'
import { x402SpendPolicyFromEnvironment } from '@/modules/money/x402-spend-admission'
import { env, type QueryCtx } from '../../../_generated/server'
import { readReferenceRate } from '../referenceRate/store'
import { configuredTreasuryIdentity, readTreasuryProgress } from './progress'

export const treasurySnapshotContextValue = v.union(
  v.object({ kind: v.literal('unavailable'), code: v.string() }),
  v.object({ kind: v.literal('available'), identity: treasuryIdentityValue, progress: treasuryProgressValue,
    thresholds: treasuryThresholdsValue, policyRevision: v.union(v.null(), v.string()), maximumUnits: v.union(v.null(), v.string()),
    observation: v.union(v.null(), v.object({ observedAt: v.number(), totalUnits: v.string(), evidenceRef: v.string() })),
    referenceRate: treasuryReferenceRateValue,
  }),
)
export type TreasurySnapshotContext = Infer<typeof treasurySnapshotContextValue>

/** One transactional read of current configuration and cutoff-bounded display evidence; no query clock. */
export async function readTreasurySnapshotContext(ctx: QueryCtx, args: { cutoffAt: number }): Promise<TreasurySnapshotContext> {
  const identity = configuredTreasuryIdentity()
  if (identity === undefined) return { kind: 'unavailable', code: 'treasury_configuration_unavailable' }
  const [progress, settings, observation, rate] = await Promise.all([
    readTreasuryProgress(ctx),
    ctx.db.query('moneyTreasurySettings').withIndex('by_environment', q => q.eq('environment', identity.environment)).unique(),
    ctx.db.query('moneyTreasuryObservations').withIndex('by_custody_and_observedAt', q => q
      .eq('environment', identity.environment).eq('custodyRef', identity.custodyRef)
      .eq('custodyGeneration', identity.custodyGeneration).lte('observedAt', args.cutoffAt)).order('desc').first(),
    readReferenceRate(ctx.db, args.cutoffAt),
  ])
  const policy = x402SpendPolicyFromEnvironment(env, { environment: identity.environment, network: identity.network, asset: identity.asset })
  return { kind: 'available', identity, progress, thresholds: settings?.thresholds ?? DEFAULT_TREASURY_THRESHOLDS,
    policyRevision: policy?.policyRevision ?? null, maximumUnits: policy?.platformDailyMaximumUnits ?? null,
    observation: observation === null ? null : { observedAt: observation.observedAt, totalUnits: observation.totalUnits, evidenceRef: observation.evidenceRef },
    referenceRate: rate === null ? { kind: 'unavailable', code: 'reference_rate_stale' }
      : { kind: 'available', observedAt: rate.fetchedAt, usdcToAudRate: rate.rate },
  }
}
