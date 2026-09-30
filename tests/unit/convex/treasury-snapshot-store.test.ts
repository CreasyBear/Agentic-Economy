import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { cdpX402CustodyBudgetRef, cdpX402CustodyConfigurationFromEnvironment } from '@/modules/capability-supply/convex'
import { sealTreasurySnapshot, TREASURY_SNAPSHOT_MAX_AGE_MS, type TreasurySnapshot } from '@/modules/money/treasury-report'
import { X402_SPEND_WINDOW_MS } from '@/modules/money/x402-spend-admission'
import { convexTestWithMarketComponents, nonAdmin, ownerAdmin, type ConvexFixtureAdmin, type ConvexFixtureBackend } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'

const NOW = Date.UTC(2026, 9, 1, 12)
const PAYER = `0x${'1'.repeat(40)}`
const ASSET = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
const NETWORK = 'eip155:84532'
const digest = canonicalDigest('snapshot-store-fixture')
const sourceEnvironment = {
  AE_DEPLOYMENT_ENVIRONMENT: 'development', AE_X402_CUSTODY_ENABLED: 'true',
  AE_X402_CUSTODY_MAX_ATOMIC: '5000000', AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '50000000',
  AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC: '50000000', AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC: '5000000',
  CDP_API_KEY_ID: 'fixture-key', CDP_API_KEY_SECRET: 'fixture-secret', CDP_WALLET_SECRET: 'fixture-wallet-secret',
  AE_X402_CDP_ACCOUNT_NAME: 'fixture-wallet', AE_X402_CDP_EXPECTED_EVM_ADDRESS: PAYER,
  AE_X402_CDP_ACCOUNT_POLICY_ID: '11111111-1111-4111-8111-111111111111',
  AE_X402_CDP_PROJECT_POLICY_ID: '22222222-2222-4222-8222-222222222222',
  AE_X402_CDP_POLICY_RULES_DIGEST: digest, AE_X402_CDP_CREDENTIAL_GENERATION: '1',
}
const custody = cdpX402CustodyConfigurationFromEnvironment(sourceEnvironment)!
const identity = { environment: 'sandbox' as const, custodyRef: cdpX402CustodyBudgetRef(custody, 'sandbox'),
  custodyGeneration: 1, network: NETWORK, asset: ASSET, address: PAYER, bufferTargetUnits: '5000000' }
