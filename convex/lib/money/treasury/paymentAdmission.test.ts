import { makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { convexTestWithMarketComponents, ownerAdmin } from '../../../../tests/helpers/convex-fixtures'
import { seedAgent, testRef } from '../../../../tests/helpers/quote-fixtures'
import { readAgentPaymentAdmission, readPaymentsAudience, type PaymentAdmissionResult } from './paymentAdmission'

const ownerAccess = makeFunctionReference<'query', { environment: 'production' | 'sandbox' }, PaymentAdmissionResult | { kind: 'refused'; code: 'authentication_required' | 'environment_mismatch' }>('platformLaunch:readOwnerPaymentAccess')

async function adminDelegationFixture() {
  const backend = convexTestWithMarketComponents()
  const admin = await ownerAdmin(backend, 'user_payment-root')
  const root = await backend.run(async (ctx) => {
    const binding = await ctx.db.query('externalIdentityBindings').withIndex('by_providerNamespace_and_providerIdentifier', (q) => q.eq('providerNamespace', 'clerk/user').eq('providerIdentifier', 'token_payment-root')).unique()
    if (binding === null) throw new Error('root_binding_missing')
    const ownership = await ctx.db.query('accountOwnerships').withIndex('by_ownerPrincipalRef_and_lifecycle', (q) => q.eq('ownerPrincipalRef', binding.principalRef).eq('lifecycle', 'active')).unique()
    if (ownership === null) throw new Error('root_ownership_missing')
    return { principalRef: binding.principalRef, accountRef: ownership.accountRef, bindingId: binding._id, ownershipId: ownership._id }
  })
  const agent = await seedAgent(backend, { canonicalAccountRef: root.accountRef }, 'tool:payment-admission', 'payment-leaf', '20000000')
  const rootGrantRef = testRef('grt', 'payment-root-grant')
  const intermediateRef = testRef('prn', 'payment-intermediate')
  await backend.run(async (ctx) => {
    const launch = await ctx.db.query('platformLaunch').withIndex('by_environment', (q) => q.eq('environment', 'production')).unique()
    if (launch === null) await ctx.db.insert('platformLaunch', { environment: 'production', paymentsOpenTo: 'admins', resumePaymentsOpenTo: 'admins', revision: 1, updatedAt: 1 })
    else await ctx.db.patch(launch._id, { paymentsOpenTo: 'admins' })
    await ctx.db.insert('principals', { principalRef: intermediateRef, kind: 'agent', displayName: 'Intermediate Agent', lifecycle: 'active', revision: 1, createdAt: 1, updatedAt: 1 })
    const leaf = await ctx.db.query('authorityDelegationGrants').withIndex('by_grantRef', (q) => q.eq('grantRef', agent.grant.grantRef)).unique()
    if (leaf === null) throw new Error('leaf_grant_missing')
    const { _id: _leafId, _creationTime: _created, ...wire } = leaf
    await ctx.db.insert('authorityDelegationGrants', {
      ...wire, grantRef: rootGrantRef, actorPrincipalRef: root.principalRef, subjectPrincipalRef: intermediateRef,
      generation: 3, revision: 3, createdBy: { ...leaf.createdBy, actorPrincipalRef: root.principalRef },
    })
    await ctx.db.patch(leaf._id, {
      actorPrincipalRef: intermediateRef, parentGrantRef: rootGrantRef, parentGeneration: 3,
      createdBy: { ...leaf.createdBy, actorPrincipalRef: intermediateRef }, generation: 7, revision: 7,
    })
  })
  const input = { environment: 'production' as const, accountRef: root.accountRef, grantRef: agent.grant.grantRef, grantGeneration: agent.grant.generation }
  return { backend, admin, root, rootGrantRef, input }
}

beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production'))
afterEach(() => vi.unstubAllEnvs())

describe('live payment audience admission', () => {
  it('defaults production to Admins and development to everyone', async () => {
    const backend = convexTestWithMarketComponents()
    expect(await backend.run((ctx) => readPaymentsAudience(ctx, 'production'))).toBe('admins')
    expect(await backend.run((ctx) => readPaymentsAudience(ctx, 'sandbox'))).toBe('everyone')
  })

  it('follows intermediate Agents to the active human Admin issuer while preserving distinct generation meanings', async () => {
    const fixture = await adminDelegationFixture()
    expect(await fixture.backend.run((ctx) => readAgentPaymentAdmission(ctx, fixture.input, Date.now()))).toEqual({ kind: 'allowed' })
    expect(await fixture.admin.query(ownerAccess, { environment: 'production' })).toEqual({ kind: 'allowed' })
  })

  it('refuses a stale Agent-access generation', async () => {
    const fixture = await adminDelegationFixture()
    expect(await fixture.backend.run((ctx) => readAgentPaymentAdmission(ctx, { ...fixture.input, grantGeneration: 2 }, Date.now()))).toEqual({ kind: 'refused', code: 'payments_admins_only' })
  })

  it.each(['missing_parent', 'cycle', 'cross_account', 'stale_parent_generation', 'revoked_root', 'expired_root', 'inactive_principal', 'revoked_binding', 'unknown_provider_state', 'revoked_admin', 'changed_owner'] as const)('fails closed for %s', async (fault) => {
    const fixture = await adminDelegationFixture()
    await fixture.backend.run(async (ctx) => {
      const rootGrant = await ctx.db.query('authorityDelegationGrants').withIndex('by_grantRef', (q) => q.eq('grantRef', fixture.rootGrantRef)).unique()
      const leaf = await ctx.db.query('authorityDelegationGrants').withIndex('by_grantRef', (q) => q.eq('grantRef', fixture.input.grantRef)).unique()
      if (rootGrant === null || leaf === null) throw new Error('grants_missing')
      if (fault === 'missing_parent') await ctx.db.delete(rootGrant._id)
      if (fault === 'cycle') await ctx.db.patch(rootGrant._id, { parentGrantRef: leaf.grantRef, parentGeneration: leaf.generation })
      if (fault === 'cross_account') await ctx.db.patch(rootGrant._id, { accountRef: testRef('acc', 'another-account') })
      if (fault === 'stale_parent_generation') await ctx.db.patch(rootGrant._id, { generation: 4, revision: 4 })
      if (fault === 'revoked_root') await ctx.db.patch(rootGrant._id, { lifecycle: 'revoked' })
      if (fault === 'expired_root') await ctx.db.patch(rootGrant._id, { expiresAt: Date.now() - 1 })
      if (fault === 'inactive_principal') {
        const principal = await ctx.db.query('principals').withIndex('by_principalRef', (q) => q.eq('principalRef', fixture.root.principalRef)).unique()
        if (principal === null) throw new Error('principal_missing')
        await ctx.db.patch(principal._id, { lifecycle: 'retired' })
      }
      if (fault === 'revoked_binding') await ctx.db.patch(fixture.root.bindingId, { lifecycle: 'revoked' })
      if (fault === 'unknown_provider_state') await ctx.db.patch(fixture.root.bindingId, { providerState: { kind: 'unknown', value: 'unverified' } })
      if (fault === 'revoked_admin') {
        const membership = await ctx.db.query('adminMemberships').withIndex('by_tokenIdentifier_and_state', (q) => q.eq('tokenIdentifier', 'token_payment-root').eq('state', 'active')).unique()
        if (membership === null) throw new Error('membership_missing')
        await ctx.db.patch(membership._id, { state: 'revoked' })
      }
      if (fault === 'changed_owner') await ctx.db.patch(fixture.root.ownershipId, { ownerPrincipalRef: testRef('prn', 'new-owner') })
    })
    expect(await fixture.backend.run((ctx) => readAgentPaymentAdmission(ctx, fixture.input, Date.now()))).toEqual({ kind: 'refused', code: 'payments_admins_only' })
  })

  it('reads pause for both canonical Agent and interactive owner admission', async () => {
    const fixture = await adminDelegationFixture()
    await fixture.backend.run(async (ctx) => {
      const row = await ctx.db.query('platformLaunch').withIndex('by_environment', (q) => q.eq('environment', 'production')).unique()
      if (row === null) throw new Error('launch_missing')
      await ctx.db.patch(row._id, { paymentsOpenTo: 'none' })
    })
    expect(await fixture.backend.run((ctx) => readAgentPaymentAdmission(ctx, fixture.input, Date.now()))).toEqual({ kind: 'refused', code: 'payments_paused' })
    expect(await fixture.admin.query(ownerAccess, { environment: 'production' })).toEqual({ kind: 'refused', code: 'payments_paused' })
  })

  it('does not treat a canonical Account owner as an Admin', async () => {
    const fixture = await adminDelegationFixture()
    await fixture.backend.run(async (ctx) => {
      const row = await ctx.db.query('adminMemberships').withIndex('by_tokenIdentifier_and_state', (q) => q.eq('tokenIdentifier', 'token_payment-root').eq('state', 'active')).unique()
      if (row !== null) await ctx.db.delete(row._id)
    })
    expect(await fixture.admin.query(ownerAccess, { environment: 'production' })).toEqual({ kind: 'refused', code: 'payments_admins_only' })
  })
})
