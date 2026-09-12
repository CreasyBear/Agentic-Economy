import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from '../../../convex/_generated/api'
import { requireLocalE2EOwnerAuthority } from '../../../convex/devSeed'
import { persistDevSeedCatalogState } from '../../../convex/devSeedStore'
import schema from '../../../convex/schema'
import {
  DEV_SEED_BUSINESS_FIXTURES,
  buildDevSeedCatalogState,
  type DevSeedBusinessFixture,
} from '../../../src/modules/dev/public'
import { convexModules as modules } from '../../helpers/convex-fixtures'

const owningAccountRef = 'acc_d2000000000000000000000000000001'

describe('dev seed Convex store', () => {
  it('persists an empty catalog after retired seed eviction', async () => {
    const backend = convexTest(schema, modules)
    const bundle = buildDevSeedCatalogState(DEV_SEED_BUSINESS_FIXTURES, owningAccountRef)

    const first = await backend.run((ctx) => persistDevSeedCatalogState(ctx.db, bundle, owningAccountRef))
    const replay = await backend.run((ctx) => persistDevSeedCatalogState(ctx.db, bundle, owningAccountRef))
    expect(replay).toEqual(first)
    expect(first).toEqual({ seededSlugs: [], businessIdsBySlug: {} })
    expect(bundle.seededSlugs).toEqual([])

    const persisted = await backend.run(async (ctx) => ({
      businesses: await ctx.db.query('businesses').collect(),
      offerings: await ctx.db.query('businessOfferings').collect(),
    }))
    expect(persisted.businesses).toEqual([])
    expect(persisted.offerings).toEqual([])
  })

  it('writes the seeded owning account ref onto catalog businesses and replays exactly', async () => {
    const backend = convexTest(schema, modules)
    const fixtures: readonly DevSeedBusinessFixture[] = [{
      requestedSlug: 'demo-dev-seed',
      businessName: 'Demo dev seed provider',
      category: 'Listed provider',
      suburb: 'Parramatta',
      stateTerritory: 'NSW',
      ownerMessage: 'Dev seed owner-supplied facts.',
      sourceLabel: 'Dev seed source card',
      offerings: [{
        name: 'Dev seed lookup',
        category: 'Listed provider',
        summary: 'Dev seed lookup for Parramatta homes.',
        serviceAreaSummary: 'Parramatta and nearby suburbs',
        availabilitySummary: 'Weekdays by appointment',
        accessPaths: [{
          kind: 'human_request',
          channel: 'website',
          disclosure: 'Use the public business website contact form.',
        }],
        firstRequestMode: 'not_available_yet',
        publicDisclosure: 'This business has not published a request path.',
        noContactReason: 'Owner has not supplied public contact instructions.',
      }],
    }]
    const bundle = buildDevSeedCatalogState(fixtures, owningAccountRef)

    const first = await backend.run((ctx) => persistDevSeedCatalogState(ctx.db, bundle, owningAccountRef))
    const replay = await backend.run((ctx) => persistDevSeedCatalogState(ctx.db, bundle, owningAccountRef))
    expect(replay).toEqual(first)
    expect(first.seededSlugs).toEqual(['demo-dev-seed'])

    const persisted = await backend.run(async (ctx) => ({
      businesses: await ctx.db.query('businesses').collect(),
      offerings: await ctx.db.query('businessOfferings').collect(),
    }))
    expect(persisted.businesses).toHaveLength(1)
    expect(persisted.businesses[0]).toMatchObject({
      slug: 'demo-dev-seed',
      owningAccountRef,
    })
    expect(persisted.offerings).toHaveLength(bundle.state.offerings.length)
  })
})

const LOCAL_E2E_OWNER_TOKEN_IDENTIFIER = 'https://convex.test|dev-seed-owner-session'

