import { describe, expect, it } from 'vitest'

import { api } from '../../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  convexTestWithMarketComponents,
  ownerAdmin,
  ConvexFixtureAdmin,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'


type Backend = ConvexFixtureBackend
// admin_membership isolation readings: owner = active adminMemberships row
// matching the caller identity; member = same-account membership without an
// admin row; workload = workload-kind principal identity; missing_workload =
// no identity; stranger = foreign identity with no row; wrong_account =
// adminMemberships row belonging to a different clerk account; stale_generation
// = revoked membership.
const ADMIN_ISOLATION_CASES = [
  'owner',
  'member',
  'workload',
  'missing_workload',
  'stranger',
  'wrong_account',
  'stale_generation',
] as const
type IsolationCaseKind = (typeof ADMIN_ISOLATION_CASES)[number]

const ISSUER = 'https://identity.example'

describe('admin_membership authority family isolation through registered admin surfaces', () => {
  it.each(ADMIN_ISOLATION_CASES)(
    'evaluates readCurrentActiveAdminMembership %s through the registered admin audit readback query',
    async (caseKind) => {
      const backend = convexTestWithMarketComponents()
      const slug = `admin-actor-isolation-readback-${caseKind}`
      const caller = await seededCase(backend, caseKind, slug)
      const before = await authorityState(backend)

      const result = await caller.query(api.security.readAdminAuditEvents, {})

      await expect(authorityState(backend)).resolves.toEqual(before)
      if (caseKind === 'owner') {
        expect(result).toMatchObject({ kind: 'allowed', surface: 'audit_events', rows: [] })
      } else {
        expect(result).toMatchObject({
          kind: 'denied',
          reason: 'missing_membership',
          surface: 'audit_events',
          rows: [],
        })
      }
    },
  )

  it.each(ADMIN_ISOLATION_CASES)(
    'evaluates resolveAdminAuthority %s through the registered capability binding control query',
    async (caseKind) => {
      const backend = convexTestWithMarketComponents()
      const slug = `admin-actor-isolation-binding-${caseKind}`
      const caller = await seededCase(backend, caseKind, slug)
      const before = await authorityState(backend)

      const result = await caller.query(api.capabilitySupply.inspectBindingControlState, {
        bindingId: `bnd_${slug}`,
      })

      await expect(authorityState(backend)).resolves.toEqual(before)
      if (caseKind === 'owner') {
        expect(result).toEqual({ kind: 'unavailable', reason: 'binding_not_found' })
      } else {
        expect(result).toEqual({ kind: 'refused', reason: 'authorization_denied' })
      }
    },
  )
})

async function authorityState(backend: Backend) {
  return await backend.run(async (ctx) => ({
    adminMemberships: await ctx.db.query('adminMemberships').collect(),
    adminMembershipAuditEvents: await ctx.db.query('adminMembershipAuditEvents').collect(),
    auditEvents: await ctx.db.query('auditEvents').collect(),
    principals: await ctx.db.query('principals').collect(),
    accounts: await ctx.db.query('accounts').collect(),
    accountOwnerships: await ctx.db.query('accountOwnerships').collect(),
    memberships: await ctx.db.query('memberships').collect(),
    externalIdentityBindings: await ctx.db.query('externalIdentityBindings').collect(),
    credentials: await ctx.db.query('credentials').collect(),
  }))
}

