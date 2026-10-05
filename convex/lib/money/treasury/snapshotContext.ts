import { v, type Infer } from 'convex/values'
import { treasuryIdentityValue, treasuryProgressValue, treasuryThresholdsValue, DEFAULT_TREASURY_THRESHOLDS } from '@/modules/money/treasury'
import { treasuryReferenceRateValue } from '@/modules/money/treasury-report'
import { x402SpendPolicyFromEnvironment } from '@/modules/money/x402-spend-admission'
import { env, type QueryCtx } from '../../../_generated/server'
import { readReferenceRate } from '../referenceRate/store'
import { configuredTreasuryIdentity, readTreasuryProgressAtCutoff } from './progress'

export const treasurySnapshotContextValue = v.union(
  v.object({ kind: v.literal('unavailable'), code: v.string() }),
  v.object({ kind: v.literal('available'), identity: treasuryIdentityValue, progress: treasuryProgressValue,
    thresholds: treasuryThresholdsValue, policyRevision: v.union(v.null(), v.string()), maximumUnits: v.union(v.null(), v.string()),
    observation: v.union(v.null(), v.object({ observedAt: v.number(), totalUnits: v.string(), evidenceRef: v.string() })),
    referenceRate: treasuryReferenceRateValue,
  }),
)
export type TreasurySnapshotContext = Infer<typeof treasurySnapshotContextValue>
const OBSERVATION_HISTORY_LIMIT = 25

/** One transactional read of current configuration and cutoff-bounded treasury evidence; no query clock. */
export async function readTreasurySnapshotContext(ctx: QueryCtx, args: { cutoffAt: number }): Promise<TreasurySnapshotContext> {
  const identity = configuredTreasuryIdentity()
  if (identity === undefined) return { kind: 'unavailable', code: 'treasury_configuration_unavailable' }
  const [progress, settings, observations, rate] = await Promise.all([
    readTreasuryProgressAtCutoff(ctx, args.cutoffAt),
    ctx.db.query('moneyTreasurySettings').withIndex('by_environment', q => q.eq('environment', identity.environment)).unique(),
    ctx.db.query('moneyTreasuryObservations').withIndex('by_custody_and_observedAt', q => q
      .eq('environment', identity.environment).eq('custodyRef', identity.custodyRef)
      .eq('custodyGeneration', identity.custodyGeneration).lte('observedAt', args.cutoffAt))
      .order('desc').take(OBSERVATION_HISTORY_LIMIT + 1),
    readReferenceRate(ctx.db, args.cutoffAt),
  ])
  // A receipt can start before the cutoff and be recorded afterwards. The index
  // orders equal observation times by native creation time; preserve that
  // fractional creation timestamp when selecting this historical view.
  const observation = observations.find(row => row._creationTime <= args.cutoffAt) ?? null
  if (observation === null && observations.length > OBSERVATION_HISTORY_LIMIT) {
    return { kind: 'unavailable', code: 'treasury_observation_history_incomplete' }
  }
  if (observation !== null && (!Number.isSafeInteger(observation.observedAt) || observation.observedAt < 0
    || !Number.isSafeInteger(observation.recordedAt)
    || observation.recordedAt < observation.observedAt || observation.recordedAt > args.cutoffAt)) {
    return { kind: 'unavailable', code: 'treasury_observation_cutoff_conflict' }
  }
  const policy = x402SpendPolicyFromEnvironment(env, { environment: identity.environment, network: identity.network, asset: identity.asset })
  return { kind: 'available', identity, progress, thresholds: settings?.thresholds ?? DEFAULT_TREASURY_THRESHOLDS,
    policyRevision: policy?.policyRevision ?? null, maximumUnits: policy?.platformDailyMaximumUnits ?? null,
    observation: observation === null ? null : { observedAt: observation.observedAt, totalUnits: observation.totalUnits, evidenceRef: observation.evidenceRef },
    referenceRate: rate === null ? { kind: 'unavailable', code: 'reference_rate_stale' }
      : { kind: 'available', observedAt: rate.fetchedAt, usdcToAudRate: rate.rate },
  }
}