let clock = NOW
beforeEach(() => {
  clock = NOW
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  for (const [key, value] of Object.entries(sourceEnvironment)) vi.stubEnv(key, value)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

function report(snapshotAt = NOW, condition: 'matched' | 'mismatch' | 'unavailable' = 'matched'): TreasurySnapshot {
  const zero = { kind: 'matched' as const, checkedCount: 0, expectedUnits: '0', observedUnits: '0', differenceUnits: '0' }
  const material: Omit<TreasurySnapshot, 'snapshotRef' | 'evidenceDigest'> = {
    snapshotAt, environment: identity.environment, custodyRef: identity.custodyRef, custodyGeneration: 1,
    custodyIdentityDigest: canonicalDigest(identity),
    ledger: { kind: 'available', observedAt: snapshotAt, availableUnits: '10000000', committedUnits: '0', bufferUnits: '5000000',
      payments24hUnits: '0', payments7dUnits: '0', paymentBasis: 'gross_provider_payments',
      purchasedAvailableAudUnits: '0', purchasedReservedAudUnits: '0', promotionalAvailableAudUnits: '0', promotionalReservedAudUnits: '0' },
    chain: { kind: 'available', observedAt: snapshotAt, blockTimestamp: snapshotAt - 1_000, blockNumber: '100',
      blockHash: `0x${'a'.repeat(64)}`, totalUnits: condition === 'mismatch' ? '15010001' : '15000000', caughtUp: true },
    referenceRate: { kind: 'available', observedAt: snapshotAt, usdcToAudRate: '1.2' },
    spending: { kind: 'available', observedAt: snapshotAt, windowStartsAt: snapshotAt - X402_SPEND_WINDOW_MS,
      settledUnits: '0', liabilityUnits: '0', maximumUnits: '50000000' },
    inFlight: { kind: 'available', observedAt: snapshotAt, count: 0, amountUnits: '0', oldestAt: null,
      overdueCount: 0, overdueUnits: '0', calls: [], listedCallsComplete: true },
    checks: {
      cash: condition === 'unavailable' ? { kind: 'unavailable', code: 'chain_provider_unavailable' } : condition === 'mismatch'
        ? { kind: 'mismatch', code: 'treasury_cash_difference', checkedCount: 1, expectedUnits: '15000000', observedUnits: '15010001', differenceUnits: '10001', evidenceRefs: ['batch:cash-difference'] }
        : { kind: 'matched', checkedCount: 1, expectedUnits: '15000000', observedUnits: '15000000', differenceUnits: '0' },
      settlements: zero, funding: zero,
      reservations: zero,
    },
    rawCashDifferenceUnits: condition === 'mismatch' ? '10001' : '0', cashTimingAdjustmentUnits: '0',
    historyStartedAt: snapshotAt - 1_000, deposits: [], depositsComplete: true,
    alerts: condition === 'mismatch' ? [{ code: 'cash_difference', severity: 'critical', evidenceRefs: ['batch:cash-difference'] }]
      : condition === 'unavailable' ? [{ code: 'reconciliation_unavailable', severity: 'warning', evidenceRefs: ['provider:funding'] }] : [],
  }
  return sealTreasurySnapshot(material)
}

function reseal(snapshot: TreasurySnapshot, changes: Partial<Omit<TreasurySnapshot, 'snapshotRef' | 'evidenceDigest'>>) {
  const { snapshotRef: _ref, evidenceDigest: _digest, ...material } = snapshot
  return sealTreasurySnapshot({ ...material, ...changes })
}
async function stored(backend: ConvexFixtureBackend) {
  return await backend.run(async ctx => ({ snapshots: await ctx.db.query('moneyTreasurySnapshots').collect(),
    alerts: await ctx.db.query('moneyTreasuryAlerts').collect(), launch: await ctx.db.query('platformLaunch').collect() }))
}
async function seedObservation(backend: ConvexFixtureBackend, at = clock) {
  await backend.run(ctx => ctx.db.insert('moneyTreasuryObservations', {
    observationRef: `observation:${at}`, environment: 'sandbox', custodyRef: identity.custodyRef, custodyGeneration: 1,
    network: NETWORK, asset: 'USDC', exponent: 6, totalUnits: '15000000', bufferUnits: '5000000',
    evidenceRef: `evidence:observation:${at}`, evidenceDigest: digest, observedAt: at, recordedAt: at,
  }))
}
async function command(admin: ConvexFixtureAdmin, key: string, paused: boolean) {
  const view = await admin.query(api.adminConsoleTreasury.read, {})
  if (view.kind !== 'ready') throw new Error('fixture_admin_read_denied')
  return await withSourceWrite('admin_operator', {
    action: 'set_payments_paused' as const, input: { environment: 'sandbox' as const, paused },
    reasonCode: paused ? 'operational_pause' as const : 'operational_resume' as const,
    operationKey: key, correlationId: key, evidenceRefs: ['evidence:snapshot-store-control'],
    expectedStateDigest: view.controls.launchStateDigest, approval: { kind: 'execute' as const },
    proof: { reverificationId: `reverification:${key}`, firstFactorAgeMinutes: 0, secondFactorAgeMinutes: 0 },
  })
}

describe('registered treasury snapshot publication and control behavior', () => {
  it('publishes exact concurrent/retry snapshots once and returns one durable alert episode', async () => {
    const emitted = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_snapshot-concurrent')
    const snapshot = report(NOW, 'mismatch')
    const results = await Promise.all([backend.mutation(internal.moneyTreasuryReconciliation.publishSnapshot, { snapshot }),
      backend.mutation(internal.moneyTreasuryReconciliation.publishSnapshot, { snapshot })])
    expect(results.map(result => result.kind)).toEqual(['published', 'published'])
    expect(results.filter(result => result.kind === 'published' && !result.replayed)).toHaveLength(1)
    expect(results.flatMap(result => result.kind === 'published' ? result.newAlertRefs : [])).toHaveLength(1)
    const before = await stored(backend)
    expect(before.snapshots).toHaveLength(1)
    expect(before.alerts).toMatchObject([{ code: 'cash_difference', severity: 'critical', state: 'open', firstSeenAt: NOW }])
    await expect(backend.mutation(internal.moneyTreasuryReconciliation.publishSnapshot, { snapshot }))
      .resolves.toEqual({ kind: 'published', replayed: true, newAlertRefs: [] })
    expect(await stored(backend)).toEqual(before)
    await expect(admin.query(api.adminConsoleTreasury.read, {})).resolves.toMatchObject({ kind: 'ready', snapshot,
      alerts: [{ alertRef: before.alerts[0]!.alertRef, code: 'cash_difference', severity: 'critical' }] })
    const alerts = emitted.mock.calls.filter(args => String(args[1]).includes('treasury.reconciliation.alert'))
    expect(alerts).toHaveLength(1)
    expect(JSON.parse(String(alerts[0]![1]))).toMatchObject({ level: 'error', code: 'cash_difference',
      alertRef: before.alerts[0]!.alertRef, environment: 'sandbox', snapshotRef: snapshot.snapshotRef })
  })

  it('refuses unpublished older/equal-time, future and changed-custody reports without replacing current evidence', async () => {
    const backend = convexTestWithMarketComponents()
    const current = report(NOW)
    await expect(backend.mutation(internal.moneyTreasuryReconciliation.publishSnapshot, { snapshot: current }))
      .resolves.toMatchObject({ kind: 'published', replayed: false })
    const before = await stored(backend)
    for (const snapshot of [report(NOW - 1), report(NOW, 'mismatch')]) {
      await expect(backend.mutation(internal.moneyTreasuryReconciliation.publishSnapshot, { snapshot }))
        .resolves.toEqual({ kind: 'unavailable', code: 'treasury_snapshot_superseded' })
    }
    await expect(backend.mutation(internal.moneyTreasuryReconciliation.publishSnapshot, { snapshot: report(NOW + 1) }))
      .resolves.toEqual({ kind: 'unavailable', code: 'treasury_snapshot_invalid' })
    vi.stubEnv('AE_X402_CDP_CREDENTIAL_GENERATION', '2')
    await expect(backend.mutation(internal.moneyTreasuryReconciliation.publishSnapshot, { snapshot: current }))
      .resolves.toEqual({ kind: 'unavailable', code: 'treasury_snapshot_invalid' })
    expect(await stored(backend)).toEqual(before)
  })

  it.each(['wrong_difference', 'negative_cash', 'old_metric_clock'] as const)('refuses semantically invalid sealed %s material before writes', async fault => {
    const backend = convexTestWithMarketComponents()
    const valid = report()
    const snapshot = fault === 'wrong_difference'
      ? reseal(valid, { checks: { ...valid.checks, cash: { kind: 'matched', checkedCount: 1, expectedUnits: '15000000', observedUnits: '15000000', differenceUnits: '1' } } })
      : valid.ledger.kind === 'available'
        ? reseal(valid, { ledger: { ...valid.ledger, ...(fault === 'negative_cash' ? { availableUnits: '-1' } : { observedAt: NOW - 1 }) } })
        : valid
    await expect(backend.mutation(internal.moneyTreasuryReconciliation.publishSnapshot, { snapshot }))
      .resolves.toEqual({ kind: 'unavailable', code: 'treasury_snapshot_invalid' })
    expect(await stored(backend)).toEqual({ snapshots: [], alerts: [], launch: [] })
    await expect(backend.mutation(internal.moneyTreasuryReconciliation.publishSnapshot, { snapshot: valid }))
      .resolves.toMatchObject({ kind: 'published', replayed: false })
  })

  it('keeps a critical mismatch open through unavailable evidence, resolves on matched proof and creates a new recurrence episode', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_snapshot-episode')
    await seedObservation(backend)
    await backend.mutation(internal.moneyTreasuryReconciliation.publishSnapshot, { snapshot: report(NOW - 4, 'mismatch') })
    const initial = (await stored(backend)).alerts.find(alert => alert.code === 'cash_difference')
    if (initial === undefined) throw new Error('fixture_cash_episode_missing')
    const unavailable = report(NOW - 3, 'unavailable')
    await backend.mutation(internal.moneyTreasuryReconciliation.publishSnapshot, { snapshot: unavailable })
    const unresolved = (await stored(backend)).alerts.find(alert => alert.code === 'cash_difference')
    expect(unresolved).toEqual(initial)
    await expect(admin.query(api.adminConsoleTreasury.read, {})).resolves.toMatchObject({ snapshot: unavailable,
      alerts: expect.arrayContaining([expect.objectContaining({ alertRef: initial.alertRef,
        code: 'cash_difference', severity: 'critical', evidenceRefs: initial.evidenceRefs })]) })
    await backend.mutation(internal.moneyTreasuryReconciliation.publishSnapshot, { snapshot: report(NOW - 2) })
    expect((await stored(backend)).alerts.find(alert => alert.alertRef === initial.alertRef))
      .toMatchObject({ state: 'resolved', resolvedAt: NOW - 2 })
    await expect(admin.query(api.adminConsoleTreasury.read, {})).resolves.toMatchObject({ alerts: [] })
    const recurrence = await backend.mutation(internal.moneyTreasuryReconciliation.publishSnapshot, { snapshot: report(NOW - 1, 'mismatch') })
    expect(recurrence).toMatchObject({ kind: 'published', replayed: false, newAlertRefs: [expect.any(String)] })
    const episodes = (await stored(backend)).alerts.filter(alert => alert.code === 'cash_difference')
    expect(episodes).toHaveLength(2)
    const reopened = episodes.find(alert => alert.state === 'open')
    expect(reopened).toMatchObject({ severity: 'critical', firstSeenAt: NOW - 1 })
    expect(reopened?.alertRef).not.toBe(initial.alertRef)
    await expect(admin.query(api.adminConsoleTreasury.read, {})).resolves.toMatchObject({ alerts: [{ alertRef: reopened!.alertRef, code: 'cash_difference' }] })
  })

  it('does not return protected snapshot or alert records to a fresh authenticated non-admin', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_snapshot-read-owner')
    const outsider = await nonAdmin(backend, 'user_snapshot-read-outsider')
    await backend.mutation(internal.moneyTreasuryReconciliation.publishSnapshot, { snapshot: report(NOW, 'mismatch') })
    await expect(admin.query(api.adminConsoleTreasury.read, {})).resolves.toMatchObject({ kind: 'ready', snapshot: { snapshotAt: NOW }, alerts: [expect.any(Object)] })
    await expect(outsider.query(api.adminConsoleTreasury.read, {})).resolves.toEqual({ kind: 'refused', code: 'missing_membership' })
  })

  it.each(['empty', 'stale', 'mismatch', 'unavailable'] as const)('admits pause but refuses resume with an %s report, then permits fresh matched evidence', async condition => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, `user_snapshot-resume-${condition}`)
    await seedObservation(backend)
    if (condition !== 'empty') await backend.mutation(internal.moneyTreasuryReconciliation.publishSnapshot, {
      snapshot: report(condition === 'stale' ? NOW - TREASURY_SNAPSHOT_MAX_AGE_MS : NOW,
        condition === 'stale' ? 'matched' : condition),
    })
    await expect(admin.mutation(api.adminTreasuryCommands.setPaymentsPaused, await command(admin, `pause:${condition}`, true)))
      .resolves.toMatchObject({ kind: 'completed', code: 'payments_paused' })
    const paused = (await stored(backend)).launch
    expect(paused).toMatchObject([{ paymentsOpenTo: 'none', resumePaymentsOpenTo: 'everyone' }])
    await expect(admin.mutation(api.adminTreasuryCommands.setPaymentsPaused, await command(admin, `resume:${condition}`, false)))
      .resolves.toMatchObject({ kind: 'refused', code: condition === 'empty' || condition === 'stale'
        ? 'treasury_reconciliation_stale' : 'treasury_reconciliation_required' })
    expect((await stored(backend)).launch).toEqual(paused)
    clock = NOW + 1
    await seedObservation(backend)
    await expect(backend.mutation(internal.moneyTreasuryReconciliation.publishSnapshot, { snapshot: report(clock) }))
      .resolves.toMatchObject({ kind: 'published', replayed: false })
    await expect(admin.mutation(api.adminTreasuryCommands.setPaymentsPaused, await command(admin, `fresh-resume:${condition}`, false)))
      .resolves.toMatchObject({ kind: 'completed', code: 'payments_resumed' })
    expect((await stored(backend)).launch).toMatchObject([{ paymentsOpenTo: 'everyone', resumePaymentsOpenTo: 'everyone' }])
  })
})
