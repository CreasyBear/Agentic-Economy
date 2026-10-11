import { makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminCommandArgs, AdminCommandReceipt } from '@/lib/operator/admin-console/contracts'
import type { AdminCommandWireArgs } from '../commands/contracts'
import { parseAdminProposalCommand } from '@/components/ae/admin/actions/actions.contracts'
import { convexTestWithMarketComponents, ownerAdmin, supportAdmin, type ConvexFixtureBackend, type ConvexFixtureAdmin } from '../../../../tests/helpers/convex-fixtures'
import { withSourceWrite } from '../../../../tests/helpers/source-write-admission'
import { seedPaymentReadiness } from '../../../../tests/helpers/payment-readiness-fixture'
import { recordTreasuryObservation, validCustodyEnvironment } from '../../../../tests/helpers/quote-fixtures'
import { sealTreasurySnapshot } from '@/modules/money/treasury-report'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { internal } from '../../../_generated/api'
import { readTreasuryControlState } from './treasury'

const pauseRef = makeFunctionReference<'mutation', AdminCommandWireArgs<'set_payments_paused'>, AdminCommandReceipt<'set_payments_paused'>>('adminTreasuryCommands:setPaymentsPaused')
const audienceRef = makeFunctionReference<'mutation', AdminCommandWireArgs<'set_payments_audience'>, AdminCommandReceipt<'set_payments_audience'>>('adminTreasuryCommands:setPaymentsAudience')
const thresholdsRef = makeFunctionReference<'mutation', AdminCommandWireArgs<'change_treasury_thresholds'>, AdminCommandReceipt<'change_treasury_thresholds'>>('adminTreasuryCommands:changeThresholds')

async function pauseCommand(
  admin: ConvexFixtureAdmin,
  key: string,
  paused: boolean,
  overrides: Partial<AdminCommandArgs<'set_payments_paused'>> = {},
) {
  const state = await admin.run((ctx) => readTreasuryControlState(ctx, 'production'))
  const identity = await admin.run(ctx => ctx.auth.getUserIdentity())
  if (identity === null) throw new Error('fixture_admin_identity_missing')
  return withSourceWrite('admin_operator', {
    action: 'set_payments_paused' as const,
    input: { environment: 'production' as const, paused },
    reasonCode: paused ? 'operational_pause' as const : 'operational_resume' as const,
    operationKey: key, correlationId: `${key}:correlation`, evidenceRefs: ['evidence:treasury:operator'],
    expectedStateDigest: state.launchStateDigest, approval: { kind: 'execute' as const },
    proof: { reverificationId: `${key}:proof`, firstFactorAgeMinutes: 0, secondFactorAgeMinutes: 0, subject: identity.subject, evidenceObservedAt: Date.now() },
    ...overrides,
  })
}

async function thresholdsCommand(admin: ConvexFixtureAdmin, key: string, lowWaterUnits: string, targetFloatUnits: string) {
  const state = await admin.run((ctx) => readTreasuryControlState(ctx, 'production'))
  const identity = await admin.run(ctx => ctx.auth.getUserIdentity())
  if (identity === null) throw new Error('fixture_admin_identity_missing')
  return withSourceWrite('admin_operator', {
    action: 'change_treasury_thresholds' as const,
    input: { environment: 'production' as const, lowWaterUnits, targetFloatUnits },
    reasonCode: 'threshold_update' as const, operationKey: key, correlationId: `${key}:correlation`,
    evidenceRefs: ['evidence:treasury:operator'], expectedStateDigest: state.settingsStateDigest,
    approval: { kind: 'execute' as const },
    proof: { reverificationId: `${key}:proof`, firstFactorAgeMinutes: 0, secondFactorAgeMinutes: 0, subject: identity.subject, evidenceObservedAt: Date.now() },
  })
}

beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production'))
afterEach(() => vi.unstubAllEnvs())

