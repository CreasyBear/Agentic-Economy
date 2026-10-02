"use node"

import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { bindWorkloadCronActionContext } from './lib/platform/workloadCron/consequence'
import { parseWorkloadCronSnapshot, workloadCronSnapshotValue } from './lib/platform/workloadCron/context'
import { refreshPaymentReadiness } from './lib/money/readiness/refresh'

const NAME = 'refresh payment readiness' as const
export const refresh = internalAction({
  args: { workload: workloadCronSnapshotValue },
  returns: v.union(v.object({ kind: v.literal('published'), replayed: v.boolean() }),
    v.object({ kind: v.literal('refused'), code: v.string() })),
  handler: async (ctx, args): Promise<{ kind: 'published'; replayed: boolean } | { kind: 'refused'; code: string }> => {
    const workload = await ctx.runQuery(internal.workloadCron.reconcile, {
      name: NAME, snapshot: parseWorkloadCronSnapshot(args.workload),
    })
    // The bound publication rechecks workload authority transactionally after I/O.
    return await refreshPaymentReadiness(bindWorkloadCronActionContext(ctx, { name: NAME, snapshot: workload }))
  },
})
