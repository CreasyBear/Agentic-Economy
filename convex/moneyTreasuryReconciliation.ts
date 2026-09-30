import {
  auditSourcePageArgs, treasuryBatchSourcesReturns, treasuryAttemptSourcesReturns, treasuryFundingSourcesReturns, treasuryCallSourcesReturns,
  treasurySpendReservationSourcesArgs, treasurySpendReservationSourcesReturns, treasurySpendExposureArgs, treasurySpendExposureReturns,
  readTreasuryBatchSources, readTreasuryAttemptSources, readTreasuryFundingSources, readTreasuryCallSources, readTreasurySpendReservationSources, readTreasurySpendExposure,
} from './lib/money/treasury/auditSources'
import { treasurySnapshotContextValue, readTreasurySnapshotContext } from './lib/money/treasury/snapshotContext'
import { publishTreasurySnapshot, publishTreasurySnapshotResult } from './lib/money/treasury/snapshotStore'
import { treasurySnapshotValue } from '@/modules/money/treasury-report'
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

export const readBatchSources = internalQuery({ args: auditSourcePageArgs, returns: treasuryBatchSourcesReturns, handler: readTreasuryBatchSources })
export const readAttemptSources = internalQuery({ args: auditSourcePageArgs, returns: treasuryAttemptSourcesReturns, handler: readTreasuryAttemptSources })
export const readFundingSources = internalQuery({ args: auditSourcePageArgs, returns: treasuryFundingSourcesReturns, handler: readTreasuryFundingSources })
export const readCallSources = internalQuery({ args: auditSourcePageArgs, returns: treasuryCallSourcesReturns, handler: readTreasuryCallSources })
export const readSpendReservationSources = internalQuery({ args: treasurySpendReservationSourcesArgs, returns: treasurySpendReservationSourcesReturns, handler: readTreasurySpendReservationSources })
export const readSpendExposure = internalQuery({ args: treasurySpendExposureArgs, returns: treasurySpendExposureReturns, handler: readTreasurySpendExposure })
export const readSnapshotContext = internalQuery({ args: { cutoffAt: v.number() }, returns: treasurySnapshotContextValue, handler: readTreasurySnapshotContext })
export const publishSnapshot = internalMutation({ args: { snapshot: treasurySnapshotValue }, returns: publishTreasurySnapshotResult, handler: publishTreasurySnapshot })