describe('admin treasury controls', () => {
  it('reads stable explicit defaults without creating rows', async () => {
    const backend = convexTestWithMarketComponents()
    const production = await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))
    expect(production.launch).toEqual({ environment: 'production', paymentsOpenTo: 'admins', resumePaymentsOpenTo: 'admins', revision: 0, updatedAt: 0 })
    expect(production.settings.thresholds).toEqual({ kind: 'runway', lowWaterDays: 3, targetDays: 14 })
    expect(await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))).toEqual(production)
    expect((await backend.run((ctx) => readTreasuryControlState(ctx, 'sandbox'))).launch.paymentsOpenTo).toBe('everyone')
    expect(await backend.run((ctx) => ctx.db.query('platformLaunch').collect())).toEqual([])
  })

  it('pauses immediately with two owners, preserves audience on repeated pause, and replays without another audit', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_treasury-first')
    await ownerAdmin(backend, 'user_treasury-second')
    const args = await pauseCommand(admin, 'treasury:pause', true)
    const receipt = await admin.mutation(pauseRef, args)
    expect(receipt).toMatchObject({ kind: 'completed', code: 'payments_paused' })
    expect(await admin.mutation(pauseRef, await withSourceWrite('admin_operator', args))).toEqual(receipt)
    let state = await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))
    expect(state.launch).toMatchObject({ paymentsOpenTo: 'none', resumePaymentsOpenTo: 'admins', revision: 1 })
    expect(await backend.run((ctx) => ctx.db.query('auditEvents').withIndex('by_eventType_and_createdAt', (q) => q.eq('eventType', 'protected_action.attempt_succeeded')).collect())).toHaveLength(1)
    await admin.mutation(pauseRef, await pauseCommand(admin, 'treasury:pause-again', true))
    state = await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))
    expect(state.launch).toMatchObject({ paymentsOpenTo: 'none', resumePaymentsOpenTo: 'admins', revision: 1 })
    expect(await backend.run((ctx) => ctx.db.query('adminApprovalProposals').collect())).toEqual([])
  })

  it('rejects a changed retry key and a second command based on the same reviewed state', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_treasury-conflict')
    const first = await pauseCommand(admin, 'treasury:first-review', true)
    const second = await pauseCommand(admin, 'treasury:second-review', true)
    await admin.mutation(pauseRef, first)
    expect(await admin.mutation(pauseRef, second)).toMatchObject({ kind: 'refused', code: 'target_changed' })
    const changedRetry = await withSourceWrite('admin_operator', { ...first, input: { environment: 'production' as const, paused: false } })
    expect(await admin.mutation(pauseRef, changedRetry)).toMatchObject({ kind: 'refused', code: 'idempotency_conflict' })
    expect((await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))).launch).toMatchObject({ paymentsOpenTo: 'none', revision: 1 })
  })

  it('requires a second owner for resume and restores only the saved audience', async () => {
    const backend = convexTestWithMarketComponents()
    await seedResumeReadiness(backend)
    const admin = await ownerAdmin(backend, 'user_treasury-proposer')
    const approver = await ownerAdmin(backend, 'user_treasury-approver')
    await admin.mutation(pauseRef, await pauseCommand(admin, 'treasury:stop', true))
    expect(await admin.mutation(pauseRef, await pauseCommand(admin, 'treasury:resume-direct', false))).toMatchObject({ kind: 'refused', code: 'approval_required' })
    const command = await pauseCommand(admin, 'treasury:resume-proposal', false, { approval: { kind: 'propose' } })
    const proposal = await admin.mutation(pauseRef, command)
    expect(proposal.kind).toBe('proposed')
    if (proposal.kind !== 'proposed') throw new Error('proposal_expected')
    const stored = await backend.run((ctx) => ctx.db.query('adminApprovalProposals').withIndex('by_proposalRef', (q) => q.eq('proposalRef', proposal.proposalRef)).unique())
    expect(parseAdminProposalCommand('set_payments_paused', stored?.commandJson ?? '')).toMatchObject({ input: { paused: false }, expectedStateDigest: command.expectedStateDigest })
    expect((await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))).launch.paymentsOpenTo).toBe('none')
    const approved = await pauseCommand(approver, 'treasury:resume-approve', false, {
      expectedStateDigest: command.expectedStateDigest,
      approval: { kind: 'approve', proposalRef: proposal.proposalRef },
    })
    expect(await approver.mutation(pauseRef, approved)).toMatchObject({ kind: 'completed', code: 'payments_resumed' })
    expect((await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))).launch).toMatchObject({ paymentsOpenTo: 'admins', resumePaymentsOpenTo: 'admins', revision: 2 })
  })

  it('widens audience only via second owner and narrows immediately without a no-op revision bump', async () => {
    const backend = convexTestWithMarketComponents()
    await seedResumeReadiness(backend)
    const admin = await ownerAdmin(backend, 'user_audience-proposer')
    const approver = await ownerAdmin(backend, 'user_audience-approver')
    const audienceCommand = async (a: ConvexFixtureAdmin, key: string, audience: 'admins' | 'everyone', approval: { kind: 'execute' } | { kind: 'propose' } | { kind: 'approve'; proposalRef: string }, digest?: string) => {
      const state = await a.run((ctx) => readTreasuryControlState(ctx, 'production'))
      const identity = await a.run(ctx => ctx.auth.getUserIdentity())
      if (identity === null) throw new Error('fixture_admin_identity_missing')
      return withSourceWrite('admin_operator', {
        action: 'set_payments_audience' as const, input: { environment: 'production' as const, audience },
        reasonCode: audience === 'everyone' ? 'launch_open' as const : 'launch_close' as const,
        operationKey: key, correlationId: `${key}:correlation`, evidenceRefs: ['evidence:treasury:operator'],
        expectedStateDigest: digest ?? state.launchStateDigest, approval,
        proof: { reverificationId: `${key}:proof`, firstFactorAgeMinutes: 0, secondFactorAgeMinutes: 0, subject: identity.subject, evidenceObservedAt: Date.now() },
      })
    }
    expect(await admin.mutation(audienceRef, await audienceCommand(admin, 'aud:direct', 'everyone', { kind: 'execute' }))).toMatchObject({ kind: 'refused', code: 'approval_required' })
    const propose = await audienceCommand(admin, 'aud:propose', 'everyone', { kind: 'propose' })
    const proposal = await admin.mutation(audienceRef, propose)
    if (proposal.kind !== 'proposed') throw new Error('proposal_expected')
    const approve = await audienceCommand(approver, 'aud:approve', 'everyone', { kind: 'approve', proposalRef: proposal.proposalRef }, propose.expectedStateDigest)
    expect(await approver.mutation(audienceRef, approve)).toMatchObject({ kind: 'completed', code: 'payments_audience_changed' })
    expect((await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))).launch).toMatchObject({ paymentsOpenTo: 'everyone', resumePaymentsOpenTo: 'everyone', revision: 1 })
    expect(await admin.mutation(audienceRef, await audienceCommand(admin, 'aud:narrow', 'admins', { kind: 'execute' }))).toMatchObject({ kind: 'completed', code: 'payments_audience_changed' })
    expect((await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))).launch).toMatchObject({ paymentsOpenTo: 'admins', resumePaymentsOpenTo: 'admins', revision: 2 })
    await admin.mutation(audienceRef, await audienceCommand(admin, 'aud:noop', 'admins', { kind: 'execute' }))
    expect((await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))).launch.revision).toBe(2)
  })

  it('preserves an already open everyone audience through pause and resume', async () => {
    const backend = convexTestWithMarketComponents()
    await seedResumeReadiness(backend)
    const admin = await ownerAdmin(backend, 'user_treasury-audience')
    await backend.run((ctx) => ctx.db.insert('platformLaunch', { environment: 'production', paymentsOpenTo: 'everyone', resumePaymentsOpenTo: 'admins', revision: 2, updatedAt: 1 }))
    await admin.mutation(pauseRef, await pauseCommand(admin, 'treasury:audience-stop', true))
    await admin.mutation(pauseRef, await pauseCommand(admin, 'treasury:audience-resume', false))
    expect((await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))).launch.paymentsOpenTo).toBe('everyone')
  })

  it('cannot widen a currently active audience by submitting resume', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_treasury-no-widen')
    await backend.run((ctx) => ctx.db.insert('platformLaunch', { environment: 'production', paymentsOpenTo: 'admins', resumePaymentsOpenTo: 'everyone', revision: 2, updatedAt: 1 }))
    await admin.mutation(pauseRef, await pauseCommand(admin, 'treasury:no-widen', false))
    expect((await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))).launch).toMatchObject({ paymentsOpenTo: 'admins', revision: 2 })
  })

  it('refuses a missing reviewed digest before creating a proposal', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_treasury-no-digest')
    await ownerAdmin(backend, 'user_treasury-other-owner')
    const signed = await pauseCommand(admin, 'treasury:no-digest', false, { approval: { kind: 'propose' } })
    const { expectedStateDigest: _digest, sourceWrite: _signed, sourceWriteRequest: _request, ...unsigned } = signed
    expect(await admin.mutation(pauseRef, await withSourceWrite('admin_operator', unsigned))).toMatchObject({ kind: 'refused', code: 'target_changed' })
    expect(await backend.run((ctx) => ctx.db.query('adminApprovalProposals').collect())).toEqual([])
    expect(await backend.run((ctx) => ctx.db.query('platformLaunch').collect())).toEqual([])
  })

  it('refuses approval of a stale proposal without consuming that proposal', async () => {
    const backend = convexTestWithMarketComponents()
    const proposer = await ownerAdmin(backend, 'user_treasury-stale-proposer')
    const approver = await ownerAdmin(backend, 'user_treasury-stale-approver')
    await proposer.mutation(pauseRef, await pauseCommand(proposer, 'treasury:stale-stop', true))
    const command = await pauseCommand(proposer, 'treasury:stale-proposal', false, { approval: { kind: 'propose' } })
    const proposal = await proposer.mutation(pauseRef, command)
    if (proposal.kind !== 'proposed') throw new Error('proposal_expected')
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('platformLaunch').withIndex('by_environment', (q) => q.eq('environment', 'production')).unique()
      if (row === null) throw new Error('launch_expected')
      await ctx.db.patch(row._id, { revision: row.revision + 1 })
    })
    const approve = await pauseCommand(approver, 'treasury:stale-approve', false, { expectedStateDigest: command.expectedStateDigest, approval: { kind: 'approve', proposalRef: proposal.proposalRef } })
    expect(await approver.mutation(pauseRef, approve)).toMatchObject({ kind: 'refused', code: 'target_changed' })
    expect((await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))).launch.paymentsOpenTo).toBe('none')
    expect((await backend.run((ctx) => ctx.db.query('adminApprovalProposals').withIndex('by_proposalRef', (q) => q.eq('proposalRef', proposal.proposalRef)).unique()))?.status).toBe('awaiting_second_approval')
  })

  it('changes informational thresholds without second approval and keeps launch authority unchanged', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_treasury-settings')
    await ownerAdmin(backend, 'user_treasury-settings-second')
    const before = await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))
    const args = await thresholdsCommand(admin, 'treasury:settings', '1000000', '4000000')
    const receipt = await admin.mutation(thresholdsRef, args)
    expect(receipt).toMatchObject({ kind: 'completed', code: 'treasury_thresholds_changed' })
    expect(await admin.mutation(thresholdsRef, await withSourceWrite('admin_operator', args))).toEqual(receipt)
    const state = await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))
    expect(state.settings).toMatchObject({ thresholds: { kind: 'fixed', lowWaterUnits: '1000000', targetFloatUnits: '4000000' }, revision: 1 })
    expect(state.launch).toEqual(before.launch)
    expect(await backend.run((ctx) => ctx.db.query('adminApprovalProposals').collect())).toEqual([])
  })

  it.each([['-1', '10'], ['01', '10'], ['0', '0'], ['11', '10'], ['0', '9007199254740992']])('rejects invalid fixed thresholds %s/%s without a settings write', async (low, target) => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_treasury-invalid')
    expect(await admin.mutation(thresholdsRef, await thresholdsCommand(admin, 'treasury:invalid', low, target))).toMatchObject({ kind: 'refused', code: 'treasury_thresholds_invalid' })
    expect(await backend.run((ctx) => ctx.db.query('moneyTreasurySettings').collect())).toEqual([])
  })

  it('refuses support authority, stale MFA, and foreign deployment environments without changing launch state', async () => {
    const backend = convexTestWithMarketComponents()
    const support = await supportAdmin(backend, 'user_treasury-support')
    const admin = await ownerAdmin(backend, 'user_treasury-authority')
    expect(await support.mutation(pauseRef, await pauseCommand(support, 'treasury:support', true))).toMatchObject({ kind: 'refused', code: 'action_not_allowed' })
    expect(await admin.mutation(pauseRef, await pauseCommand(admin, 'treasury:stale-mfa', true, { proof: { reverificationId: 'treasury:stale-proof', firstFactorAgeMinutes: 10, secondFactorAgeMinutes: 10, subject: 'user_treasury-authority', evidenceObservedAt: Date.now() } }))).toMatchObject({ kind: 'refused', code: 'mfa_reverification_required' })
    expect(await admin.mutation(pauseRef, await pauseCommand(admin, 'treasury:foreign-env', true, { input: { environment: 'sandbox', paused: true } }))).toMatchObject({ kind: 'refused', code: 'environment_mismatch' })
    expect(await backend.run((ctx) => ctx.db.query('platformLaunch').collect())).toEqual([])
  })
})

