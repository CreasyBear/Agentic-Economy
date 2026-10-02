"use node"

import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { bindWorkloadCronActionContext } from './lib/platform/workloadCron/consequence'
import { parseWorkloadCronSnapshot, workloadCronSnapshotValue } from './lib/platform/workloadCron/context'
import { reconcileTreasurySnapshot, type TreasurySnapshotResult } from './lib/money/treasury/snapshot'

const NAME = 'reconcile treasury balances' as const
export const reconcile = internalAction({
  args: { workload: workloadCronSnapshotValue },
  returns: v.union(v.object({ kind: v.literal('published'), replayed: v.boolean(), newAlertRefs: v.array(v.string()) }),
    v.object({ kind: v.literal('unavailable'), code: v.string() })),
  handler: async (ctx, args): Promise<TreasurySnapshotResult> => {
    const workload = await ctx.runQuery(internal.workloadCron.reconcile, { name: NAME, snapshot: parseWorkloadCronSnapshot(args.workload) })
    const bound = bindWorkloadCronActionContext(ctx, { name: NAME, snapshot: workload })
    return await reconcileTreasurySnapshot(bound, {
      admit: async () => {
        await ctx.runQuery(internal.workloadCron.reconcile, { name: NAME, snapshot: workload })
        return true
      },
    })
  },
})
