import { v } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'

// The scheduled function name Convex records for `internal.workloadCron.reconcileBusinessSupplyProjections`
// (module:exportName), i.e. the hourly "reconcile business supply projections" cron.
const RECONCILE_BUSINESS_SUPPLY_PROJECTIONS_JOB_NAME = 'workloadCron:reconcileBusinessSupplyProjections'
// Newest-first, bounded: same pattern as `scheduledFunctionRetirement.cancelByName` -
// the cron self-reschedules, so its live/next-pending row sits at the head of
// `_scheduled_functions` with the most recently completed run just behind it.
const SCHEDULED_FUNCTION_FRESHNESS_SCAN_LIMIT = 500

/**
 * Freshness signal for `market-tools/list` and `market-tools/search` (review
 * issue 4A / C16): those routes read `registrySearchDocuments`, which this
 * file's rebuild keeps current via the hourly workload cron. Returns the most
 * recent `completedTime` Convex recorded for that cron, or `null` if it has
 * never completed.
 */
export const latestReconcileBusinessSupplyProjectionsCompletionArgs = v.object({})
export const latestReconcileBusinessSupplyProjectionsCompletionResult = v.union(v.number(), v.null())
export async function latestReconcileBusinessSupplyProjectionsCompletionHandler(ctx: QueryCtx): Promise<number | null> {
    const jobs = await ctx.db.system
      .query('_scheduled_functions')
      .order('desc')
      .take(SCHEDULED_FUNCTION_FRESHNESS_SCAN_LIMIT)
    for (const job of jobs) {
      if (job.name !== RECONCILE_BUSINESS_SUPPLY_PROJECTIONS_JOB_NAME) continue
      if (job.completedTime !== undefined) return job.completedTime
    }
    return null
}
