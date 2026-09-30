import { makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminCommandArgs, AdminCommandReceipt } from '@/lib/operator/admin-console/contracts'
import { internal } from '../../../convex/_generated/api'
import type { AdminCommandWireArgs } from '../../../convex/lib/adminConsole/commands/contracts'
import { readTreasuryControlState } from '../../../convex/lib/adminConsole/actions/treasury'
import { readAgentPaymentAdmission } from '../../../convex/lib/money/treasury/paymentAdmission'
import { convexTestWithMarketComponents, ownerAdmin, type ConvexFixtureBackend } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'
import { observeHealthyReadiness, publishCurrentTool, seedAgent, seedCommercialPolicies, testRef } from '../../helpers/quote-fixtures'

const pauseRef = makeFunctionReference<'mutation', AdminCommandWireArgs<'set_payments_paused'>, AdminCommandReceipt<'set_payments_paused'>>('adminTreasuryCommands:setPaymentsPaused')

// Requires real canonical authority and sealed commands. Ensures one effect per
// operation, one winner per reviewed state, and only the current human root's
// Admin role admits paid preparation. Refusal preserves launch/purchase state.
// These tests do not substitute provider calls or native ledger evidence.
beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production'))
afterEach(() => vi.unstubAllEnvs())

async function pauseCommand(
  backend: ConvexFixtureBackend,
  key: string,
  paused: boolean,
  overrides: Partial<AdminCommandArgs<'set_payments_paused'>> = {},
) {
  const state = await backend.run(ctx => readTreasuryControlState(ctx, 'production'))
  return await withSourceWrite('admin_operator', {
    action: 'set_payments_paused' as const, input: { environment: 'production' as const, paused },
    reasonCode: paused ? 'operational_pause' as const : 'operational_resume' as const,
    operationKey: key, correlationId: `${key}:correlation`, evidenceRefs: ['evidence:independent-treasury-controls'],
    expectedStateDigest: state.launchStateDigest, approval: { kind: 'execute' as const },
    proof: { reverificationId: `${key}:proof`, firstFactorAgeMinutes: 0, secondFactorAgeMinutes: 0 },
    ...overrides,
  })
}

async function controlsSnapshot(backend: ConvexFixtureBackend) {
  return await backend.run(async ctx => ({
    state: await readTreasuryControlState(ctx, 'production'),
    proposals: await ctx.db.query('adminApprovalProposals').collect(),
    proofs: await ctx.db.query('consequenceProofUses').collect(),
    effects: await ctx.db.query('auditEvents')
      .withIndex('by_eventType_and_createdAt', q => q.eq('eventType', 'protected_action.attempt_succeeded')).collect(),
  }))
}

async function rootAccount(backend: ConvexFixtureBackend, accountRef: string) {
  return await backend.run(async ctx => {
    const account = await ctx.db.query('accounts').withIndex('by_accountRef', q => q.eq('accountRef', accountRef)).unique()
    if (account === null) throw new Error('fixture_account_missing')
    const ownership = await ctx.db.query('accountOwnerships').withIndex('by_ownershipRef', q => q.eq('ownershipRef', account.currentOwnershipRef)).unique()
    if (ownership === null) throw new Error('fixture_ownership_missing')
    const binding = await ctx.db.query('externalIdentityBindings')
      .withIndex('by_principalRef_and_lifecycle', q => q.eq('principalRef', ownership.ownerPrincipalRef).eq('lifecycle', 'active'))
      .filter(q => q.eq(q.field('providerNamespace'), 'clerk/user')).unique()
    if (binding === null) throw new Error('fixture_human_binding_missing')
    return { principalRef: ownership.ownerPrincipalRef, ownershipId: ownership._id, tokenIdentifier: binding.providerIdentifier }
  })
}

