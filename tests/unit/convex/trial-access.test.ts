import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { TRIAL_AMOUNT_UNITS, TRIAL_DURATION_MS, promotionalCreditReference } from '@/modules/money/public'
import type { AdminActionInput, AdminCommandArgs } from '@/lib/operator/admin-console/contracts'
import { convexTestWithMarketComponents, ownerAdmin, nonAdmin, supportAdmin, testMfaConsequenceProof } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'
import { accountHasTrialAccess } from '../../../convex/lib/money/trials/authority'
import { processHandler } from '../../../convex/lib/money/promotionalCredit/lifecycle'
import type { ActionCtx } from '../../../convex/_generated/server'

const clerk = vi.hoisted(() => ({ getUser: vi.fn(), createInvitation: vi.fn(), getInvitationList: vi.fn() }))
vi.mock('@clerk/backend', () => ({ createClerkClient: () => ({ users: { getUser: clerk.getUser }, invitations: {
  createInvitation: clerk.createInvitation, getInvitationList: clerk.getInvitationList,
} }) }))

type Backend = ReturnType<typeof convexTestWithMarketComponents>

function command(input: AdminActionInput['issue_trial'], key: string, actor = 'user_trial_admin',
  approval: AdminCommandArgs<'issue_trial'>['approval'] = { kind: 'execute' }) {
  const base = { action: 'issue_trial' as const, input, operationKey: key, correlationId: key,
    reasonCode: 'onboarding' as const, evidenceRefs: ['evidence:trial-onboarding'], approval }
  const digest = canonicalDigest({ scope: 'admin_operator', action: base.action, input,
    reasonCode: base.reasonCode, evidenceRefs: base.evidenceRefs })
  return { ...base, proof: testMfaConsequenceProof({ subject: actor }, digest) }
}

async function setup() {
  const backend = convexTestWithMarketComponents()
  const admin = await ownerAdmin(backend, 'user_trial_admin')
  const buyer = await nonAdmin(backend, 'user_trial_buyer')
  const account = await backend.run(ctx => ctx.db.query('accounts').filter(q => q.eq(q.field('displayName'), 'user_trial_buyer account')).unique())
  if (account === null) throw new Error('buyer_missing')
  const ownership = await backend.run(ctx => ctx.db.query('accountOwnerships').withIndex('by_ownershipRef', q => q.eq('ownershipRef', account.currentOwnershipRef)).unique())
  if (ownership === null) throw new Error('ownership_missing')
  const approve = async (recipient: AdminActionInput['issue_trial']['recipient'], key = 'trial:approved') => {
    const signed = await withSourceWrite('admin_operator', command({ environment: 'sandbox', recipient }, key))
    return { signed, receipt: await admin.mutation(api.trialAccess.issue, signed) }
  }
  return { backend, admin, buyer, account, ownership, approve }
}

async function rows(backend: Backend) {
  return await backend.run(async ctx => ({ offers: await ctx.db.query('moneyTrialOffers').collect(),
    grants: await ctx.db.query('moneyPromotionalGrants').collect() }))
}
async function book(backend: Backend, grantRef: string) {
  const work = await backend.mutation(internal.moneyPromotionalCredit.claimWork, { grantRef })
  if (work === null || work.kind === 'refused') throw new Error('grant_work_refused')
  return { ...work, transactionRefs: [promotionalCreditReference(grantRef, 1, 'grant')] }
}

