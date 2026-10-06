import { v, type Infer } from 'convex/values'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { QueryCtx } from '../../../_generated/server'

export const outstandingPlanExposureArgs = { accountRef: v.string(), organizationMonth: v.string() }
export const outstandingPlanExposureResult = v.union(
  v.object({ kind: v.literal('available'), units: v.string(), digest: v.string() }),
  v.object({ kind: v.literal('unavailable') }),
)
const MAX_EXPOSURE_PLANS = 1_000

/**
 * Requires an exact Account/month. Ensures only proven zero is zero.
 * Invariant: uncertain Holds retain exposure; missing/malformed/over-limit evidence refuses.
 * Admission calls this in its own transaction, never trusts an earlier Quote's Hold snapshot.
 */
export async function readOutstandingPlanExposureHandler(
  ctx: Pick<QueryCtx, 'db'>,
  args: { accountRef: string; organizationMonth: string },
): Promise<Infer<typeof outstandingPlanExposureResult>> {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(args.organizationMonth)) return { kind: 'unavailable' }
  const plans = await ctx.db.query('capabilityPlans')
    .withIndex('by_accountRef_and_organizationMonth', (q) => q.eq('accountRef', args.accountRef).eq('organizationMonth', args.organizationMonth))
    .take(MAX_EXPOSURE_PLANS + 1)
  if (plans.length > MAX_EXPOSURE_PLANS) return { kind: 'unavailable' }
  // A run without a month cannot disappear from the indexed sum.
  for (const state of ['running', 'reconciliation_required'] as const) {
    const active = await ctx.db.query('capabilityPlans')
      .withIndex('by_ownerId_and_state_and_createdAt', (q) => q.eq('ownerId', args.accountRef).eq('state', state))
      .take(MAX_EXPOSURE_PLANS + 1)
    if (active.length > MAX_EXPOSURE_PLANS || active.some((plan) => plan.organizationMonth === undefined)) return { kind: 'unavailable' }
  }
  let total = 0n
  for (const plan of plans) {
    const untouched = (plan.state === 'quoted' || plan.state === 'awaiting_approval')
      && plan.holdReservationAttempt === undefined && plan.holdReservationRefs === undefined
    if (untouched) continue
    const units = plan.organizationMonthlyExposureUnits
    if (units === undefined || !/^(?:0|[1-9]\d{0,30})$/u.test(units)
      || !/^(?:0|[1-9]\d{0,30})$/u.test(plan.approvedTotalAudUnits)
      || BigInt(units) > BigInt(plan.approvedTotalAudUnits)) return { kind: 'unavailable' }
    total += BigInt(units)
  }
  return { kind: 'available', units: total.toString(), digest: canonicalDigest(plans.map(plan => ({
    planRef: plan.planRef, exposure: plan.organizationMonthlyExposureUnits ?? null,
    concluded: plan.concludedNodeIds ?? [], releaseRefs: plan.holdReleaseRefs ?? [],
  })).sort((left, right) => left.planRef.localeCompare(right.planRef))) }
}