async function paidAuthorityFixture(suffix: string, rootIsAdmin: boolean) {
  const backend = convexTestWithMarketComponents()
  const tool = await publishCurrentTool(backend, suffix)
  await seedCommercialPolicies(backend, suffix, Date.now())
  const root = await rootAccount(backend, tool.accountRef)
  await ownerAdmin(backend, `user_${suffix}-intermediate`)
  const intermediate = await backend.run(async ctx => {
    const binding = await ctx.db.query('externalIdentityBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', q => q.eq('providerNamespace', 'clerk/user').eq('providerIdentifier', `token_${suffix}-intermediate`)).unique()
    if (binding === null) throw new Error('fixture_intermediate_missing')
    return binding.principalRef
  })
  const agent = await seedAgent(backend, { canonicalAccountRef: tool.accountRef }, tool.toolRef, `${suffix}-agent`, '20000000')
  const parentRef = testRef('grt', `${suffix}-root-delegation`)
  await backend.run(async ctx => {
    const launch = await ctx.db.query('platformLaunch').withIndex('by_environment', q => q.eq('environment', 'production')).unique()
    const leaf = await ctx.db.query('authorityDelegationGrants').withIndex('by_grantRef', q => q.eq('grantRef', agent.grant.grantRef)).unique()
    if (launch === null || leaf === null) throw new Error('fixture_launch_or_leaf_missing')
    await ctx.db.patch(launch._id, { paymentsOpenTo: 'admins', resumePaymentsOpenTo: 'admins' })
    const { _id: _leafId, _creationTime: _created, ...grant } = leaf
    await ctx.db.insert('authorityDelegationGrants', {
      ...grant, grantRef: parentRef, actorPrincipalRef: root.principalRef, subjectPrincipalRef: intermediate,
      // A child delegation must expire strictly before its parent.
      expiresAt: leaf.expiresAt + 1_000,
      createdBy: { ...leaf.createdBy, actorPrincipalRef: root.principalRef },
    })
    await ctx.db.patch(leaf._id, {
      actorPrincipalRef: intermediate, parentGrantRef: parentRef, parentGeneration: 1,
      createdBy: { ...leaf.createdBy, actorPrincipalRef: intermediate },
    })
    if (rootIsAdmin) await ctx.db.insert('adminMemberships', {
      clerkUserId: `user_${suffix}-root`, tokenIdentifier: root.tokenIdentifier,
      role: 'owner_admin', state: 'active', grantedBy: 'fixture', grantedAt: 1,
    })
  })
  await backend.finishAllScheduledFunctions(() => undefined)
  await observeHealthyReadiness(backend, tool, suffix)
  const paymentAuthority = { environment: 'production' as const, accountRef: tool.accountRef,
    grantRef: agent.grant.grantRef, grantGeneration: agent.grant.generation }
  const prepare = async (key: string) => await backend.mutation(internal.capabilityQuotes.prepareFinancialSubjects,
    await withSourceWrite('protected_action', {
      operationKey: `independent-prepare:${key}`, correlationId: `independent-prepare:${key}`,
      principal: agent.principal, toolRef: tool.toolRef, input: { request: 'Perth' },
    }))
  const purchases = async () => await backend.run(async ctx => ({
    quotes: await ctx.db.query('capabilityQuotes').collect(), calls: await ctx.db.query('capabilityCalls').collect(),
  }))
  return { backend, root, intermediate, parentRef, paymentAuthority, prepare, purchases }
}