beforeEach(() => {
  vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
  vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_trial_boundary')
  vi.stubEnv('AE_SITE_URL', 'http://127.0.0.1:3024')
  clerk.getUser.mockReset().mockImplementation(async (id: string) => ({ id,
    primaryEmailAddress: { emailAddress: 'buyer@example.com', verification: { status: 'verified' } } }))
  clerk.createInvitation.mockReset().mockResolvedValue({ id: 'inv_trial' })
  clerk.getInvitationList.mockReset().mockResolvedValue({ data: [], totalCount: 0 })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('approved Account trials', () => {
  it('refuses signed-out claims before contacting Clerk', async () => {
    const f = await setup()
    expect(await f.backend.action(api.trialAccessActions.claim, {}))
      .toEqual({ kind: 'refused', code: 'authentication_required' })
    expect(clerk.getUser).not.toHaveBeenCalled()
    expect(await rows(f.backend)).toEqual({ offers: [], grants: [] })
  })

  it('expires an unclaimed invitation without starting a grant or access period', async () => {
    const f = await setup()
    await f.approve({ kind: 'email', email: 'buyer@example.com' })
    const activation = (await rows(f.backend)).offers[0]?.activation
    if (activation?.kind !== 'unclaimed') throw new Error('unclaimed_expected')
    vi.useFakeTimers()
    vi.setSystemTime(activation.claimBy)
    const freshSession = await nonAdmin(f.backend, 'user_trial_buyer')
    expect(await freshSession.action(api.trialAccessActions.claim, {})).toEqual({ kind: 'refused', code: 'trial_expired' })
    expect((await rows(f.backend)).grants).toEqual([])
    expect((await rows(f.backend)).offers[0]?.activation).toEqual(activation)
  })

  it('keeps credit pending after a lost ledger acknowledgement and recovers the original grant once', async () => {
    const f = await setup()
    const { signed, receipt } = await f.approve({ kind: 'account', accountRef: f.account.accountRef })
    const grant = (await rows(f.backend)).grants[0]
    if (grant === undefined) throw new Error('grant_missing')
    const nativeAction = vi.fn().mockResolvedValueOnce({ kind: 'outcome_unknown' })
      .mockResolvedValue({ kind: 'completed', transactionRefs: [promotionalCreditReference(grant.grantRef, 1, 'grant')] })
    const ctx = {
      runMutation: (reference: Parameters<typeof f.backend.mutation>[0], args: never) => f.backend.mutation(reference, args),
      runAction: nativeAction,
    } as unknown as ActionCtx
    expect(await processHandler(ctx, { grantRef: grant.grantRef })).toBe(false)
    expect((await rows(f.backend)).grants[0]).toMatchObject({ bookingState: 'pending', availableUnits: '0' })
    expect(await processHandler(ctx, { grantRef: grant.grantRef })).toBe(true)
    expect(await processHandler(ctx, { grantRef: grant.grantRef })).toBe(true)
    expect(nativeAction).toHaveBeenCalledTimes(2)
    expect(nativeAction.mock.calls[1]).toEqual(nativeAction.mock.calls[0])
    expect((await rows(f.backend)).grants).toHaveLength(1)
    expect((await rows(f.backend)).grants[0]).toMatchObject({ bookingState: 'booked', availableUnits: TRIAL_AMOUNT_UNITS,
      createdAt: grant.createdAt, expiresAt: grant.expiresAt })
    expect(await f.admin.mutation(api.trialAccess.issue, signed)).toEqual(receipt)
  })

  it('allows public signup without granting credit or purchase access', async () => {
    const f = await setup()
    expect(await f.buyer.action(api.trialAccessActions.claim, {})).toEqual({ kind: 'refused', code: 'trial_not_approved' })
    expect(await rows(f.backend)).toEqual({ offers: [], grants: [] })
    expect(await f.backend.run(ctx => accountHasTrialAccess(ctx, { environment: 'sandbox', accountRef: f.account.accountRef,
      ownerPrincipalRef: f.ownership.ownerPrincipalRef, now: Date.now() }))).toBe(false)
    expect(await f.buyer.query(api.trialAccess.readAdmin, {})).toEqual({ kind: 'refused' })
  })

  it('requires owner-Admin, fresh MFA and matching environment before approval', async () => {
    const f = await setup()
    const support = await supportAdmin(f.backend, 'user_trial_support')
    const input = { environment: 'sandbox' as const, recipient: { kind: 'account' as const, accountRef: f.account.accountRef } }
    expect(await support.mutation(api.trialAccess.issue, await withSourceWrite('admin_operator', command(input, 'trial:support', 'user_trial_support'))))
      .toMatchObject({ kind: 'refused', code: 'action_not_allowed' })
    const { proof: _proof, ...noProof } = command(input, 'trial:no-proof')
    expect(await f.admin.mutation(api.trialAccess.issue, await withSourceWrite('admin_operator', noProof)))
      .toMatchObject({ kind: 'refused', code: 'mfa_reverification_required' })
    expect(await f.admin.mutation(api.trialAccess.issue, await withSourceWrite('admin_operator', command({ ...input, environment: 'production' }, 'trial:wrong-env'))))
      .toMatchObject({ kind: 'refused', code: 'environment_mismatch' })
    expect(await rows(f.backend)).toEqual({ offers: [], grants: [] })
  })

  it('requires distinct second approval without creating an offer or grant at proposal time', async () => {
    const f = await setup()
    const approver = await ownerAdmin(f.backend, 'user_trial_approver')
    const input = { environment: 'sandbox' as const, recipient: { kind: 'email' as const, email: 'buyer@example.com' } }
    expect(await f.admin.mutation(api.trialAccess.issue, await withSourceWrite('admin_operator', command(input, 'trial:direct'))))
      .toMatchObject({ kind: 'refused', code: 'approval_required' })
    const proposed = await f.admin.mutation(api.trialAccess.issue, await withSourceWrite('admin_operator', command(input, 'trial:propose', 'user_trial_admin', { kind: 'propose' })))
    if (proposed.kind !== 'proposed') throw new Error('proposal_missing')
    expect(await rows(f.backend)).toEqual({ offers: [], grants: [] })
    const approve = { kind: 'approve' as const, proposalRef: proposed.proposalRef }
    expect(await f.admin.mutation(api.trialAccess.issue, await withSourceWrite('admin_operator', command(input, 'trial:self', 'user_trial_admin', approve))))
      .toMatchObject({ kind: 'refused', code: 'approval_same_actor' })
    expect(await approver.mutation(api.trialAccess.issue, await withSourceWrite('admin_operator', command(input, 'trial:second', 'user_trial_approver', approve))))
      .toMatchObject({ kind: 'completed', code: 'trial_approved' })
    expect((await rows(f.backend)).offers).toHaveLength(1)
  })

  it('manual approval initializes A$10 once, then identical confirmations and retries do not regrant', async () => {
    const f = await setup()
    const { signed, receipt } = await f.approve({ kind: 'account', accountRef: f.account.accountRef })
    expect(receipt).toMatchObject({ kind: 'completed', code: 'trial_approved' })
    expect(await f.admin.mutation(api.trialAccess.issue, signed)).toEqual(receipt)
    const initial = await rows(f.backend)
    const grant = initial.grants[0]
    if (grant === undefined) throw new Error('grant_missing')
    expect(initial.grants).toHaveLength(1)
    expect(grant).toMatchObject({ amountUnits: TRIAL_AMOUNT_UNITS, availableUnits: '0', bookingState: 'pending' })
    expect(grant.expiresAt - grant.createdAt).toBe(TRIAL_DURATION_MS)
    expect(await f.buyer.action(api.trialAccessActions.claim, {})).toMatchObject({ kind: 'granted', grantRef: grant.grantRef, booking: 'pending' })
    expect(clerk.getUser).not.toHaveBeenCalled()
    const work = await book(f.backend, grant.grantRef)
    expect(await Promise.all([f.backend.mutation(internal.moneyPromotionalCredit.finishWork, work), f.backend.mutation(internal.moneyPromotionalCredit.finishWork, work)]))
      .toEqual([true, true])
    expect(await f.admin.mutation(api.trialAccess.issue, signed)).toEqual(receipt)
    expect((await f.approve({ kind: 'account', accountRef: f.account.accountRef }, 'trial:another-key')).receipt)
      .toMatchObject({ kind: 'refused', code: 'trial_already_approved' })
    expect((await rows(f.backend)).grants).toHaveLength(1)
    expect((await rows(f.backend)).grants[0]).toMatchObject({ availableUnits: TRIAL_AMOUNT_UNITS, bookingState: 'booked' })
  })

  it('verified email activation starts the frozen 30-day period and concurrent claims share one grant', async () => {
    const f = await setup()
    await f.approve({ kind: 'email', email: 'buyer@example.com' })
    expect((await rows(f.backend)).grants).toEqual([])
    const claimed = await Promise.all([f.buyer.action(api.trialAccessActions.claim, {}), f.buyer.action(api.trialAccessActions.claim, {})])
    expect(claimed[0]).toMatchObject({ kind: 'granted', booking: 'pending' })
    expect(claimed[1]).toEqual(claimed[0])
    const state = await rows(f.backend)
    expect(state.grants).toHaveLength(1)
    expect(state.offers[0]?.activation).toMatchObject({ kind: 'granted', accountRef: f.account.accountRef })
    expect(state.grants[0]?.amountUnits).toBe(TRIAL_AMOUNT_UNITS)
    expect(clerk.getUser).toHaveBeenCalledWith('user_trial_buyer')
    expect(await f.backend.run(ctx => ctx.db.query('adminMemberships').withIndex('by_clerkUserId_and_state', q => q.eq('clerkUserId', 'user_trial_buyer').eq('state', 'active')).take(1)))
      .toEqual([])
  })

  it.each(['unverified', 'different_email', 'wrong_user', 'provider_failure'] as const)('does not create credit for %s', async fault => {
    const f = await setup()
    await f.approve({ kind: 'email', email: 'buyer@example.com' })
    if (fault === 'provider_failure') clerk.getUser.mockRejectedValueOnce(new Error('provider unavailable'))
    else clerk.getUser.mockResolvedValueOnce({ id: fault === 'wrong_user' ? 'other' : 'user_trial_buyer', primaryEmailAddress: {
      emailAddress: fault === 'different_email' ? 'other@example.com' : 'buyer@example.com', verification: { status: fault === 'unverified' ? 'unverified' : 'verified' },
    } })
    expect(await f.buyer.action(api.trialAccessActions.claim, {})).toMatchObject({ kind: 'refused' })
    expect((await rows(f.backend)).grants).toEqual([])
  })

  it('revalidates identity and ownership after Clerk verification', async () => {
    const f = await setup()
    await f.approve({ kind: 'email', email: 'buyer@example.com' })
    const context = await f.buyer.mutation(internal.trialAccess.prepareClaim, {})
    if (context.kind !== 'verify_email') throw new Error('claim_context_missing')
    const args = { tokenIdentifier: context.tokenIdentifier, accountRef: context.accountRef, ownerPrincipalRef: context.ownerPrincipalRef, verifiedEmail: 'buyer@example.com' }
    expect(await f.admin.mutation(internal.trialAccess.finishClaim, args)).toMatchObject({ kind: 'refused' })
    await f.backend.run(ctx => ctx.db.patch(f.ownership._id, { lifecycle: 'ended' }))
    expect(await f.buyer.mutation(internal.trialAccess.finishClaim, args)).toMatchObject({ kind: 'refused' })
    expect((await rows(f.backend)).grants).toEqual([])
  })

  it('manual and invited activation compete for a single Account trial', async () => {
    const f = await setup()
    await f.approve({ kind: 'email', email: 'buyer@example.com' })
    const results = await Promise.all([
      f.approve({ kind: 'account', accountRef: f.account.accountRef }, 'trial:manual-race'),
      f.buyer.action(api.trialAccessActions.claim, {}),
    ])
    expect(results).toHaveLength(2)
    expect((await rows(f.backend)).grants).toHaveLength(1)
    expect((await rows(f.backend)).offers.filter(offer => offer.activation.kind === 'granted')).toHaveLength(1)
  })

  it.each(['audit', 'receipt', 'terms'] as const)('refuses booking after original approval %s is altered', async fault => {
    const f = await setup()
    await f.approve({ kind: 'account', accountRef: f.account.accountRef })
    const grant = (await rows(f.backend)).grants[0]
    if (grant === undefined) throw new Error('grant_missing')
    const work = await book(f.backend, grant.grantRef)
    await f.backend.run(async ctx => {
      if (fault === 'terms') return await ctx.db.patch(grant._id, { amountUnits: '20000000' })
      if (fault === 'audit') {
        const audit = await ctx.db.query('auditEvents').withIndex('by_eventId', q => q.eq('eventId', grant.auditEventRef ?? '')).unique()
        if (audit !== null) await ctx.db.delete(audit._id)
      } else {
        const operation = await ctx.db.query('operationKeys').withIndex('by_actor_operation_key', q => q.eq('actorRef', grant.actorRef).eq('operationName', 'admin:issue_trial').eq('key', grant.operationKey)).unique()
        if (operation !== null) await ctx.db.patch(operation._id, { resultHash: canonicalDigest('forged') })
      }
    })
    expect(await f.backend.mutation(internal.moneyPromotionalCredit.claimWork, { grantRef: grant.grantRef }))
      .toEqual({ kind: 'refused', code: 'promotional_credit_authority_invalid' })
    expect(await f.backend.mutation(internal.moneyPromotionalCredit.finishWork, work)).toBe(false)
    expect((await rows(f.backend)).grants[0]?.availableUnits).toBe('0')
  })

  it('denies purchase access at expiry, in another environment and after ownership changes', async () => {
    const f = await setup()
    await f.approve({ kind: 'account', accountRef: f.account.accountRef })
    const grant = (await rows(f.backend)).grants[0]
    if (grant === undefined) throw new Error('grant_missing')
    const input = { environment: 'sandbox' as const, accountRef: f.account.accountRef, ownerPrincipalRef: f.ownership.ownerPrincipalRef, now: grant.expiresAt - 1 }
    expect(await f.backend.run(ctx => accountHasTrialAccess(ctx, input))).toBe(true)
    expect(await f.backend.run(ctx => accountHasTrialAccess(ctx, { ...input, now: grant.expiresAt }))).toBe(false)
    expect(await f.backend.run(ctx => accountHasTrialAccess(ctx, { ...input, environment: 'production' }))).toBe(false)
    expect(await f.backend.run(ctx => accountHasTrialAccess(ctx, { ...input, ownerPrincipalRef: 'different-owner' }))).toBe(false)
  })
})

describe('trial invitation delivery', () => {
  it('does not turn a failed reconciliation read into a claim that the email was never sent', async () => {
    const f = await setup()
    await f.approve({ kind: 'email', email: 'buyer@example.com' })
    const offer = (await rows(f.backend)).offers[0]
    if (offer === undefined) throw new Error('offer_missing')
    clerk.createInvitation.mockRejectedValueOnce(new Error('acknowledgement lost'))
    await f.backend.action(internal.trialAccessActions.deliverInvitation, { offerRef: offer.offerRef })
    clerk.getInvitationList.mockRejectedValueOnce({ status: 401 })
    await f.backend.action(internal.trialAccessActions.deliverInvitation, { offerRef: offer.offerRef })
    expect((await rows(f.backend)).offers[0]?.delivery.kind).toBe('unknown')
    expect(clerk.createInvitation).toHaveBeenCalledTimes(1)
  })

  it('creates one Clerk invitation and repeated/concurrent workers reconcile the same send', async () => {
    const f = await setup()
    await f.approve({ kind: 'email', email: 'buyer@example.com' })
    const offer = (await rows(f.backend)).offers[0]
    if (offer === undefined) throw new Error('offer_missing')
    await Promise.all([
      f.backend.action(internal.trialAccessActions.deliverInvitation, { offerRef: offer.offerRef }),
      f.backend.action(internal.trialAccessActions.deliverInvitation, { offerRef: offer.offerRef }),
    ])
    expect(clerk.createInvitation).toHaveBeenCalledTimes(1)
    expect(clerk.createInvitation).toHaveBeenCalledWith(expect.objectContaining({ emailAddress: 'buyer@example.com', ignoreExisting: false,
      redirectUrl: 'http://127.0.0.1:3024/sign-up?redirect=%2Ftrial' }))
    expect((await rows(f.backend)).offers[0]?.delivery).toEqual({ kind: 'sent', invitationRef: 'inv_trial' })
    expect((await rows(f.backend)).grants).toEqual([])
  })

  it('recovers a lost send acknowledgement by exact metadata without sending a second email', async () => {
    const f = await setup()
    await f.approve({ kind: 'email', email: 'buyer@example.com' })
    const offer = (await rows(f.backend)).offers[0]
    if (offer === undefined) throw new Error('offer_missing')
    clerk.createInvitation.mockRejectedValueOnce(new Error('acknowledgement lost'))
    await f.backend.action(internal.trialAccessActions.deliverInvitation, { offerRef: offer.offerRef })
    const delivery = (await rows(f.backend)).offers[0]?.delivery
    if (delivery?.kind !== 'unknown') throw new Error('unknown_expected')
    clerk.getInvitationList.mockResolvedValueOnce({ data: [{ id: 'inv_recovered', emailAddress: 'buyer@example.com',
      publicMetadata: { aeTrialOfferRef: offer.offerRef, aeTrialAttemptRef: delivery.attemptRef } }], totalCount: 1 })
    await f.backend.action(internal.trialAccessActions.deliverInvitation, { offerRef: offer.offerRef })
    expect(clerk.createInvitation).toHaveBeenCalledTimes(1)
    expect((await rows(f.backend)).offers[0]?.delivery).toEqual({ kind: 'sent', invitationRef: 'inv_recovered' })
  })

  it('preserves uncertainty for an absent readback and permits the approved verified recipient to activate', async () => {
    const f = await setup()
    await f.approve({ kind: 'email', email: 'buyer@example.com' })
    const offer = (await rows(f.backend)).offers[0]
    if (offer === undefined) throw new Error('offer_missing')
    clerk.createInvitation.mockRejectedValueOnce(new Error('timeout'))
    await f.backend.action(internal.trialAccessActions.deliverInvitation, { offerRef: offer.offerRef })
    await f.backend.action(internal.trialAccessActions.deliverInvitation, { offerRef: offer.offerRef })
    expect(clerk.createInvitation).toHaveBeenCalledTimes(1)
    expect((await rows(f.backend)).offers[0]?.delivery.kind).toBe('unknown')
    expect(await f.buyer.action(api.trialAccessActions.claim, {})).toMatchObject({ kind: 'granted' })
  })
})
