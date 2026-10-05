import { makeFunctionReference } from 'convex/server'
import { backendPaymentReadinessDigest, paymentReadinessExpiresAt, sealPaymentReadinessSnapshot,
  PAYMENT_READINESS_MAX_VALIDITY_MS, type PaymentReadinessChecks, type PaymentReadinessSnapshot,
} from '@/modules/money/payment-readiness'
import type { PublishPaymentReadinessResult } from '../../convex/lib/money/readiness/store'
import type { ConvexFixtureBackend } from './convex-fixtures'
import { internal } from '../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { sealTreasurySnapshot, type TreasuryCheck, type TreasurySnapshot } from '@/modules/money/treasury-report'

const publish = makeFunctionReference<'mutation', { snapshot: PaymentReadinessSnapshot }, PublishPaymentReadinessResult>('moneyReadiness:publish')

/** Explicit test evidence only: the real seal, current config binding and publication mutation all execute. */
export async function seedPaymentReadiness(
  backend: ConvexFixtureBackend,
  options: { environment?: 'production' | 'sandbox'; validityMs?: number; checks?: PaymentReadinessChecks } = {},
): Promise<PaymentReadinessSnapshot> {
  const now = Date.now()
  const passed = { kind: 'passed' as const, validUntil: now + (options.validityMs ?? PAYMENT_READINESS_MAX_VALIDITY_MS) }
  const checks = options.checks ?? { web_configuration: passed, formance: passed, cdp_custody: passed,
    base_rpc: passed, reference_rate: passed, sanctions: passed, commercial_policy: passed, treasury: passed }
  const snapshot = sealPaymentReadinessSnapshot({ environment: options.environment ?? 'production',
    configurationDigest: backendPaymentReadinessDigest(process.env), startedAt: now, completedAt: now,
    expiresAt: paymentReadinessExpiresAt(now, checks), checks })
  const result = await backend.mutation(publish, { snapshot })
  if (result.kind !== 'published') throw new Error(`fixture_payment_readiness_refused:${result.code}`)
  return snapshot
}

/**
 * Explicit synthetic source facts, not native proof. Requires configured custody
 * and spend caps; never changes runtime config or silently repairs an observation.
 * Two real consumers need the same healthy source contract. Negative tests choose
 * preserve so missing/stale/foreign observations remain unavailable at admission.
 */
export async function seedTreasuryReadinessFacts(backend: ConvexFixtureBackend, options: {
  observation: 'create' | 'preserve'; snapshotAt?: number; observationAt?: number; chainObservedAt?: number
  cashCheck?: TreasuryCheck; availableUnits?: string; chainBlockTimestamp?: number
}): Promise<TreasurySnapshot> {
  const now = options.snapshotAt ?? Date.now()
  const context = await backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: now })
  if (context.kind !== 'available' || context.maximumUnits === null) throw new Error('fixture_treasury_configuration_required')
  const { identity } = context
  const availableUnits = options.availableUnits ?? '100000000'
  const totalUnits = (BigInt(availableUnits) + BigInt(identity.bufferTargetUnits)).toString()
  if (options.observation === 'create') {
    const observedAt = options.observationAt ?? now
    const evidenceDigest = canonicalDigest({ identity, now: observedAt, totalUnits })
    const observationRef = `readiness-observation:${evidenceDigest}`
    await backend.run(async ctx => {
      const existing = await ctx.db.query('moneyTreasuryObservations').withIndex('by_observationRef', q => q.eq('observationRef', observationRef)).unique()
      if (existing !== null) return
      await ctx.db.insert('moneyTreasuryObservations', { observationRef, environment: identity.environment,
        custodyRef: identity.custodyRef, custodyGeneration: identity.custodyGeneration, network: identity.network,
        asset: 'USDC', exponent: 6, totalUnits, bufferUnits: identity.bufferTargetUnits,
        evidenceRef: observationRef, evidenceDigest, observedAt, recordedAt: Date.now() })
    })
  }
  const zero = { kind: 'matched' as const, checkedCount: 0, expectedUnits: '0', observedUnits: '0', differenceUnits: '0' }
  const cash = options.cashCheck ?? { ...zero, checkedCount: 1, expectedUnits: totalUnits, observedUnits: totalUnits }
  const snapshot = sealTreasurySnapshot({ snapshotAt: now, environment: identity.environment,
    custodyRef: identity.custodyRef, custodyGeneration: identity.custodyGeneration, custodyIdentityDigest: canonicalDigest(identity),
    ledger: { kind: 'available', observedAt: now, availableUnits, committedUnits: '0', bufferUnits: identity.bufferTargetUnits,
      payments24hUnits: '0', payments7dUnits: '0', paymentBasis: 'gross_provider_payments',
      purchasedAvailableAudUnits: '0', purchasedReservedAudUnits: '0', promotionalAvailableAudUnits: '0', promotionalReservedAudUnits: '0' },
    chain: { kind: 'available', observedAt: options.chainObservedAt ?? now, blockTimestamp: options.chainBlockTimestamp ?? now, blockNumber: '100',
      blockHash: `0x${'a'.repeat(64)}`, totalUnits: cash.kind === 'mismatch' ? cash.observedUnits : totalUnits, caughtUp: true },
    referenceRate: { kind: 'unavailable', code: 'not_needed_for_payment_resume' },
    spending: { kind: 'available', observedAt: now, windowStartsAt: Math.max(0, now - 86_400_000),
      settledUnits: '0', liabilityUnits: '0', maximumUnits: context.maximumUnits },
    inFlight: { kind: 'available', observedAt: now, count: 0, amountUnits: '0', oldestAt: null,
      overdueCount: 0, overdueUnits: '0', calls: [], listedCallsComplete: true },
    checks: { cash, settlements: zero, funding: zero, reservations: zero },
    rawCashDifferenceUnits: cash.kind === 'matched' || cash.kind === 'mismatch' ? cash.differenceUnits : null,
    cashTimingAdjustmentUnits: '0', historyStartedAt: now, deposits: [], depositsComplete: true,
    alerts: cash.kind === 'mismatch' ? [{ code: 'cash_difference', severity: 'critical', evidenceRefs: cash.evidenceRefs }] : [],
  })
  const result = await backend.mutation(internal.moneyTreasuryReconciliation.publishSnapshot, { snapshot })
  if (result.kind !== 'published') throw new Error(`fixture_treasury_publication_refused:${result.code}`)
  return snapshot
}