describe('independent treasury control transaction evaluation', () => {
  it('concurrent exact pause retries share one receipt, launch revision, proof and audit', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_independent-pause-duplicate')
    await ownerAdmin(backend, 'user_independent-pause-peer')
    const command = await pauseCommand(backend, 'independent:pause-duplicate', true)
    const retry = await withSourceWrite('admin_operator', command)
    const [first, second] = await Promise.all([admin.mutation(pauseRef, command), admin.mutation(pauseRef, retry)])
    expect(first).toMatchObject({ kind: 'completed', code: 'payments_paused' })
    expect(second).toEqual(first)
    const snapshot = await controlsSnapshot(backend)
    expect(snapshot.state.launch).toMatchObject({ paymentsOpenTo: 'none', resumePaymentsOpenTo: 'admins', revision: 1 })
    expect(snapshot.effects).toHaveLength(1)
    expect(snapshot.proofs).toHaveLength(1)
    expect(snapshot.proposals).toEqual([])
  })

  it('different concurrent pause operations on one reviewed state have exactly one winner', async () => {
    const backend = convexTestWithMarketComponents()
    const firstOwner = await ownerAdmin(backend, 'user_independent-pause-first')
    const secondOwner = await ownerAdmin(backend, 'user_independent-pause-second')
    const first = await pauseCommand(backend, 'independent:pause-first', true)
    const second = await pauseCommand(backend, 'independent:pause-second', true)
    const receipts = await Promise.all([firstOwner.mutation(pauseRef, first), secondOwner.mutation(pauseRef, second)])
    expect(receipts.filter(receipt => receipt.kind === 'completed')).toHaveLength(1)
    expect(receipts.filter(receipt => receipt.kind === 'refused')).toMatchObject([{ code: 'target_changed' }])
    const snapshot = await controlsSnapshot(backend)
    expect(snapshot.state.launch).toMatchObject({ paymentsOpenTo: 'none', resumePaymentsOpenTo: 'admins', revision: 1 })
    expect(snapshot.effects).toHaveLength(1)
    expect(snapshot.proofs).toHaveLength(1)
  })

  it('duplicate proposals and competing second owners resume once to the saved everyone audience', async () => {
    const backend = convexTestWithMarketComponents()
    const proposer = await ownerAdmin(backend, 'user_independent-resume-proposer')
    const approver = await ownerAdmin(backend, 'user_independent-resume-approver')
    const peer = await ownerAdmin(backend, 'user_independent-resume-peer')
    await backend.run(ctx => ctx.db.insert('platformLaunch', {
      environment: 'production', paymentsOpenTo: 'everyone', resumePaymentsOpenTo: 'admins', revision: 4, updatedAt: 1,
    }))
    expect(await proposer.mutation(pauseRef, await pauseCommand(backend, 'independent:resume-stop', true)))
      .toMatchObject({ kind: 'completed', code: 'payments_paused' })
    const command = await pauseCommand(backend, 'independent:resume-propose', false, { approval: { kind: 'propose' } })
    const proposals = await Promise.all([proposer.mutation(pauseRef, command), proposer.mutation(pauseRef, await withSourceWrite('admin_operator', command))])
    expect(proposals[0]).toMatchObject({ kind: 'proposed' })
    expect(proposals[1]).toEqual(proposals[0])
    const proposal = proposals[0]
    if (proposal?.kind !== 'proposed') throw new Error('proposal_expected')
    expect((await controlsSnapshot(backend)).proposals).toHaveLength(1)
    const first = await pauseCommand(backend, 'independent:resume-approve', false, { approval: { kind: 'approve', proposalRef: proposal.proposalRef } })
    const second = await pauseCommand(backend, 'independent:resume-peer', false, { approval: { kind: 'approve', proposalRef: proposal.proposalRef } })
    const receipts = await Promise.all([approver.mutation(pauseRef, first), peer.mutation(pauseRef, second)])
    expect(receipts.filter(receipt => receipt.kind === 'completed')).toHaveLength(1)
    expect(receipts.filter(receipt => receipt.kind === 'refused')).toMatchObject([{ code: 'target_changed' }])
    const snapshot = await controlsSnapshot(backend)
    expect(snapshot.state.launch).toMatchObject({ paymentsOpenTo: 'everyone', resumePaymentsOpenTo: 'everyone', revision: 6 })
    expect(snapshot.proposals).toMatchObject([{ status: 'approved' }])
    expect(snapshot.effects).toHaveLength(2)
    const winner = receipts[0]?.kind === 'completed' ? { owner: approver, command: first, receipt: receipts[0] }
      : { owner: peer, command: second, receipt: receipts[1] }
    expect(await winner.owner.mutation(pauseRef, await withSourceWrite('admin_operator', winner.command))).toEqual(winner.receipt)
    expect(await controlsSnapshot(backend)).toEqual(snapshot)
  })

  it('stale MFA and stale reviewed state cannot create launch, proposal or proof effects', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_independent-refusal-first')
    await ownerAdmin(backend, 'user_independent-refusal-second')
    const before = await controlsSnapshot(backend)
    const fresh = await pauseCommand(backend, 'independent:refusal-control', true)
    const staleProof = await pauseCommand(backend, 'independent:refusal-mfa', false, {
      approval: { kind: 'propose' },
      proof: { reverificationId: 'independent:stale-proof', firstFactorAgeMinutes: 0, secondFactorAgeMinutes: 10 },
    })
    expect(await admin.mutation(pauseRef, staleProof)).toMatchObject({ kind: 'refused', code: 'mfa_reverification_required' })
    const staleState = await pauseCommand(backend, 'independent:refusal-state', false, {
      expectedStateDigest: 'sha256:' + '0'.repeat(64), approval: { kind: 'propose' },
    })
    expect(await admin.mutation(pauseRef, staleState)).toMatchObject({ kind: 'refused', code: 'target_changed' })
    expect(await controlsSnapshot(backend)).toEqual(before)
    expect(await admin.mutation(pauseRef, fresh)).toMatchObject({ kind: 'completed', code: 'payments_paused' })
    expect((await controlsSnapshot(backend)).state.launch.paymentsOpenTo).toBe('none')
  })
})

