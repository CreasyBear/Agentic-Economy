import { makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminCommandArgs, AdminCommandReceipt } from '@/lib/operator/admin-console/contracts'
import type { AdminCommandWireArgs } from '../commands/contracts'
import { parseAdminProposalCommand } from '@/components/ae/admin/actions/actions.contracts'
import { convexTestWithMarketComponents, ownerAdmin, supportAdmin, type ConvexFixtureBackend } from '../../../../tests/helpers/convex-fixtures'
import { withSourceWrite } from '../../../../tests/helpers/source-write-admission'
import { readTreasuryControlState } from './treasury'

const pauseRef = makeFunctionReference<'mutation', AdminCommandWireArgs<'set_payments_paused'>, AdminCommandReceipt<'set_payments_paused'>>('adminTreasuryCommands:setPaymentsPaused')
const thresholdsRef = makeFunctionReference<'mutation', AdminCommandWireArgs<'change_treasury_thresholds'>, AdminCommandReceipt<'change_treasury_thresholds'>>('adminTreasuryCommands:changeThresholds')

async function pauseCommand(
  backend: ConvexFixtureBackend,
  key: string,
  paused: boolean,
  overrides: Partial<AdminCommandArgs<'set_payments_paused'>> = {},
) {
  const state = await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))
  return withSourceWrite('admin_operator', {
    action: 'set_payments_paused' as const,
    input: { environment: 'production' as const, paused },
    reasonCode: paused ? 'operational_pause' as const : 'operational_resume' as const,
    operationKey: key, correlationId: `${key}:correlation`, evidenceRefs: ['evidence:treasury:operator'],
    expectedStateDigest: state.launchStateDigest, approval: { kind: 'execute' as const },
    proof: { reverificationId: `${key}:proof`, firstFactorAgeMinutes: 0, secondFactorAgeMinutes: 0 },
    ...overrides,
  })
}