describe('dev seed local E2E owner identity', () => {
  it('provisions the one canonical owner identity the bypass connect flow reuses', async () => {
    const backend = convexTest(schema, modules)

    const first = await backend.run((ctx) => requireLocalE2EOwnerAuthority(ctx))
    expect(first.principalRef).toMatch(/^prn_[0-9a-f]{32}$/u)
    expect(first.accountRef).toMatch(/^acc_[0-9a-f]{32}$/u)

    // The interactive owner path keys provisioning on the provider token
    // identifier, so a rerun (and a later `ae connect`) must find this exact
    // Principal + Account instead of minting a second identity.
    const replay = await backend.run((ctx) => requireLocalE2EOwnerAuthority(ctx))
    expect(replay).toEqual(first)

    const rows = await backend.run(async (ctx) => ({
      bindings: await ctx.db.query('externalIdentityBindings').collect(),
      principals: await ctx.db.query('principals').collect(),
      accounts: await ctx.db.query('accounts').collect(),
      agentPrincipals: await ctx.db.query('agentAccessPrincipals').collect(),
      grants: await ctx.db.query('agentAccessGrants').collect(),
    }))
    expect(rows.bindings.map(({ providerNamespace, providerIdentifier, principalRef }) => ({
      providerNamespace,
      providerIdentifier,
      principalRef,
    }))).toEqual([{
      providerNamespace: 'clerk/user',
      providerIdentifier: LOCAL_E2E_OWNER_TOKEN_IDENTIFIER,
      principalRef: first.principalRef,
    }])
    expect(rows.principals.map(({ principalRef, kind }) => ({ principalRef, kind })))
      .toEqual([{ principalRef: first.principalRef, kind: 'human' }])
    expect(rows.accounts.map(({ accountRef }) => accountRef)).toEqual([first.accountRef])
    // The seed never fabricates an agent identity: `ae connect` owns that.
    expect(rows.agentPrincipals).toEqual([])
    expect(rows.grants).toEqual([])
  })
})

describe('dev seed sandbox spending policy', () => {
  it('binds the owner account money identity Quote reads, then replays as a no-op', async () => {
    const backend = convexTest(schema, modules)

    const first = await backend.mutation(internal.devSeed.seedSandboxSpendingPolicy, {})
    expect(first.created).toBe(true)
    expect(first.accountRef).toMatch(/^acc_[0-9a-f]{32}$/u)
    expect(first.legalCustomerRef.length).toBeGreaterThan(0)

    const seeded = await backend.run(async (ctx) => ({
      bindings: (await ctx.db.query('moneyLegalCustomerBindings').collect())
        .map(({ accountRef, state, legalCustomerRef, version }) => ({
          accountRef,
          state,
          legalCustomerRef,
          version,
        })),
    }))
    expect(seeded.bindings).toEqual([{
      accountRef: first.accountRef,
      state: 'active',
      legalCustomerRef: first.legalCustomerRef,
      version: seeded.bindings[0]?.version,
    }])

    const replay = await backend.mutation(internal.devSeed.seedSandboxSpendingPolicy, {})
    expect(replay).toEqual({ ...first, created: false })
    expect(await backend.run(async (ctx) => ({
      bindings: (await ctx.db.query('moneyLegalCustomerBindings').collect())
        .map(({ accountRef, state, legalCustomerRef, version }) => ({
          accountRef,
          state,
          legalCustomerRef,
          version,
        })),
    }))).toEqual(seeded)
  })

  it('refuses to seed sandbox money authority into an owner account holding a production agent', async () => {
    const backend = convexTest(schema, modules)
    const owner = await backend.run((ctx) => requireLocalE2EOwnerAuthority(ctx))
    await backend.run(async (ctx) => {
      await ctx.db.insert('agentAccessPrincipals', {
        principalId: 'prn_00000000000000000000000000000001',
        ownerId: owner.accountRef,
        credentialId: 'ak_production_agent',
        applicationRef: 'agentic-economy',
        environment: 'production',
        scopes: ['market_tools:call'],
        authorityMode: 'spending_policy',
        grantGeneration: 1,
        spendingPolicyDigest: 'sha256:production',
        lifecycle: 'active',
        recordedAt: 1,
        lastSeenAt: 1,
      })
    })

    await expect(backend.mutation(internal.devSeed.seedSandboxSpendingPolicy, {}))
      .rejects.toThrow(/sandbox/u)
    expect(await backend.run(async (ctx) => ctx.db.query('moneyLegalCustomerBindings').collect()))
      .toEqual([])
  })
})
