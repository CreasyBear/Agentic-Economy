import type { AdminTreasuryView, TreasurySnapshot } from '@/modules/money/treasury-report'

export const TEST_NOW = Date.UTC(2026, 9, 1, 12)
export function treasuryTestSnapshot(): TreasurySnapshot {
  const check = { kind: 'matched' as const, checkedCount: 1, expectedUnits: '0', observedUnits: '0', differenceUnits: '0' }
  return { snapshotRef: 'snapshot:test', snapshotAt: TEST_NOW, environment: 'sandbox', custodyRef: 'custody:test',
    custodyGeneration: 1, custodyIdentityDigest: 'digest:test', evidenceDigest: 'digest:test',
    ledger: { kind: 'available', observedAt: TEST_NOW, availableUnits: '14000000', committedUnits: '3000000', bufferUnits: '1000000',
      payments24hUnits: '2000000', payments7dUnits: '7000000', paymentBasis: 'gross_provider_payments',
      purchasedAvailableAudUnits: '6000000', purchasedReservedAudUnits: '2000000', promotionalAvailableAudUnits: '3000000', promotionalReservedAudUnits: '1000000' },
    chain: { kind: 'available', observedAt: TEST_NOW, blockTimestamp: TEST_NOW - 5000, blockNumber: '123', blockHash: 'hash:test', totalUnits: '18000000', caughtUp: true },
    referenceRate: { kind: 'available', observedAt: TEST_NOW, usdcToAudRate: '1.5' },
    spending: { kind: 'available', observedAt: TEST_NOW, windowStartsAt: TEST_NOW - 86400000, settledUnits: '2000000', liabilityUnits: '3000000', maximumUnits: '10000000' },
    inFlight: { kind: 'available', observedAt: TEST_NOW, count: 1, amountUnits: '3000000', oldestAt: TEST_NOW - 1000, overdueCount: 0, overdueUnits: '0', calls: [{ callRef: 'call:test', amountUnits: '3000000', createdAt: TEST_NOW - 1000, state: 'reconciliation_required' }], listedCallsComplete: true },
    checks: { cash: check, settlements: check, funding: check, reservations: check },
    rawCashDifferenceUnits: '0', cashTimingAdjustmentUnits: '0', historyStartedAt: TEST_NOW - 86400000 * 7, alerts: [], deposits: [], depositsComplete: true,
  }
}
export function treasuryTestView(): AdminTreasuryView {
  return { kind: 'ready', environment: 'sandbox', custody: { environment: 'sandbox', custodyRef: 'custody:test', custodyGeneration: 1,
    network: 'eip155:84532', asset: `0x${'2'.repeat(40)}`, address: `0x${'1'.repeat(40)}`, bufferTargetUnits: '1000000' },
    observation: { totalUnits: '18000000', observedAt: TEST_NOW, evidenceRef: 'observation:test' },
    controls: { paymentsOpenTo: 'admins', resumePaymentsOpenTo: 'admins', launchStateDigest: 'launch:1',
      thresholds: { kind: 'runway', lowWaterDays: 3, targetDays: 14 }, settingsStateDigest: 'settings:1', canManage: true, resumeRequiresApproval: false },
    snapshot: treasuryTestSnapshot(), alerts: [],
  }
}
