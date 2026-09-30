/// <reference types="vite/client" />
import { makeFunctionReference } from 'convex/server'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import type { AdminCommandAction, AdminCommandArgs, AdminCommandReceipt } from '@/lib/operator/admin-console/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  convexModules,
  nonAdmin,
  ownerAdmin,
  publishedBusinessOwner,
  reviewerAdmin,
  supportAdmin,
  testMfaConsequenceProof,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'

const suppression = makeFunctionReference<'mutation', Record<string, unknown>, AdminCommandReceipt<'set_business_suppression'>>('businesses:setBusinessSuppression')
const disputeClose = makeFunctionReference<'mutation', Record<string, unknown>, AdminCommandReceipt<'close_removal_dispute'>>('security:closeRemovalDispute')
const grant = makeFunctionReference<'mutation', Record<string, unknown>, AdminCommandReceipt<'grant_admin_membership'>>('security:grantAdminMembership')
const revoke = makeFunctionReference<'mutation', Record<string, unknown>, AdminCommandReceipt<'revoke_admin_membership'>>('security:revokeAdminMembership')

type Action = AdminCommandAction

type Command<A extends Action> = Omit<AdminCommandArgs<A>, 'proof'>
function command<A extends Action>(
  action: A,
  input: AdminCommandArgs<A>['input'],
  reasonCode: AdminCommandArgs<A>['reasonCode'],
  key: string,
  expectedStateDigest?: string,
): Command<A> {
  return {
    action, input, reasonCode, evidenceRefs: ['evidence:admin:action'],
    operationKey: key, correlationId: `corr:${key}`, approval: { kind: 'execute' },
    ...(expectedStateDigest === undefined ? {} : { expectedStateDigest }),
  }
}

async function signed<A extends Action>(subject: string, base: Command<A>, nonce: string) {
  const commandDigest = canonicalDigest({
    scope: 'admin_operator', action: base.action, input: base.input,
    reasonCode: base.reasonCode, evidenceRefs: base.evidenceRefs,
    ...(base.expectedStateDigest === undefined ? {} : { expectedStateDigest: base.expectedStateDigest }),
  })
  return await withSourceWrite('admin_operator', {
    ...base,
    proof: testMfaConsequenceProof({ subject, tokenIdentifier: subject.replace(/^user_/u, 'token_') }, commandDigest),
  }, { nonce })
}

async function auditRows(backend: ConvexFixtureBackend) {
  return await backend.run((ctx) => ctx.db.query('auditEvents').collect())
}

async function setup() {

  const backend = convexTest(schema, convexModules)
  const { businessId } = await publishedBusinessOwner(backend, 'admin-actions-a')
  const disputeId = await backend.run((ctx) => ctx.db.insert('disputes', {
    businessId, status: 'contested', openedByContactHash: 'contact:admin-a',
    targetType: 'business', targetRef: String(businessId),
    reasonCode: 'ownership_contested', evidenceHash: 'evidence:admin-a',
    evidenceRefs: [], publicMessageHash: 'message:admin-a', operationKey: 'open:admin-a',
    operationKeys: ['open:admin-a'], correlationId: 'corr:open:admin-a',
    requestCount: 1, createdAt: 1, updatedAt: 1,
  }))
  return { backend, businessId, disputeId }
}

async function bindRealClerkTarget(backend: ConvexFixtureBackend, subject: string): Promise<string> {
  const syntheticToken = subject.replace(/^user_/u, 'token_')
  const tokenIdentifier = `https://identity.example|${subject}`
  await backend.run(async (ctx) => {
    const membership = await ctx.db.query('adminMemberships')
      .withIndex('by_clerkUserId_and_state', (query) =>
        query.eq('clerkUserId', subject).eq('state', 'active'))
      .unique()
    const binding = await ctx.db.query('externalIdentityBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', (query) =>
        query.eq('providerNamespace', 'clerk/user').eq('providerIdentifier', syntheticToken))
      .unique()
    if (membership === null || binding === null) throw new Error('target_fixture_missing')
    await ctx.db.patch(membership._id, { tokenIdentifier })
    await ctx.db.patch(binding._id, { providerIdentifier: tokenIdentifier })
  })
  return tokenIdentifier
}