/** Explicit healthy evidence isolates audience/approval semantics from readiness refusals. */
async function seedResumeReadiness(backend: ConvexFixtureBackend) {
  for (const [name, value] of Object.entries(validCustodyEnvironment)) vi.stubEnv(name, value)
  vi.stubEnv('AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC', '100000')
  vi.stubEnv('AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC', '10000')
  await recordTreasuryObservation(backend, 'admin-resume', { totalUnits: '110000', bufferUnits: '10000' })
  const now = Date.now()
  const context = await backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: now })
  if (context.kind !== 'available') throw new Error(context.code)
  const zero = { kind: 'matched' as const, checkedCount: 0, expectedUnits: '0', observedUnits: '0', differenceUnits: '0' }
  const snapshot = sealTreasurySnapshot({
    snapshotAt: now, environment: 'production', custodyRef: context.identity.custodyRef,
    custodyGeneration: context.identity.custodyGeneration, custodyIdentityDigest: canonicalDigest(context.identity),
    ledger: { kind: 'available', observedAt: now, availableUnits: '100000', committedUnits: '0', bufferUnits: '10000',
      payments24hUnits: '0', payments7dUnits: '0', paymentBasis: 'gross_provider_payments',
      purchasedAvailableAudUnits: '0', purchasedReservedAudUnits: '0', promotionalAvailableAudUnits: '0', promotionalReservedAudUnits: '0' },
    chain: { kind: 'available', observedAt: now, blockTimestamp: now, blockNumber: '100',
      blockHash: `0x${'a'.repeat(64)}`, totalUnits: '110000', caughtUp: true },
    referenceRate: { kind: 'unavailable', code: 'not_needed_for_payment_resume' },
    spending: { kind: 'available', observedAt: now, windowStartsAt: now - 86_400_000,
      settledUnits: '0', liabilityUnits: '0', maximumUnits: '100000' },
    inFlight: { kind: 'available', observedAt: now, count: 0, amountUnits: '0', oldestAt: null,
      overdueCount: 0, overdueUnits: '0', calls: [], listedCallsComplete: true },
    checks: { cash: { ...zero, checkedCount: 1, expectedUnits: '110000', observedUnits: '110000' },
      settlements: zero, funding: zero, reservations: zero },
    rawCashDifferenceUnits: '0', cashTimingAdjustmentUnits: '0', historyStartedAt: now,
    deposits: [], depositsComplete: true, alerts: [],
  })
  expect(await backend.mutation(internal.moneyTreasuryReconciliation.publishSnapshot, { snapshot })).toMatchObject({ kind: 'published' })
  await seedPaymentReadiness(backend)
}
