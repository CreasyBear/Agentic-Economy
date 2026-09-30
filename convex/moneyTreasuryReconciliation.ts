import { v } from 'convex/values'
import { internalMutation, internalQuery } from './_generated/server'
import { treasuryChainCheckpointValue, treasuryChainObservationValue, treasuryProgressValue } from '@/modules/money/treasury'
import { beginTreasuryBatch, finishTreasuryBatch, readTreasuryProgress } from './lib/money/treasury/progress'

export const readProgress = internalQuery({ args: {}, returns: treasuryProgressValue, handler: readTreasuryProgress })
export const beginBatch = internalMutation({
  args: { previousCheckpoint: v.union(v.null(), treasuryChainCheckpointValue), observation: treasuryChainObservationValue },
  returns: treasuryProgressValue, handler: beginTreasuryBatch,
})
export const finishBatch = internalMutation({
  args: { batchRef: v.string(), transactionRefs: v.array(v.string()) },
  returns: v.union(v.object({ kind: v.literal('completed'), replayed: v.boolean() }),
    v.object({ kind: v.literal('unavailable'), code: v.string() })),
  handler: finishTreasuryBatch,
})