describe('independent production paid preparation authority evaluation', () => {
  it('an active intermediate Admin cannot substitute for the nonadmin human root issuer', async () => {
    const fixture = await paidAuthorityFixture('independent-root-role', false)
    const before = await fixture.purchases()
    expect(await fixture.prepare('root-denied')).toMatchObject({ kind: 'refused', code: 'payments_admins_only' })
    expect(await fixture.purchases()).toEqual(before)
    await fixture.backend.run(ctx => ctx.db.insert('adminMemberships', {
      clerkUserId: 'user_independent-root-role', tokenIdentifier: fixture.root.tokenIdentifier,
      role: 'owner_admin', state: 'active', grantedBy: 'fixture', grantedAt: 1,
    }))
    expect(await fixture.prepare('root-allowed')).toMatchObject({ kind: 'prepared' })
  })

  it('revoking a canonical ancestor stops the same previously allowed paid preparation', async () => {
    const fixture = await paidAuthorityFixture('independent-revoked-ancestor', true)
    expect(await fixture.prepare('ancestor-before')).toMatchObject({ kind: 'prepared' })
    const before = await fixture.purchases()
    await fixture.backend.run(async ctx => {
      const parent = await ctx.db.query('authorityDelegationGrants').withIndex('by_grantRef', q => q.eq('grantRef', fixture.parentRef)).unique()
      if (parent === null) throw new Error('fixture_parent_missing')
      await ctx.db.patch(parent._id, {
        lifecycle: 'revoked', revokedAt: Date.now(),
        revokedBy: { ...parent.createdBy, correlationRef: 'independent:revoke-parent', idempotencyRef: 'independent:revoke-parent' },
      })
    })
    expect(await fixture.backend.run(ctx => readAgentPaymentAdmission(ctx, fixture.paymentAuthority, Date.now())))
      .toEqual({ kind: 'refused', code: 'payments_admins_only' })
    expect(await fixture.prepare('ancestor-after')).toMatchObject({ kind: 'refused', code: 'grant_not_found' })
    expect(await fixture.purchases()).toEqual(before)
  })

  it('an active former root Admin cannot admit paid preparation after current ownership changes', async () => {
    const fixture = await paidAuthorityFixture('independent-current-owner', true)
    expect(await fixture.prepare('ownership-before')).toMatchObject({ kind: 'prepared' })
    const before = await fixture.purchases()
    await fixture.backend.run(ctx => ctx.db.patch(fixture.root.ownershipId, { ownerPrincipalRef: fixture.intermediate }))
    expect(await fixture.backend.run(ctx => readAgentPaymentAdmission(ctx, fixture.paymentAuthority, Date.now())))
      .toEqual({ kind: 'refused', code: 'payments_admins_only' })
    expect(await fixture.prepare('ownership-after')).toMatchObject({ kind: 'refused' })
    expect(await fixture.purchases()).toEqual(before)
  })
})
