import { describe, expect, it } from 'vitest'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  convexTestWithMarketComponents,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'
type Backend = ConvexFixtureBackend

describe('resolveBusinessActor isolation through the registered owner catalog supply query', () => {
  it.each([
    'owner',
    'member',
    'workload',
    'missing_workload',
    'stranger',
    'wrong_account',
    'stale_generation',
  ] as const)(
    'evaluates resolveBusinessActor %s through the registered owner catalog supply query',
    async (caseKind) => {
      const backend = convexTestWithMarketComponents()
      const slug = `authz-actor-isolation-${caseKind}`
      const published = await publishedBusinessOwner(backend, slug)
      let caller = published.owner

      if (caseKind === 'member' || caseKind === 'workload') {
        caller = await seedCatalogMember(backend, published.businessId, slug)
        if (caseKind === 'workload') {
          await backend.run(async (ctx) => {
            const binding = await ctx.db.query('externalIdentityBindings')
              .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
                .eq('providerNamespace', 'clerk/user')
                .eq('providerIdentifier', `https://identity.example|user_${slug}-member`))
              .unique()
            if (binding === null) throw new Error('authz_isolation_member_binding_missing')
            const principal = await ctx.db.query('principals')
              .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
              .unique()
            if (principal === null) throw new Error('authz_isolation_member_principal_missing')
            await ctx.db.patch(principal._id, { kind: 'workload' })
          })
        }
      } else if (caseKind === 'missing_workload') {
        caller = backend
      } else if (caseKind === 'stranger') {
        caller = backend.withIdentity({
          subject: `user_${slug}-stranger`,
          issuer: 'https://identity.example',
          exp: 8_000_000_000,
        })
      } else if (caseKind === 'wrong_account') {
        await backend.run(async (ctx) => {
          const business = await ctx.db.get(published.businessId)
          if (business === null) throw new Error('authz_isolation_business_missing')
          const ownership = await ctx.db.query('accountOwnerships')
            .withIndex('by_accountRef_and_lifecycle', (query) => query
              .eq('accountRef', business.owningAccountRef)
              .eq('lifecycle', 'active'))
            .unique()
          if (ownership === null) throw new Error('authz_isolation_ownership_missing')
          await ctx.db.patch(ownership._id, {
            accountRef: `acc_${'b'.repeat(32)}`,
          })
        })
      } else if (caseKind === 'stale_generation') {
        await backend.run(async (ctx) => {
          const binding = await ctx.db.query('externalIdentityBindings')
            .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
              .eq('providerNamespace', 'clerk/user')
              .eq('providerIdentifier', `https://identity.example|user_${slug}`))
            .unique()
          if (binding === null) throw new Error('authz_isolation_binding_missing')
          await ctx.db.patch(binding._id, {
            credentialGeneration: binding.credentialGeneration + 1,
            revision: binding.revision + 1,
          })
        })
      }

      const authorityState = async () => await backend.run(async (ctx) => ({
        bindings: await ctx.db.query('externalIdentityBindings').collect(),
        credentials: await ctx.db.query('credentials').collect(),
        principals: await ctx.db.query('principals').collect(),
        accounts: await ctx.db.query('accounts').collect(),
        ownerships: await ctx.db.query('accountOwnerships').collect(),
        memberships: await ctx.db.query('memberships').collect(),
      }))
      const before = await authorityState()

      const result = await caller.query(api.catalog.getCurrentOwnerOfferingSupply, {})

      await expect(authorityState()).resolves.toEqual(before)
      // The registered owner-supply union is `catalogOwnerSupplyResult`: the
      // denied shapes are `error/unauthenticated` (authority resolution refuses
      // the caller) and `not_found` (authenticated actor owns no business). The
      // canonical wrong_account patch makes production throw ownership_mismatch
      // during authority resolution, so every denied case lands on the exact
      // unauthenticated variant; only owner/member reach `available`.
      if (caseKind === 'owner' || caseKind === 'member') {
        expect(result).toMatchObject({
          kind: 'available',
          businessId: published.businessId,
          business: { slug, publicStatus: 'published' },
          offerings: [],
          projection: { status: 'current' },
        })
      } else {
        expect(result).toEqual({ kind: 'error', code: 'unauthenticated' })
      }
    },
  )
})

async function seedCatalogMember(
  backend: Backend,
  businessId: Id<'businesses'>,
  suffix: string,
) {
  const digest = canonicalDigest({ kind: 'authz-actor-isolation-member:v1', suffix })
    .slice('sha256:'.length, 'sha256:'.length + 32)
  const principalRef = `prn_${digest}`
  const membershipRef = `mem_${digest}`
  const bindingRef = `eib_${digest}`
  const credentialRef = `crd_${digest}`
  const issuer = 'https://identity.example'
  const subject = `user_${suffix}-member`
  const tokenIdentifier = `${issuer}|${subject}`
  const expiresAt = 8_000_000_000_000
  await backend.run(async (ctx) => {
    const business = await ctx.db.get(businessId)
    if (business === null) throw new Error('authz_isolation_member_business_missing')
    const ownerAccountRef = business.owningAccountRef
    const ownership = await ctx.db.query('accountOwnerships')
      .withIndex('by_accountRef_and_lifecycle', (query) => query
        .eq('accountRef', ownerAccountRef)
        .eq('lifecycle', 'active'))
      .unique()
    if (ownership === null) throw new Error('authz_isolation_member_owner_missing')
    const ownerPrincipalRef = ownership.ownerPrincipalRef
    await ctx.db.insert('principals', {
      principalRef,
      kind: 'human',
      displayName: `Authz isolation member ${suffix}`,
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('memberships', {
      membershipRef,
      accountRef: ownerAccountRef,
      memberPrincipalRef: principalRef,
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      createdBy: {
        actorPrincipalRef: ownerPrincipalRef,
        activeAccountRef: ownerAccountRef,
        correlationRef: `create:${membershipRef}`,
        idempotencyRef: `create:${membershipRef}`,
      },
    })
    await ctx.db.insert('externalIdentityBindings', {
      bindingRef,
      principalRef,
      providerNamespace: 'clerk/user',
      providerIdentifier: tokenIdentifier,
      providerState: { kind: 'known', value: 'active' },
      lifecycle: 'active',
      credentialGeneration: 1,
      bindIdempotencyRef: `bind:${bindingRef}`,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('credentials', {
      credentialRef,
      bindingRef,
      principalRef,
      type: 'provider_token',
      lifecycle: 'active',
      generation: 1,
      issueIdempotencyRef: `issue:${credentialRef}`,
      revision: 1,
      issuedAt: 1,
      expiresAt,
      expiryMaterialization: {
        state: 'scheduled',
        credentialGeneration: 1,
        credentialExpiresAt: expiresAt,
        scheduleNonce: canonicalDigest({
          kind: 'interactive_credential_expiry:v1',
          bindingRef,
          credentialRef,
          generation: 1,
          expiresAt,
        }),
        scheduleRef: `scheduled:${credentialRef}`,
        materializedAt: 1,
      },
      updatedAt: 1,
    })
  })
  return backend.withIdentity({ subject, issuer, exp: expiresAt / 1_000 })
}
