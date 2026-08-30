import { convexTest, type TestConvex } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'
import { DEV_SEED_BUSINESS_COUNT, DEV_SEED_BUSINESS_FIXTURES } from '../../src/modules/dev/public'
import { eligibleSupplyPorts } from '../../convex/capabilitySupplyEligiblePorts'
import { listRouteableCapabilitySupply } from '../../src/modules/capability-supply/public'
import {
  DEV_SEED_CATALOG_ACCOUNT_REF,
  DEV_SEED_CATALOG_PRINCIPAL_REF,
} from '../../convex/catalogOfferingMutations'

type SeedBackend = TestConvex<typeof schema>

type CatalogOffering = {
  availabilitySummary?: string
  pricingSummary?: string
  accessPaths: readonly { kind: string; channel?: string }[]
}

type CatalogPage = {
  page: readonly {
    slug: string
    publishedPhone?: string
    offerings: readonly CatalogOffering[]
  }[]
  isDone: boolean
  continueCursor: string
}

type CatalogRow = {
  slug: string
  availabilitySummary: string | null
  pricingSummary: string | null
  publishedPhone: string | null
  phonePaths: number
}


/**
 * The Offering API's whole claim over v1 is that it can carry price and
 * availability. A catalog where every business publishes neither proves the
 * projection compiles and nothing else, and a catalog where every business
 * publishes a placeholder actively lies. This asserts the seeded supply
 * demonstrates all four states through the real public read.
 */
describe('dev-seeded public catalog decision facts', () => {
  it('publishes a catalog without retired seed rows', async () => {
    const backend = convexTest(schema, modules)
    await seedDevCatalogAuthority(backend)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await runOfferingCutover(backend)

    const rows = await readEveryCatalogRow(backend)
    const canonicalSlugs = DEV_SEED_BUSINESS_FIXTURES
      .map(({ requestedSlug }) => requestedSlug)
      .sort()
    expect(canonicalSlugs).toHaveLength(DEV_SEED_BUSINESS_COUNT)
    expect(rows.map((row) => row.slug).sort()).toEqual(canonicalSlugs)
    expect(rows).toEqual([])
  })

  it('has no retired seed rows to republish after eviction', async () => {
    const backend = convexTest(schema, modules)
    await seedDevCatalogAuthority(backend)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await runOfferingCutover(backend)
    expect(await readEveryCatalogRow(backend)).toEqual([])
  })
  it('does not reseed retired sandbox quote supply or expose its routeable binding', async () => {
    const backend = convexTest(schema, modules)
    await seedDevCatalogAuthority(backend)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await runOfferingCutover(backend)

    const retired = await backend.run(async (ctx) => {
      const [businesses, bindings, publications] = await Promise.all([
        ctx.db.query('businesses').collect(),
        ctx.db.query('capabilityTransportBindings').collect(),
        ctx.db.query('capabilityPublications').collect(),
      ])
      return {
        sandboxBusinesses: businesses
          .filter(({ slug }) => slug.startsWith('sandbox-') || slug === 'adelaide-dental-clinic')
          .map(({ slug }) => slug)
          .sort(),
        sandboxBindings: bindings
          .filter(({ capabilityId, endpointUrl }) => (
            capabilityId === 'sandbox.checkup_quote' || endpointUrl.includes('/api/sandbox/')
          ))
          .map(({ bindingId }) => bindingId)
          .sort(),
        sandboxPublications: publications
          .filter(({ capabilityId, sourceDescriptorJson }) => (
            capabilityId === 'sandbox.checkup_quote' || sourceDescriptorJson?.includes('/api/sandbox/') === true
          ))
          .sort(),
      }
    })
    expect(retired).toEqual({
      sandboxBusinesses: [],
      sandboxBindings: [],
      sandboxPublications: [],
    })

    const routeable = await backend.run(async (ctx) => (
      listRouteableCapabilitySupply(eligibleSupplyPorts(ctx.db), {
        networkId: 'ae:public',
        limit: 64,
        now: Date.now(),
      })
    ))
    expect(routeable.kind).toBe('available')
    if (routeable.kind === 'available') {
      expect(routeable.supplies.some(({ offering, binding }) => (
        offering.capabilityId === 'sandbox.checkup_quote'
        || binding.capabilityId === 'sandbox.checkup_quote'
        || binding.endpointUrl.includes('/api/sandbox/')
      ))).toBe(false)
    }
  }, 300_000)
})

async function runOfferingCutover(backend: SeedBackend): Promise<void> {
  let cursor: string | null = null
  for (let page = 0; page < 40; page += 1) {
    const step: { errors: readonly string[]; done: boolean; nextCursor: string | null } =
      await backend.mutation(internal.devSeed.seedOfferingSupply, { cursor })
    expect(step.errors).toEqual([])
    if (step.done) return
    cursor = step.nextCursor
  }
  throw new Error('dev seed offering cutover did not finish')
}

async function readEveryCatalogRow(backend: SeedBackend): Promise<readonly CatalogRow[]> {
  const rows: CatalogRow[] = []
  let cursor: string | null = null
  for (let page = 0; page < 20; page += 1) {
    const result: CatalogPage = await backend.query(api.registry.listPublicBusinessOfferingSupply, {
      paginationOpts: { cursor, numItems: 50 },
    })
    for (const item of result.page) {
      rows.push({
        slug: item.slug,
        availabilitySummary: item.offerings[0]?.availabilitySummary ?? null,
        pricingSummary: item.offerings[0]?.pricingSummary ?? null,
        publishedPhone: item.publishedPhone ?? null,
        phonePaths: item.offerings.reduce(
          (count, offering) => count + offering.accessPaths.filter((path) => path.kind === 'human_request' && path.channel === 'phone').length,
          0,
        ),
      })
    }
    if (result.isDone) return rows
    cursor = result.continueCursor
  }
  throw new Error('dev seed catalog paging did not finish')
}

async function seedDevCatalogAuthority(backend: SeedBackend): Promise<void> {
  await backend.run(async (ctx) => {
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
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef: 'grt_d2000000000000000000000000000001',
      accountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
      actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      subjectPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      scopes: ['catalog:dev_seed'],
      resourceRefs: ['catalog:dev-seed'],
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt: Date.now() + 300_000,
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
  })
}
