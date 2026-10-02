import { v, type Infer } from 'convex/values'
import { paymentsAudienceValue, treasuryEnvironmentValue, treasuryIdentityValue, treasuryThresholdsValue } from './treasury'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const unavailableValue = v.object({ kind: v.literal('unavailable'), code: v.string() })

/** A comparison is complete only when both sides have complete, attributed evidence. */
export const treasuryCheckValue = v.union(
  v.object({ kind: v.literal('matched'), checkedCount: v.number(), expectedUnits: v.string(), observedUnits: v.string(), differenceUnits: v.string() }),
  v.object({ kind: v.literal('mismatch'), code: v.string(), checkedCount: v.number(), expectedUnits: v.string(), observedUnits: v.string(), differenceUnits: v.string(), evidenceRefs: v.array(v.string()) }),
  v.object({ kind: v.literal('attention'), code: v.string(), pendingCount: v.number(), pendingUnits: v.union(v.null(), v.string()), evidenceRefs: v.array(v.string()) }),
  unavailableValue,
)
export type TreasuryCheck = Infer<typeof treasuryCheckValue>

export const treasuryLedgerMetricValue = v.union(unavailableValue, v.object({
  kind: v.literal('available'), observedAt: v.number(),
  availableUnits: v.string(), committedUnits: v.string(), bufferUnits: v.string(),
  payments24hUnits: v.string(), payments7dUnits: v.string(), paymentBasis: v.literal('gross_provider_payments'),
  purchasedAvailableAudUnits: v.string(), purchasedReservedAudUnits: v.string(),
  promotionalAvailableAudUnits: v.string(), promotionalReservedAudUnits: v.string(),
}))
export const treasuryChainMetricValue = v.union(unavailableValue, v.object({
  kind: v.literal('available'), observedAt: v.number(), blockTimestamp: v.number(),
  blockNumber: v.string(), blockHash: v.string(), totalUnits: v.string(), caughtUp: v.boolean(),
}))
export const treasuryReferenceRateValue = v.union(unavailableValue, v.object({
  kind: v.literal('available'), observedAt: v.number(), usdcToAudRate: v.string(),
}))
export const treasurySpendMetricValue = v.union(unavailableValue, v.object({
  kind: v.literal('available'), observedAt: v.number(), windowStartsAt: v.number(),
  settledUnits: v.string(), liabilityUnits: v.string(), maximumUnits: v.string(),
}))
export const treasuryInFlightValue = v.union(unavailableValue, v.object({
  kind: v.literal('available'), observedAt: v.number(),
  count: v.number(), amountUnits: v.string(), oldestAt: v.union(v.null(), v.number()),
  overdueCount: v.number(), overdueUnits: v.string(),
  calls: v.array(v.object({ callRef: v.string(), amountUnits: v.string(), createdAt: v.number(), state: v.string() })),
  listedCallsComplete: v.boolean(),
}))

export const treasuryAlertCodeValue = v.union(
  v.literal('float_low'), v.literal('observation_stale'), v.literal('cash_difference'),
  v.literal('settlement_difference'), v.literal('funding_difference'),
  v.literal('reservation_overdue'), v.literal('reservation_difference'), v.literal('reconciliation_unavailable'),
  v.literal('reconciliation_stale'), v.literal('daily_limit_80_percent'),
)
export type TreasuryAlertCode = Infer<typeof treasuryAlertCodeValue>
export const treasuryAlertValue = v.object({
  code: treasuryAlertCodeValue, severity: v.union(v.literal('warning'), v.literal('critical')),
  evidenceRefs: v.array(v.string()),
})

/**
 * Requires complete source evidence for a matched check, exact atomic units and one custody identity.
 * Ensures the published read model retains unavailable and timing states independently of metrics.
 * Invariant: gross payments, purchased/promotional credit, cash and unresolved liability remain distinct.
 * On violation: the producer publishes an unavailable check, never a fabricated balance or successful audit.
 * Cost/benefit: one explicit report contract serves the scheduled producer, admin read and five UI groups.
 * Keep: the existing deposit cursor and native metric reader each prove only part of this operator decision.
 */
export const treasurySnapshotValue = v.object({
  snapshotRef: v.string(), snapshotAt: v.number(), environment: treasuryEnvironmentValue,
  custodyRef: v.string(), custodyGeneration: v.number(), custodyIdentityDigest: v.string(),
  evidenceDigest: v.string(),
  ledger: treasuryLedgerMetricValue, chain: treasuryChainMetricValue,
  referenceRate: treasuryReferenceRateValue, spending: treasurySpendMetricValue, inFlight: treasuryInFlightValue,
  checks: v.object({ cash: treasuryCheckValue, settlements: treasuryCheckValue, funding: treasuryCheckValue, reservations: treasuryCheckValue }),
  rawCashDifferenceUnits: v.union(v.null(), v.string()),
  cashTimingAdjustmentUnits: v.union(v.null(), v.string()),
  historyStartedAt: v.union(v.null(), v.number()),
  deposits: v.array(v.object({ transactionRef: v.string(), amountUnits: v.string(), bookedAt: v.number(), chainTransactionHash: v.union(v.null(), v.string()) })),
  depositsComplete: v.boolean(),
  alerts: v.array(treasuryAlertValue),
})
export type TreasurySnapshot = Infer<typeof treasurySnapshotValue>
export const TREASURY_SNAPSHOT_MAX_AGE_MS = 20 * 60_000

export function sealTreasurySnapshot(material: Omit<TreasurySnapshot, 'snapshotRef' | 'evidenceDigest'>): TreasurySnapshot {
  const evidenceDigest = canonicalDigest({ kind: 'ae.treasury-snapshot:v1', ...material })
  return { ...material, evidenceDigest, snapshotRef: `treasury-snapshot:${evidenceDigest.slice(7)}` }
}

export const adminTreasuryViewValue = v.object({
  kind: v.literal('ready'), environment: treasuryEnvironmentValue,
  custody: v.union(v.null(), treasuryIdentityValue),
  observation: v.union(v.null(), v.object({ totalUnits: v.string(), observedAt: v.number(), evidenceRef: v.string() })),
  controls: v.object({
    paymentsOpenTo: v.union(v.literal('none'), paymentsAudienceValue), resumePaymentsOpenTo: paymentsAudienceValue,
    launchStateDigest: v.string(), thresholds: treasuryThresholdsValue, settingsStateDigest: v.string(),
    canManage: v.boolean(), resumeRequiresApproval: v.boolean(),
  }),
  snapshot: v.union(v.null(), treasurySnapshotValue),
  alerts: v.array(treasuryAlertValue.extend({ alertRef: v.string(), firstSeenAt: v.number(), lastSeenAt: v.number() })),
})
export type AdminTreasuryView = Infer<typeof adminTreasuryViewValue>
export type AdminTreasuryResult = AdminTreasuryView | { kind: 'refused'; code: string }

export type TreasuryResumeRefusalCode = 'treasury_configuration_unavailable' | 'treasury_observation_stale'
  | 'treasury_reconciliation_stale' | 'treasury_reconciliation_required' | 'treasury_capacity_unavailable'