describe('admin actions on the common command envelope', () => {

  it('enforces authority, proof, replay, conflict and target state on each action', async () => {
    const { backend, businessId, disputeId } = await setup()
    const owner = await ownerAdmin(backend, 'user_admin-a-owner')
    const support = await supportAdmin(backend, 'user_admin-a-support')
    const reviewer = await reviewerAdmin(backend, 'user_admin-a-reviewer')
    const outsider = await nonAdmin(backend, 'user_admin-a-outsider')
    await reviewerAdmin(backend, 'user_admin-a-target')
    const targetTokenIdentifier = await bindRealClerkTarget(backend, 'user_admin-a-target')
    const cases = [
      {
        ref: suppression,
        base: command('set_business_suppression', { businessId, intent: 'suppress' }, 'policy_violation', 'a:roles:suppress'),
        alternateReason: 'legal_notice' satisfies AdminCommandArgs<'set_business_suppression'>['reasonCode'],
        success: 'business_suppressed',
      },
      {
        ref: disputeClose,
        base: command('close_removal_dispute', { disputeId }, 'upheld', 'a:roles:close'),
        alternateReason: 'refused' satisfies AdminCommandArgs<'close_removal_dispute'>['reasonCode'],
        success: 'dispute_closed',
      },
      {
        ref: grant,
        base: command('grant_admin_membership', { targetClerkUserId: 'user_admin-a-target', targetTokenIdentifier, role: 'support' }, 'role_change', 'a:roles:grant'),
        alternateReason: 'onboarding' satisfies AdminCommandArgs<'grant_admin_membership'>['reasonCode'],
        success: 'membership_granted',
      },
      {
        ref: revoke,
        base: command('revoke_admin_membership', { targetClerkUserId: 'user_admin-a-target' }, 'offboarding', 'a:roles:revoke'),
        alternateReason: 'role_change' satisfies AdminCommandArgs<'revoke_admin_membership'>['reasonCode'],
        success: 'membership_revoked',
      },
    ] satisfies ReadonlyArray<{
      ref: typeof suppression | typeof disputeClose | typeof grant | typeof revoke
      base: Command<Action>
      alternateReason: AdminCommandArgs<Action>['reasonCode']
      success: string
    }>
    for (const item of cases) {
      const supportArgs = await signed('user_admin-a-support', item.base, `nonce:${item.base.operationKey}:support`)
      const reviewerArgs = await signed('user_admin-a-reviewer', item.base, `nonce:${item.base.operationKey}:reviewer`)
      const outsiderArgs = await signed('user_admin-a-outsider', item.base, `nonce:${item.base.operationKey}:outsider`)
      expect(await support.mutation(item.ref, supportArgs)).toMatchObject({ kind: 'refused', code: 'action_not_allowed' })
      expect(await reviewer.mutation(item.ref, reviewerArgs)).toMatchObject({ kind: 'refused', code: 'action_not_allowed' })
      expect(await outsider.mutation(item.ref, outsiderArgs)).toMatchObject({ kind: 'refused', code: 'missing_membership' })

      const noProof = { ...item.base, operationKey: `${item.base.operationKey}:no-proof` }
      expect(await owner.mutation(item.ref, await withSourceWrite('admin_operator', noProof)))
        .toMatchObject({ kind: 'refused', code: 'mfa_reverification_required' })

      const first = await owner.mutation(item.ref,
        await signed('user_admin-a-owner', item.base, `nonce:${item.base.operationKey}:first`))
      expect(first).toMatchObject({ kind: 'completed', code: item.success })
      const replay = await owner.mutation(item.ref,
        await signed('user_admin-a-owner', item.base, `nonce:${item.base.operationKey}:replay`))
      expect(JSON.stringify(replay)).toBe(JSON.stringify(first))
      const changed: Command<Action> = { ...item.base, reasonCode: item.alternateReason }
      expect(await owner.mutation(item.ref,
        await signed('user_admin-a-owner', changed, `nonce:${item.base.operationKey}:changed`)))
        .toMatchObject({ kind: 'refused', code: 'idempotency_conflict' })
      const stale = {
        ...item.base, operationKey: `${item.base.operationKey}:stale`,
        expectedStateDigest: 'sha256:stale',
      }
      expect(await owner.mutation(item.ref,
        await signed('user_admin-a-owner', stale, `nonce:${item.base.operationKey}:stale`)))
        .toMatchObject({ kind: 'refused', code: 'target_changed' })
      if (first.kind !== 'completed') throw new Error('completed_receipt_expected')
      expect((await auditRows(backend)).filter((row) => row.eventId === first.auditEventRef)).toHaveLength(1)
    }
  })

  it('suppresses and unsuppresses once, with stable replay, conflict and stale target checks', async () => {
    const { backend, businessId } = await setup()
    const subject = 'user_admin-a-suppress'
    const admin = await ownerAdmin(backend, subject)
    const base = command('set_business_suppression', { businessId, intent: 'suppress' }, 'policy_violation', 'a:suppress')
    const first = await admin.mutation(suppression, await signed(subject, base, 'nonce:a:suppress:1'))
    expect(first).toMatchObject({ kind: 'completed', code: 'business_suppressed', effectRefs: [String(businessId)] })
    const replay = await admin.mutation(suppression, await signed(subject, base, 'nonce:a:suppress:2'))
    expect(JSON.stringify(replay)).toBe(JSON.stringify(first))
    const changed = command('set_business_suppression', base.input, 'legal_notice', base.operationKey)
    expect(await admin.mutation(suppression, await signed(subject, changed, 'nonce:a:suppress:3')))
      .toMatchObject({ kind: 'refused', code: 'idempotency_conflict' })
    expect((await auditRows(backend)).filter((row) => row.eventType === 'business.suppressed')).toHaveLength(1)
    expect((await backend.run((ctx) => ctx.db.query('operationKeys').collect()))
      .filter((row) => row.operationName === 'admin:set_business_suppression')).toHaveLength(1)
    const row = await backend.run((ctx) => ctx.db.get(businessId))
    expect(row?.suppressedAt).toEqual(expect.any(Number))
    const stale = command('set_business_suppression', { businessId, intent: 'unsuppress' }, 'suppression_lifted_after_review', 'a:stale', 'sha256:stale')
    expect(await admin.mutation(suppression, await signed(subject, stale, 'nonce:a:stale')))
      .toMatchObject({ kind: 'refused', code: 'target_changed' })
    const unsuppress = command('set_business_suppression', { businessId, intent: 'unsuppress' }, 'suppression_lifted_after_review', 'a:unsuppress')
    expect(await admin.mutation(suppression, await signed(subject, unsuppress, 'nonce:a:unsuppress')))
      .toMatchObject({ kind: 'completed', code: 'business_unsuppressed' })
    expect((await backend.run((ctx) => ctx.db.get(businessId)))?.suppressedAt).toBeUndefined()
    expect(await admin.mutation(suppression, await signed(subject, unsuppress, 'nonce:a:unsuppress:again')))
      .toMatchObject({ kind: 'completed', code: 'business_unsuppressed' })
    const noChange = command('set_business_suppression', { businessId, intent: 'unsuppress' }, 'legal_notice', 'a:unchanged')
    expect(await admin.mutation(suppression, await signed(subject, noChange, 'nonce:a:unchanged')))
      .toMatchObject({ kind: 'refused', code: 'suppression_unchanged' })
  })

  it('closes a dispute and refuses missing or already-closed targets', async () => {
    const { backend, disputeId } = await setup()
    const subject = 'user_admin-a-dispute'
    const admin = await ownerAdmin(backend, subject)
    const close = command('close_removal_dispute', { disputeId }, 'upheld', 'a:close')
    expect(await admin.mutation(disputeClose, await signed(subject, close, 'nonce:a:close')))
      .toMatchObject({ kind: 'completed', code: 'dispute_closed' })
    expect((await backend.run((ctx) => ctx.db.get(disputeId)))?.status).toBe('closed')
    const again = command('close_removal_dispute', { disputeId }, 'refused', 'a:close-again')
    expect(await admin.mutation(disputeClose, await signed(subject, again, 'nonce:a:close-again')))
      .toMatchObject({ kind: 'refused', code: 'dispute_already_closed' })
    await backend.run((ctx) => ctx.db.delete(disputeId))
    const missing = command('close_removal_dispute', { disputeId }, 'upheld', 'a:close-missing')
    expect(await admin.mutation(disputeClose, await signed(subject, missing, 'nonce:a:close-missing')))
      .toMatchObject({ kind: 'refused', code: 'dispute_not_found' })
  })

  it('grants a known principal, refuses unknown/active memberships, revokes, and protects the last owner', async () => {
    const { backend } = await setup()
    const subject = 'user_admin-a-membership'
    const admin = await ownerAdmin(backend, subject)
    await supportAdmin(backend, 'user_admin-a-known')
    const targetTokenIdentifier = await bindRealClerkTarget(backend, 'user_admin-a-known')
    const grantBase = command('grant_admin_membership', { targetClerkUserId: 'user_admin-a-known', targetTokenIdentifier, role: 'reviewer' }, 'role_change', 'a:grant')
    expect(await admin.mutation(grant, await signed(subject, grantBase, 'nonce:a:grant')))
      .toMatchObject({ kind: 'completed', code: 'membership_granted' })
    const active = command('grant_admin_membership', grantBase.input, 'role_change', 'a:grant-again')
    expect(await admin.mutation(grant, await signed(subject, active, 'nonce:a:grant-again')))
      .toMatchObject({ kind: 'refused', code: 'membership_already_active' })
    const unknown = command('grant_admin_membership', { targetClerkUserId: 'user_unknown', targetTokenIdentifier: 'token_unknown', role: 'support' }, 'onboarding', 'a:unknown')
    expect(await admin.mutation(grant, await signed(subject, unknown, 'nonce:a:unknown')))
      .toMatchObject({ kind: 'refused', code: 'principal_not_found' })
    const mismatched = command('grant_admin_membership', {
      targetClerkUserId: 'user_admin-a-other',
      targetTokenIdentifier,
      role: 'support',
    }, 'onboarding', 'a:identity-mismatch')
    expect(await admin.mutation(grant, await signed(subject, mismatched, 'nonce:a:identity-mismatch')))
      .toMatchObject({ kind: 'refused', code: 'principal_not_found' })
    const revokeBase = command('revoke_admin_membership', { targetClerkUserId: 'user_admin-a-known' }, 'offboarding', 'a:revoke')
    expect(await admin.mutation(revoke, await signed(subject, revokeBase, 'nonce:a:revoke')))
      .toMatchObject({ kind: 'completed', code: 'membership_revoked' })
    const missing = command('revoke_admin_membership', revokeBase.input, 'offboarding', 'a:revoke-again')
    expect(await admin.mutation(revoke, await signed(subject, missing, 'nonce:a:revoke-again')))
      .toMatchObject({ kind: 'refused', code: 'membership_not_found' })
    const lastOwner = command('revoke_admin_membership', { targetClerkUserId: subject }, 'offboarding', 'a:last-owner')
    expect(await admin.mutation(revoke, await signed(subject, lastOwner, 'nonce:a:last-owner')))
      .toMatchObject({ kind: 'refused', code: 'last_owner_admin' })
  })

  it('requires fresh consequence proof before suppression effects', async () => {
    const { backend, businessId } = await setup()
    const subject = 'user_admin-a-proof'
    const admin = await ownerAdmin(backend, subject)
    const base = command('set_business_suppression', { businessId, intent: 'suppress' }, 'policy_violation', 'a:proof')
    const unsigned = await withSourceWrite('admin_operator', base)
    const result = await admin.mutation(suppression, unsigned)
    expect(result).toMatchObject({ kind: 'refused', code: 'mfa_reverification_required' })
    expect((await backend.run((ctx) => ctx.db.get(businessId)))?.suppressedAt).toBeUndefined()
  })

  it('requires second approval for suppression and owner-admin grants, not support grants', async () => {
    const { backend, businessId } = await setup()
    const subject = 'user_admin-a-first'
    const admin = await ownerAdmin(backend, subject)
    await ownerAdmin(backend, 'user_admin-a-second')
    await ownerAdmin(backend, 'user_admin-a-third')
    const suppressionBase = command('set_business_suppression', { businessId, intent: 'suppress' }, 'policy_violation', 'a:approval:suppress')
    expect(await admin.mutation(suppression, await signed(subject, suppressionBase, 'nonce:a:approval:suppress')))
      .toMatchObject({ kind: 'refused', code: 'approval_required' })
    const ownerGrant = command('grant_admin_membership', { targetClerkUserId: 'user_admin-a-third', targetTokenIdentifier: 'token_admin-a-third', role: 'owner_admin' }, 'role_change', 'a:approval:owner')
    expect(await admin.mutation(grant, await signed(subject, ownerGrant, 'nonce:a:approval:owner')))
      .toMatchObject({ kind: 'refused', code: 'approval_required' })
    const ownerDemotion = command('grant_admin_membership', {
      targetClerkUserId: 'user_admin-a-third',
      targetTokenIdentifier: 'token_admin-a-third',
      role: 'support',
    }, 'role_change', 'a:approval:demotion')
    expect(await admin.mutation(grant, await signed(subject, ownerDemotion, 'nonce:a:approval:demotion')))
      .toMatchObject({ kind: 'refused', code: 'approval_required' })
    await supportAdmin(backend, 'user_admin-a-support-target')
    const supportTargetToken = await bindRealClerkTarget(backend, 'user_admin-a-support-target')
    const supportGrant = command('grant_admin_membership', { targetClerkUserId: 'user_admin-a-support-target', targetTokenIdentifier: supportTargetToken, role: 'reviewer' }, 'role_change', 'a:approval:support')
    expect(await admin.mutation(grant, await signed(subject, supportGrant, 'nonce:a:approval:support')))
      .toMatchObject({ kind: 'completed', code: 'membership_granted' })
    const audit = (await auditRows(backend)).find((row) => row.eventType === 'admin.membership_granted')
    expect(JSON.parse(audit?.redactedPayloadJson ?? '{}')).toMatchObject({ approval: 'not_required' })
  })
})