async function seededCase(
  backend: Backend,
  caseKind: IsolationCaseKind,
  slug: string,
): Promise<ConvexFixtureAdmin> {
  if (caseKind === 'owner') {
    return ownerAdmin(backend, `user_${slug}-admin`)
  }
  if (caseKind === 'missing_workload') {
    return backend
  }
  if (caseKind === 'stranger') {
    return backend.withIdentity({
      subject: `user_${slug}-stranger`,
      issuer: ISSUER,
      exp: 8_000_000_000,
    })
  }
  if (caseKind === 'wrong_account') {
    // The only membership row in the system belongs to a different clerk
    // account (clerkUserId and tokenIdentifier are a coherent foreign pair).
    // Admin authority resolves strictly by the caller's own identity, so the
    // foreign row never matches and the caller is denied.
    await backend.run(async (ctx) => {
      await ctx.db.insert('adminMemberships', {
        clerkUserId: `user_${slug}-foreign`,
        tokenIdentifier: `token_${slug}-foreign`,
        role: 'owner_admin',
        state: 'active',
        grantedBy: 'admin-actor-isolation-fixture',
        grantedAt: 1,
      })
    })
    return backend.withIdentity({
      subject: `user_${slug}-caller`,
      issuer: ISSUER,
      exp: 8_000_000_000,
    })
  }
  if (caseKind === 'stale_generation') {
    const caller = await ownerAdmin(backend, `user_${slug}-admin`)
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('adminMemberships')
        .withIndex('by_tokenIdentifier_and_state', (query) => query
          .eq('tokenIdentifier', `token_${slug}-admin`)
          .eq('state', 'active'))
        .unique()
      if (row === null) throw new Error('admin_isolation_membership_missing')
      await ctx.db.patch(row._id, {
        state: 'revoked',
        revokedBy: 'admin-actor-isolation-fixture',
        revokedAt: 2,
      })
    })
    return caller
  }
  // member | workload: a plain account member of the admin's account, with no
  // admin membership row (T1 fixture pattern: ownerAdmin stack, own ownership
  // ended, memberships row on the target account).
  await ownerAdmin(backend, `user_${slug}-admin`)
  const caller = await seedAccountMember(backend, slug)
  if (caseKind === 'workload') {
    await backend.run(async (ctx) => {
      const binding = await ctx.db.query('externalIdentityBindings')
        .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
          .eq('providerNamespace', 'clerk/user')
          .eq('providerIdentifier', `token_${slug}-member`))
        .unique()
      if (binding === null) throw new Error('admin_isolation_member_binding_missing')
      const principal = await ctx.db.query('principals')
        .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
        .unique()
      if (principal === null) throw new Error('admin_isolation_member_principal_missing')
      await ctx.db.patch(principal._id, { kind: 'workload' })
    })
  }
  return caller
}

async function seedAccountMember(backend: Backend, slug: string): Promise<ConvexFixtureAdmin> {
  const adminTokenIdentifier = `token_${slug}-admin`
  const memberSubject = `user_${slug}-member`
  const memberTokenIdentifier = `token_${slug}-member`
  const digest = canonicalDigest({ kind: 'admin-actor-isolation-member:v1', slug })
    .slice('sha256:'.length, 'sha256:'.length + 32)
  const membershipRef = `mem_${digest}`
  const caller = await ownerAdmin(backend, memberSubject)
  await backend.run(async (ctx) => {
    const adminBinding = await ctx.db.query('externalIdentityBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
        .eq('providerNamespace', 'clerk/user')
        .eq('providerIdentifier', adminTokenIdentifier))
      .unique()
    if (adminBinding === null) throw new Error('admin_isolation_admin_binding_missing')
    const adminOwnership = await ctx.db.query('accountOwnerships')
      .withIndex('by_ownerPrincipalRef_and_lifecycle', (query) => query
        .eq('ownerPrincipalRef', adminBinding.principalRef)
        .eq('lifecycle', 'active'))
      .unique()
    if (adminOwnership === null) throw new Error('admin_isolation_admin_account_missing')
    const memberBinding = await ctx.db.query('externalIdentityBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
        .eq('providerNamespace', 'clerk/user')
        .eq('providerIdentifier', memberTokenIdentifier))
      .unique()
    if (memberBinding === null) throw new Error('admin_isolation_member_binding_missing')
    const memberPrincipalRef = memberBinding.principalRef
    const memberOwnership = await ctx.db.query('accountOwnerships')
      .withIndex('by_ownerPrincipalRef_and_lifecycle', (query) => query
        .eq('ownerPrincipalRef', memberPrincipalRef)
        .eq('lifecycle', 'active'))
      .unique()
    if (memberOwnership === null) throw new Error('admin_isolation_member_ownership_missing')
    await ctx.db.patch(memberOwnership._id, {
      lifecycle: 'ended',
      endedAt: 2,
      endedBy: {
        actorPrincipalRef: memberPrincipalRef,
        activeAccountRef: memberOwnership.accountRef,
        correlationRef: `member:${memberSubject}`,
        idempotencyRef: `member:${memberSubject}`,
      },
    })
    await ctx.db.insert('memberships', {
      membershipRef,
      accountRef: adminOwnership.accountRef,
      memberPrincipalRef,
      lifecycle: 'active',
      revision: 1,
      createdAt: 2,
      createdBy: {
        actorPrincipalRef: memberPrincipalRef,
        activeAccountRef: adminOwnership.accountRef,
        correlationRef: `member:${memberSubject}`,
        idempotencyRef: `member:${memberSubject}`,
      },
    })
    const memberAdminRow = await ctx.db.query('adminMemberships')
      .withIndex('by_tokenIdentifier_and_state', (query) => query
        .eq('tokenIdentifier', memberTokenIdentifier)
        .eq('state', 'active'))
      .unique()
    if (memberAdminRow === null) throw new Error('admin_isolation_member_admin_row_missing')
    await ctx.db.delete(memberAdminRow._id)
  })
  return caller
}
