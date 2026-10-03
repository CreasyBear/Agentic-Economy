import { v, type Infer } from 'convex/values'

export const treasuryEnvironmentValue = v.union(v.literal('sandbox'), v.literal('production'))
export const paymentsAudienceValue = v.union(v.literal('admins'), v.literal('everyone'))
export const treasuryThresholdsValue = v.union(
  v.object({ kind: v.literal('runway'), lowWaterDays: v.literal(3), targetDays: v.literal(14) }),
  v.object({ kind: v.literal('fixed'), lowWaterUnits: v.string(), targetFloatUnits: v.string() }),
)
export type TreasuryThresholds = Infer<typeof treasuryThresholdsValue>
export const DEFAULT_TREASURY_THRESHOLDS: TreasuryThresholds = {
  kind: 'runway', lowWaterDays: 3, targetDays: 14,
}
export const TREASURY_DRIFT_TOLERANCE_UNITS = '10000'
export const TREASURY_RECONCILIATION_INTERVAL_MS = 15 * 60_000
export const TREASURY_RESERVATION_AGE_LIMIT_MS = 30 * 60_000
/**
 * Finalized Base blocks inherit Ethereum finality and can predate a fresh RPC
 * read by tens of minutes. Preserve the chain reader's one-hour ceiling across
 * audit and readiness; source observations and snapshots expire independently.
 * An expired finalized block cannot become fresh through a later report.
 */
export const TREASURY_FINALIZED_BLOCK_MAX_AGE_MS = 60 * 60_000

export const treasuryChainCheckpointValue = v.object({
  blockNumber: v.string(), blockHash: v.string(), balanceUnits: v.string(),
})
export type TreasuryChainCheckpoint = Infer<typeof treasuryChainCheckpointValue>
export const treasuryTransferValue = v.object({
  transactionHash: v.string(), logIndex: v.number(), blockNumber: v.string(), blockHash: v.string(),
  payer: v.string(), recipient: v.string(), amountUnits: v.string(), evidenceDigest: v.string(),
})
export type TreasuryTransfer = Infer<typeof treasuryTransferValue>
export const treasuryChainObservationValue = v.object({
  kind: v.literal('observed'), environment: treasuryEnvironmentValue, network: v.string(), asset: v.string(),
  address: v.string(), fromBlock: v.string(), checkpoint: treasuryChainCheckpointValue,
  blockTimestamp: v.number(), transfers: v.array(treasuryTransferValue), caughtUp: v.boolean(), observedAt: v.number(),
})
export type TreasuryChainObservation = Infer<typeof treasuryChainObservationValue>
export const treasuryCursorStateValue = v.union(
  v.object({ kind: v.literal('opening'), batchRef: v.string() }),
  v.object({ kind: v.literal('ready'), checkpoint: treasuryChainCheckpointValue, blockTimestamp: v.number() }),
  v.object({ kind: v.literal('applying'), checkpoint: treasuryChainCheckpointValue, blockTimestamp: v.number(), batchRef: v.string() }),
)
export const treasuryIdentityValue = v.object({
  environment: treasuryEnvironmentValue, custodyRef: v.string(), custodyGeneration: v.number(),
  network: v.string(), asset: v.string(), address: v.string(), bufferTargetUnits: v.string(),
})
export type TreasuryIdentity = Infer<typeof treasuryIdentityValue>
export const treasuryBatchValue = v.object({
  batchRef: v.string(), custodyRef: v.string(), custodyGeneration: v.number(),
  previousCheckpoint: v.union(v.null(), treasuryChainCheckpointValue), observation: treasuryChainObservationValue,
  previousBufferUnits: v.string(), bufferIncreaseUnits: v.string(),
  state: v.union(
    v.object({ kind: v.literal('pending') }),
    v.object({ kind: v.literal('booked'), transactionRefs: v.array(v.string()), completedAt: v.number() }),
  ),
  createdAt: v.number(),
})
export type TreasuryBatch = Infer<typeof treasuryBatchValue>
export const treasuryProgressValue = v.union(
  v.object({ kind: v.literal('unavailable'), code: v.string() }),
  v.object({ kind: v.literal('empty'), identity: treasuryIdentityValue }),
  v.object({ kind: v.literal('ready'), identity: treasuryIdentityValue, checkpoint: treasuryChainCheckpointValue, blockTimestamp: v.number(), bufferUnits: v.string() }),
  v.object({ kind: v.literal('pending'), identity: treasuryIdentityValue, batch: treasuryBatchValue }),
)
export type TreasuryProgress = Infer<typeof treasuryProgressValue>
