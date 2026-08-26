import { convexTest, type TestConvex } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../convex/schema'
import { internal } from '../../convex/_generated/api'
import {
  DEV_SEED_CATALOG_ACCOUNT_REF,
  DEV_SEED_CATALOG_PRINCIPAL_REF,
  reviseBusinessOfferingCommand,
  withdrawOfferingAccessPathCommand,
} from '../../convex/catalogOfferingMutations'
import { seedBusinessOfferings } from '../../convex/devSeed'
import type { Id } from '../../convex/_generated/dataModel'
import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import { convexModules as modules } from '../helpers/convex-fixtures'

const GRANT_REF = 'grt_d2000000000000000000000000000001'
type CatalogBackend = TestConvex<typeof schema>

describe('system offering source authority', () => {
  it('attributes a valid source consequence only to the declared current workload grant', async () => {
    const backend = convexTest(schema, modules)
    const fixture = await seedSystemOfferingFixture(backend)

    await expect(revise(backend, fixture.businessId, 'valid')).resolves.toMatchObject({
      kind: 'ok',
      code: 'revised',
      currentRevision: 2,
    })
    const state = await backend.run(async (ctx) => ({
      offering: await ctx.db.get(fixture.offeringId),
      revisions: await ctx.db.query('businessOfferingRevisions')
        .withIndex('by_offeringRef_and_revision', (query) => query.eq('offeringRef', 'offering:dev-seed-authority'))
        .collect(),
      operations: await ctx.db.query('operationKeys')
        .withIndex('by_actor_operation_key', (query) => query
          .eq('actorRef', DEV_SEED_CATALOG_PRINCIPAL_REF)
          .eq('operationName', 'reviseOffering'))
        .collect(),
    }))
    expect(state.offering?.currentRevision).toBe(2)
    expect(state.revisions).toHaveLength(2)
    expect(state.operations).toHaveLength(1)
    expect(state.operations[0]).toMatchObject({
      actorKind: 'system',
      actorRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      status: 'succeeded',
    })
  })

  it.each([
    ['missing workload', async (backend: CatalogBackend) => {
      await backend.run(async (ctx) => {
        const row = await ctx.db.query('principals')
          .withIndex('by_principalRef', (query) => query.eq('principalRef', DEV_SEED_CATALOG_PRINCIPAL_REF))
          .unique()
        if (row !== null) await ctx.db.delete(row._id)
      })
    }],
    ['missing account', async (backend: CatalogBackend) => {
      await backend.run(async (ctx) => {
        const row = await ctx.db.query('accounts')
          .withIndex('by_accountRef', (query) => query.eq('accountRef', DEV_SEED_CATALOG_ACCOUNT_REF))
          .unique()
        if (row !== null) await ctx.db.delete(row._id)
      })
    }],
    ['missing ownership', async (backend: CatalogBackend) => {
      await backend.run(async (ctx) => {
        const row = await ctx.db.query('accountOwnerships')
          .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', 'own_d2000000000000000000000000000001'))
          .unique()
        if (row !== null) await ctx.db.delete(row._id)
      })
    }],
    ['missing workload membership', async (backend: CatalogBackend) => {
      await backend.run(async (ctx) => {
        const ownership = await ctx.db.query('accountOwnerships')
          .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', 'own_d2000000000000000000000000000001'))
          .unique()
        if (ownership !== null) await ctx.db.patch(ownership._id, { ownerPrincipalRef: 'prn_d2000000000000000000000000000002' })
      })
    }],
    ['substituted workload declaration', async (backend: CatalogBackend) => {
      await backend.run(async (ctx) => {
        const row = await ctx.db.query('principals')
          .withIndex('by_principalRef', (query) => query.eq('principalRef', DEV_SEED_CATALOG_PRINCIPAL_REF))
          .unique()
        if (row !== null) await ctx.db.patch(row._id, { displayName: 'Caller supplied workload' })
      })
    }],
    ['revoked grant', async (backend: CatalogBackend) => {
      await patchGrant(backend, { lifecycle: 'revoked', revokedAt: Date.now() })
    }],
    ['expired grant', async (backend: CatalogBackend) => {
      await patchGrant(backend, { expiresAt: Date.now() - 1 })
    }],
    ['substituted account', async (backend: CatalogBackend) => {
      await patchGrant(backend, { accountRef: 'acc_d2000000000000000000000000000002' })
    }],
    ['narrowed resources', async (backend: CatalogBackend) => {
      await patchGrant(backend, { resourceRefs: [] })
    }],
    ['ambiguous grants', async (backend: CatalogBackend) => {
      await duplicateGrant(backend)
    }],
    ['substituted business provenance', async (backend: CatalogBackend) => {
      await backend.run(async (ctx) => {
        const owner = await ctx.db.query('owners').first()
        if (owner !== null) await ctx.db.patch(owner._id, { canonicalPrincipalRef: 'prn_d2000000000000000000000000000002' })
      })
    }],
  ])('fails closed for %s without a duplicate offering effect', async (_label, mutateAuthority) => {
    const backend = convexTest(schema, modules)
    const fixture = await seedSystemOfferingFixture(backend)
    await mutateAuthority(backend)

    await expect(revise(backend, fixture.businessId, 'denied')).resolves.toEqual({
      kind: 'error',
      code: 'authority_denied',
      reason: 'Declared development seed workload authority is not current.',
    })
    await expect(backend.run(async (ctx) => ({
      offering: await ctx.db.get(fixture.offeringId),
      revisions: await ctx.db.query('businessOfferingRevisions')
        .withIndex('by_offeringRef_and_revision', (query) => query.eq('offeringRef', 'offering:dev-seed-authority'))
        .collect(),
    }))).resolves.toMatchObject({ offering: { currentRevision: 1 }, revisions: [{ revision: 1 }] })
  })

  it('rechecks revocation before a second consequence and preserves exact replay idempotency', async () => {
    const backend = convexTest(schema, modules)
    const fixture = await seedSystemOfferingFixture(backend)
    const first = await revise(backend, fixture.businessId, 'replay')
    expect(first).toMatchObject({ kind: 'ok', currentRevision: 2 })
    await expect(revise(backend, fixture.businessId, 'replay')).resolves.toMatchObject({
      kind: 'ok',
      code: 'replayed',
      currentRevision: 2,
      resultRef: 'offering:dev-seed-authority',
    })
    await patchGrant(backend, { lifecycle: 'revoked', revokedAt: Date.now() })
    await expect(revise(backend, fixture.businessId, 'after-revoke', 2)).resolves.toMatchObject({
      kind: 'error',
      code: 'authority_denied',
    })
    await expect(backend.run(async (ctx) => ctx.db.query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => query.eq('offeringRef', 'offering:dev-seed-authority'))
      .collect())).resolves.toHaveLength(2)
  })

  it('admits a declared workload as an active account member without making it the owner', async () => {
    const backend = convexTest(schema, modules)
    const fixture = await seedSystemOfferingFixture(backend)
    await backend.run(async (ctx) => {
      const ownerPrincipalRef = 'prn_d2000000000000000000000000000002'
      await ctx.db.insert('principals', {
        principalRef: ownerPrincipalRef,
        kind: 'human',
        displayName: 'Development account owner',
        lifecycle: 'active',
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      const ownership = await ctx.db.query('accountOwnerships')
        .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', 'own_d2000000000000000000000000000001'))
        .unique()
      if (ownership === null) throw new Error('fixture_ownership_missing')
      await ctx.db.patch(ownership._id, { ownerPrincipalRef })
      await ctx.db.insert('memberships', {
        membershipRef: 'mem_d2000000000000000000000000000001',
        accountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
        memberPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
        lifecycle: 'active',
        revision: 1,
        createdAt: 1,
        createdBy: {
          actorPrincipalRef: ownerPrincipalRef,
          activeAccountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
          correlationRef: 'dev-seed-membership:create',
          idempotencyRef: 'dev-seed-membership:create',
        },
      })
    })
    await expect(revise(backend, fixture.businessId, 'member')).resolves.toMatchObject({
      kind: 'ok',
      code: 'revised',
    })
  })

  it('fails closed when the workload target business disappears before admission', async () => {
    const backend = convexTest(schema, modules)
    const fixture = await seedSystemOfferingFixture(backend)
    await backend.run(async (ctx) => ctx.db.delete(fixture.businessId))
    await expect(revise(backend, fixture.businessId, 'deleted-business')).resolves.toMatchObject({
      kind: 'error',
      code: 'authority_denied',
    })
  })

  it('revises pricing, refreshes an access path, and withdraws through the same workload authority', async () => {
    const backend = convexTest(schema, modules)
    const fixture = await seedSystemOfferingFixture(backend)
    const descriptor = { kind: 'human_request' as const, channel: 'phone' as const, disclosure: 'Call' }
    await backend.run(async (ctx) => {
      await ctx.db.insert('offeringAccessPaths', {
        accessPathRef: 'access:dev-seed-authority',
        businessId: fixture.businessId,
        offeringRef: 'offering:dev-seed-authority',
        offeringRevision: 1,
        offeringSourceHash: 'source:dev-seed-authority:r1',
        status: 'published',
        descriptor,
        sourceHash: canonicalDigest(descriptor),
        createdAt: 1,
        updatedAt: 1,
      })
    })

    await expect(backend.run(async (ctx) => {
      const business = await ctx.db.get(fixture.businessId)
      if (business === null) throw new Error('fixture_business_missing')
      return await seedBusinessOfferings(
        ctx,
        business,
        Date.now(),
        { 'dev-seed-authority': 'From $1 per request' },
        { 'dev-seed-authority': { kind: 'from', amount: { currency: 'AUD', units: '100', exponent: 2 }, unit: 'call', taxTreatment: 'exclusive' } },
      )
    })).resolves.toEqual({ kind: 'ok', seeded: 1 })

    const refreshed = await backend.run(async (ctx) => ctx.db.query('offeringAccessPaths')
      .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', 'access:dev-seed-authority'))
      .unique())
    expect(refreshed).toMatchObject({ offeringRevision: 2, status: 'published' })
    await expect(backend.run(async (ctx) => withdrawOfferingAccessPathCommand(ctx, {
      businessId: fixture.businessId,
      accessPathRef: 'access:dev-seed-authority',
      expectedRevision: 2,
      operationKey: 'dev-seed-authority:withdraw',
    }, Date.now()))).resolves.toMatchObject({ kind: 'ok', code: 'access_path_withdrawn' })
    await expect(backend.run(async (ctx) => ctx.db.query('offeringAccessPaths')
      .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', 'access:dev-seed-authority'))
      .unique())).resolves.toMatchObject({ status: 'withdrawn' })
  })

  it('runs the paged internal seed worker only after the workload admission', async () => {
    const backend = convexTest(schema, modules)
    await seedSystemOfferingFixture(backend)
    await expect(backend.mutation(internal.devSeed.seedOfferingSupply, { cursor: null })).resolves.toMatchObject({
      processed: 1,
      seeded: 1,
      errors: [],
      done: true,
    })
  })

  it.each([
    ['owner', false, async (backend: CatalogBackend): Promise<void> => {
      await patchDevSeedPrincipal(backend, { kind: 'human' })
    }],
    ['member', false, async (backend: CatalogBackend): Promise<void> => {
      await configureDevSeedHumanMember(backend)
    }],
    ['workload', true, async (_backend: CatalogBackend): Promise<void> => undefined],
    ['missing_workload', false, async (backend: CatalogBackend): Promise<void> => {
      await backend.run(async (ctx) => {
        const row = await ctx.db.query('principals')
          .withIndex('by_principalRef', (query) => query.eq('principalRef', DEV_SEED_CATALOG_PRINCIPAL_REF))
          .unique()
        if (row !== null) await ctx.db.delete(row._id)
      })
    }],
    ['stranger', false, async (backend: CatalogBackend): Promise<void> => {
      await patchDevSeedPrincipal(backend, { displayName: 'Caller-shaped catalog job' })
    }],
    ['wrong_account', false, async (backend: CatalogBackend): Promise<void> => {
      await patchGrant(backend, { accountRef: 'acc_d2000000000000000000000000000002' })
    }],
    ['stale_generation', false, async (backend: CatalogBackend): Promise<void> => {
      await configureStaleDevSeedParentGeneration(backend)
    }],
  ] as const)(
    'evaluates %s through the registered seed worker before any catalog consequence',
    async (_caseKind, allowed, mutateAuthority) => {
      const backend = convexTest(schema, modules)
      await seedSystemOfferingFixture(backend)
      await mutateAuthority(backend)
      const consequenceState = async () => await backend.run(async (ctx) => ({
        offerings: await ctx.db.query('businessOfferings').collect(),
        revisions: await ctx.db.query('businessOfferingRevisions').collect(),
        paths: await ctx.db.query('offeringAccessPaths').collect(),
        operations: await ctx.db.query('operationKeys').collect(),
        snapshots: await ctx.db.query('authorityDelegationSnapshots').collect(),
      }))
      const before = await consequenceState()
      const consequence = backend.mutation(internal.devSeed.seedOfferingSupply, { cursor: null })

      if (allowed) {
        await expect(consequence).resolves.toMatchObject({
          processed: 1,
          seeded: 1,
          errors: [],
          done: true,
        })
      } else {
        await expect(consequence).rejects.toThrow()
        await expect(consequenceState()).resolves.toEqual(before)
      }
    },
  )
})

async function revise(
  backend: CatalogBackend,
  businessId: Id<'businesses'>,
  suffix: string,
  expectedRevision = 1,
) {
  return await backend.run(async (ctx) => reviseBusinessOfferingCommand(ctx, {
    businessId,
    offeringRef: 'offering:dev-seed-authority',
    expectedRevision,
    operationKey: `dev-seed-authority:${suffix}`,
    facts: {
      name: 'Canonical dev seed offering',
      category: 'Data',
      summary: `Canonical workload revision ${expectedRevision + 1}`,
    },
  }, Date.now()))
}

async function seedSystemOfferingFixture(backend: CatalogBackend) {
  return await backend.run(async (ctx) => {
    const now = Date.now()
    const ownershipRef = 'own_d2000000000000000000000000000001'
    await ctx.db.insert('principals', {
      principalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      kind: 'workload',
      displayName: 'Agentic Economy development catalog seed workload',
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('accounts', {
      accountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
      displayName: 'Agentic Economy development catalog seed account',
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      creationIdempotencyRef: 'dev-seed-account:create',
      initialOwnershipRef: ownershipRef,
      currentOwnershipRef: ownershipRef,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      lastAction: {
        actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
        activeAccountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
        correlationRef: 'dev-seed-account:create',
        idempotencyRef: 'dev-seed-account:create',
      },
    })
    await ctx.db.insert('accountOwnerships', {
      ownershipRef,
      accountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
      ownerPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: 1,
      createdBy: {
        actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
        activeAccountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
        correlationRef: 'dev-seed-ownership:create',
        idempotencyRef: 'dev-seed-ownership:create',
      },
    })
    const ownerId = await ctx.db.insert('owners', {
      clerkUserId: 'hostile-caller-shaped-clerk-id-is-not-authority',
      canonicalPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      canonicalAccountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
      createdAt: 1,
      updatedAt: 1,
    })
    const businessId = await ctx.db.insert('businesses', {
      ownerId,
      slug: 'dev-seed-authority',
      name: 'Development seed authority',
      normalizedName: 'development seed authority',
      category: 'Data',
      businessContext: { kind: 'programmable_provider', website: 'https://dev.invalid', providerIdentifier: 'dev-seed' },
      publicStatus: 'published',
      trustTier: 'listed',
      sourceHash: 'source:dev-seed-authority',
      createdAt: 1,
      updatedAt: 1,
    })
    const offeringId = await ctx.db.insert('businessOfferings', {
      offeringRef: 'offering:dev-seed-authority',
      businessId,
      currentRevision: 1,
      status: 'published',
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('businessOfferingRevisions', {
      offeringRef: 'offering:dev-seed-authority',
      businessId,
      revision: 1,
      name: 'Development seed offering',
      category: 'Data',
      summary: 'Initial source state.',
      sourceHash: 'source:dev-seed-authority:r1',
      createdAt: 1,
    })
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef: GRANT_REF,
      accountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
      actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      subjectPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      scopes: ['catalog:dev_seed'],
      resourceRefs: ['catalog:dev-seed'],
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt: now + 300_000,
      generation: 1,
      revision: 1,
      lifecycle: 'active',
      createdAt: 1,
      createdBy: {
        actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
        activeAccountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
        correlationRef: 'dev-seed-grant:create',
        idempotencyRef: 'dev-seed-grant:create',
      },
    })
    return { businessId, offeringId }
  })
}

async function patchGrant(
  backend: CatalogBackend,
  patch: Record<string, unknown>,
) {
  await backend.run(async (ctx) => {
    const grant = await ctx.db.query('authorityDelegationGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', GRANT_REF))
      .unique()
    if (grant === null) throw new Error('dev_seed_grant_missing')
    await ctx.db.patch(grant._id, patch)
  })
}

async function patchDevSeedPrincipal(
  backend: CatalogBackend,
  patch: Record<string, unknown>,
) {
  await backend.run(async (ctx) => {
    const principal = await ctx.db.query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', DEV_SEED_CATALOG_PRINCIPAL_REF))
      .unique()
    if (principal === null) throw new Error('dev_seed_principal_missing')
    await ctx.db.patch(principal._id, patch)
  })
}

async function configureDevSeedHumanMember(backend: CatalogBackend) {
  await patchDevSeedPrincipal(backend, { kind: 'human' })
  await backend.run(async (ctx) => {
    const currentOwner = 'prn_d2000000000000000000000000000002'
    await ctx.db.insert('principals', {
      principalRef: currentOwner,
      kind: 'human',
      displayName: 'Development catalog account owner',
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    const ownership = await ctx.db.query('accountOwnerships')
      .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', 'own_d2000000000000000000000000000001'))
      .unique()
    if (ownership === null) throw new Error('dev_seed_ownership_missing')
    await ctx.db.patch(ownership._id, { ownerPrincipalRef: currentOwner })
    await ctx.db.insert('memberships', {
      membershipRef: 'mem_d2000000000000000000000000000002',
      accountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
      memberPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      createdBy: {
        actorPrincipalRef: currentOwner,
        activeAccountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
        correlationRef: 'dev-seed-member:create',
        idempotencyRef: 'dev-seed-member:create',
      },
    })
  })
}

async function configureStaleDevSeedParentGeneration(backend: CatalogBackend) {
  await backend.run(async (ctx) => {
    const leaf = await ctx.db.query('authorityDelegationGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', GRANT_REF))
      .unique()
    if (leaf === null) throw new Error('dev_seed_grant_missing')
    const parentGrantRef = 'grt_d2000000000000000000000000000003'
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef: parentGrantRef,
      accountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
      actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      subjectPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      scopes: ['catalog:dev_seed'],
      resourceRefs: ['catalog:dev-seed'],
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt: leaf.expiresAt,
      generation: 2,
      revision: 2,
      lifecycle: 'active',
      createdAt: 1,
      createdBy: {
        actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
        activeAccountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
        correlationRef: 'dev-seed-parent:create',
        idempotencyRef: 'dev-seed-parent:create',
      },
    })
    await ctx.db.patch(leaf._id, {
      parentGrantRef,
      parentGeneration: 1,
    })
  })
}

async function duplicateGrant(backend: CatalogBackend) {
  await backend.run(async (ctx) => {
    const grant = await ctx.db.query('authorityDelegationGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', GRANT_REF))
      .unique()
    if (grant === null) throw new Error('dev_seed_grant_missing')
    const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...copy } = grant
    await ctx.db.insert('authorityDelegationGrants', {
      ...copy,
      grantRef: 'grt_d2000000000000000000000000000002',
    })
  })
}
