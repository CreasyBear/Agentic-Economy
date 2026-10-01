"use node"

import { v } from 'convex/values'
import { action } from '../../convex/_generated/server'
import { internal } from '../../convex/_generated/api'
import { treasuryChainCheckpointValue, treasuryChainObservationValue } from '@/modules/money/treasury'
import { bindWorkloadCronActionContext } from '../../convex/lib/platform/workloadCron/consequence'
import { reconcileTreasuryDeposits } from '../../convex/lib/money/treasury/deposits'

// Temporary disposable-deployment fixture only. Requires the real workload identity
// and original batch. Native writes/readback and cursor transitions remain maintained
// application code. Only chain evidence is synthetic; no CDP/RPC call is made.
const name = 'observe x402 treasury' as const

export const initialize = action({
  args: {}, returns: v.null(),
  handler: async (ctx): Promise<null> => {
    await ctx.runMutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    return null
  },
})

export const read = action({
  args: {}, returns: v.string(),
  handler: async (ctx): Promise<string> => JSON.stringify(await ctx.runQuery(internal.moneyTreasuryReconciliation.readProgress, {})),
})

export const begin = action({
  args: { previousCheckpoint: v.union(v.null(), treasuryChainCheckpointValue), observation: treasuryChainObservationValue },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const admitted = await ctx.runQuery(internal.workloadCron.admit, { name })
    const snapshot = await ctx.runQuery(internal.workloadCron.reconcile, { name, snapshot: admitted })
    const bound = bindWorkloadCronActionContext(ctx, { name, snapshot })
    return JSON.stringify(await bound.runMutation(internal.moneyTreasuryReconciliation.beginBatch, args))
  },
})

export const reconcile = action({
  args: { observation: v.optional(treasuryChainObservationValue) }, returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const admitted = await ctx.runQuery(internal.workloadCron.admit, { name })
    const snapshot = await ctx.runQuery(internal.workloadCron.reconcile, { name, snapshot: admitted })
    const bound = bindWorkloadCronActionContext(ctx, { name, snapshot })
    let chainReads = 0
    const result = await reconcileTreasuryDeposits(bound, {
      chainRead: async () => {
        chainReads += 1
        if (args.observation === undefined) throw new Error('treasury_restore_pending_must_not_read_chain')
        return args.observation
      },
      admit: async () => {
        await ctx.runQuery(internal.workloadCron.reconcile, { name, snapshot })
        return true
      },
    })
    return JSON.stringify({ result, chainReads })
  },
})