async function thresholdsCommand(backend: ConvexFixtureBackend, key: string, lowWaterUnits: string, targetFloatUnits: string) {
  const state = await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))
  return withSourceWrite('admin_operator', {
    action: 'change_treasury_thresholds' as const,
    input: { environment: 'production' as const, lowWaterUnits, targetFloatUnits },
    reasonCode: 'threshold_update' as const, operationKey: key, correlationId: `${key}:correlation`,
    evidenceRefs: ['evidence:treasury:operator'], expectedStateDigest: state.settingsStateDigest,
    approval: { kind: 'execute' as const },
    proof: { reverificationId: `${key}:proof`, firstFactorAgeMinutes: 0, secondFactorAgeMinutes: 0 },
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
    const args = await pauseCommand(backend, 'treasury:pause', true)
    const receipt = await admin.mutation(pauseRef, args)
    expect(receipt).toMatchObject({ kind: 'completed', code: 'payments_paused' })
    expect(await admin.mutation(pauseRef, await withSourceWrite('admin_operator', args))).toEqual(receipt)
    let state = await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))
    expect(state.launch).toMatchObject({ paymentsOpenTo: 'none', resumePaymentsOpenTo: 'admins', revision: 1 })
    expect(await backend.run((ctx) => ctx.db.query('auditEvents').withIndex('by_eventType_and_createdAt', (q) => q.eq('eventType', 'protected_action.attempt_succeeded')).collect())).toHaveLength(1)
    await admin.mutation(pauseRef, await pauseCommand(backend, 'treasury:pause-again', true))
    state = await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))
    expect(state.launch).toMatchObject({ paymentsOpenTo: 'none', resumePaymentsOpenTo: 'admins', revision: 1 })
    expect(await backend.run((ctx) => ctx.db.query('adminApprovalProposals').collect())).toEqual([])
  })

  it('rejects a changed retry key and a second command based on the same reviewed state', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_treasury-conflict')
    const first = await pauseCommand(backend, 'treasury:first-review', true)
    const second = await pauseCommand(backend, 'treasury:second-review', true)
    await admin.mutation(pauseRef, first)
    expect(await admin.mutation(pauseRef, second)).toMatchObject({ kind: 'refused', code: 'target_changed' })
    const changedRetry = await withSourceWrite('admin_operator', { ...first, input: { environment: 'production' as const, paused: false } })
    expect(await admin.mutation(pauseRef, changedRetry)).toMatchObject({ kind: 'refused', code: 'idempotency_conflict' })
    expect((await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))).launch).toMatchObject({ paymentsOpenTo: 'none', revision: 1 })
  })

  it('requires a second owner for resume and restores only the saved audience', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_treasury-proposer')
    const approver = await ownerAdmin(backend, 'user_treasury-approver')
    await admin.mutation(pauseRef, await pauseCommand(backend, 'treasury:stop', true))
    expect(await admin.mutation(pauseRef, await pauseCommand(backend, 'treasury:resume-direct', false))).toMatchObject({ kind: 'refused', code: 'approval_required' })
    const command = await pauseCommand(backend, 'treasury:resume-proposal', false, { approval: { kind: 'propose' } })
    const proposal = await admin.mutation(pauseRef, command)
    expect(proposal.kind).toBe('proposed')
    if (proposal.kind !== 'proposed') throw new Error('proposal_expected')
    const stored = await backend.run((ctx) => ctx.db.query('adminApprovalProposals').withIndex('by_proposalRef', (q) => q.eq('proposalRef', proposal.proposalRef)).unique())
    expect(parseAdminProposalCommand('set_payments_paused', stored?.commandJson ?? '')).toMatchObject({ input: { paused: false }, expectedStateDigest: command.expectedStateDigest })
    expect((await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))).launch.paymentsOpenTo).toBe('none')
    const approved = await pauseCommand(backend, 'treasury:resume-approve', false, {
      expectedStateDigest: command.expectedStateDigest,
      approval: { kind: 'approve', proposalRef: proposal.proposalRef },
    })
    expect(await approver.mutation(pauseRef, approved)).toMatchObject({ kind: 'completed', code: 'payments_resumed' })
    expect((await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))).launch).toMatchObject({ paymentsOpenTo: 'admins', resumePaymentsOpenTo: 'admins', revision: 2 })
  })

  it('preserves an already open everyone audience through pause and resume', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_treasury-audience')
    await backend.run((ctx) => ctx.db.insert('platformLaunch', { environment: 'production', paymentsOpenTo: 'everyone', resumePaymentsOpenTo: 'admins', revision: 2, updatedAt: 1 }))
    await admin.mutation(pauseRef, await pauseCommand(backend, 'treasury:audience-stop', true))
    await admin.mutation(pauseRef, await pauseCommand(backend, 'treasury:audience-resume', false))
    expect((await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))).launch.paymentsOpenTo).toBe('everyone')
  })

  it('cannot widen a currently active audience by submitting resume', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_treasury-no-widen')
    await backend.run((ctx) => ctx.db.insert('platformLaunch', { environment: 'production', paymentsOpenTo: 'admins', resumePaymentsOpenTo: 'everyone', revision: 2, updatedAt: 1 }))
    await admin.mutation(pauseRef, await pauseCommand(backend, 'treasury:no-widen', false))
    expect((await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))).launch).toMatchObject({ paymentsOpenTo: 'admins', revision: 2 })
  })

  it('refuses a missing reviewed digest before creating a proposal', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_treasury-no-digest')
    await ownerAdmin(backend, 'user_treasury-other-owner')
    const signed = await pauseCommand(backend, 'treasury:no-digest', false, { approval: { kind: 'propose' } })
    const { expectedStateDigest: _digest, sourceWrite: _signed, sourceWriteRequest: _request, ...unsigned } = signed
    expect(await admin.mutation(pauseRef, await withSourceWrite('admin_operator', unsigned))).toMatchObject({ kind: 'refused', code: 'target_changed' })
    expect(await backend.run((ctx) => ctx.db.query('adminApprovalProposals').collect())).toEqual([])
    expect(await backend.run((ctx) => ctx.db.query('platformLaunch').collect())).toEqual([])
  })

  it('refuses approval of a stale proposal without consuming that proposal', async () => {
    const backend = convexTestWithMarketComponents()
    const proposer = await ownerAdmin(backend, 'user_treasury-stale-proposer')
    const approver = await ownerAdmin(backend, 'user_treasury-stale-approver')
    await proposer.mutation(pauseRef, await pauseCommand(backend, 'treasury:stale-stop', true))
    const command = await pauseCommand(backend, 'treasury:stale-proposal', false, { approval: { kind: 'propose' } })
    const proposal = await proposer.mutation(pauseRef, command)
    if (proposal.kind !== 'proposed') throw new Error('proposal_expected')
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('platformLaunch').withIndex('by_environment', (q) => q.eq('environment', 'production')).unique()
      if (row === null) throw new Error('launch_expected')
      await ctx.db.patch(row._id, { revision: row.revision + 1 })
    })
    const approve = await pauseCommand(backend, 'treasury:stale-approve', false, { expectedStateDigest: command.expectedStateDigest, approval: { kind: 'approve', proposalRef: proposal.proposalRef } })
    expect(await approver.mutation(pauseRef, approve)).toMatchObject({ kind: 'refused', code: 'target_changed' })
    expect((await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))).launch.paymentsOpenTo).toBe('none')
    expect((await backend.run((ctx) => ctx.db.query('adminApprovalProposals').withIndex('by_proposalRef', (q) => q.eq('proposalRef', proposal.proposalRef)).unique()))?.status).toBe('awaiting_second_approval')
  })

  it('changes informational thresholds without second approval and keeps launch authority unchanged', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_treasury-settings')
    await ownerAdmin(backend, 'user_treasury-settings-second')
    const before = await backend.run((ctx) => readTreasuryControlState(ctx, 'production'))
    const args = await thresholdsCommand(backend, 'treasury:settings', '1000000', '4000000')
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
    expect(await admin.mutation(thresholdsRef, await thresholdsCommand(backend, 'treasury:invalid', low, target))).toMatchObject({ kind: 'refused', code: 'treasury_thresholds_invalid' })
    expect(await backend.run((ctx) => ctx.db.query('moneyTreasurySettings').collect())).toEqual([])
  })

  it('refuses support authority, stale MFA, and foreign deployment environments without changing launch state', async () => {
    const backend = convexTestWithMarketComponents()
    const support = await supportAdmin(backend, 'user_treasury-support')
    const admin = await ownerAdmin(backend, 'user_treasury-authority')
    expect(await support.mutation(pauseRef, await pauseCommand(backend, 'treasury:support', true))).toMatchObject({ kind: 'refused', code: 'action_not_allowed' })
    expect(await admin.mutation(pauseRef, await pauseCommand(backend, 'treasury:stale-mfa', true, { proof: { reverificationId: 'treasury:stale-proof', firstFactorAgeMinutes: 10, secondFactorAgeMinutes: 10 } }))).toMatchObject({ kind: 'refused', code: 'mfa_reverification_required' })
    expect(await admin.mutation(pauseRef, await pauseCommand(backend, 'treasury:foreign-env', true, { input: { environment: 'sandbox', paused: true } }))).toMatchObject({ kind: 'refused', code: 'environment_mismatch' })
    expect(await backend.run((ctx) => ctx.db.query('platformLaunch').collect())).toEqual([])
  })
})
