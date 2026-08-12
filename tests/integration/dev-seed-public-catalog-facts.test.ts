import { convexTest, type TestConvex } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'
import type { BusinessSupplyProjection } from '../../src/modules/catalog/public'
import { readBusinessSupplyProjectionSnapshot } from '../../convex/businessSupplyProjectionSnapshot'
import { DEV_SEED_BUSINESS_COUNT, DEV_SEED_BUSINESS_FIXTURES } from '../../src/modules/dev/public'
import { eligibleSupplyPorts } from '../../convex/capabilitySupplyEligiblePorts'
import { listRouteableCapabilitySupply } from '../../src/modules/capability-supply/public'

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
  it('publishes the real curated hours and never fabricates price or a contact path', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await runOfferingCutover(backend)

    const rows = await readEveryCatalogRow(backend)

    // The public catalog contains the complete canonical dev-seed inventory,
    // including curated provider records and observed x402 listings.
    const canonicalSlugs = DEV_SEED_BUSINESS_FIXTURES
      .map(({ requestedSlug }) => requestedSlug)
      .sort()
    expect(canonicalSlugs).toHaveLength(DEV_SEED_BUSINESS_COUNT)
    expect(rows.map((row) => row.slug).sort()).toEqual(canonicalSlugs)

    // Observed x402 listings remain discoverable provenance, not curated keyed
    // providers. Keep that subset explicit so the base Exa listing cannot be
    // confused with its separately observed x402 listing.
    const observedX402Slugs = DEV_SEED_BUSINESS_FIXTURES
      .filter(({ offerings }) => offerings.some(({ publicDisclosure }) => publicDisclosure.startsWith('External x402 listing')))
      .map(({ requestedSlug }) => requestedSlug)
      .sort()
    expect(observedX402Slugs).toEqual([
      'agentic-market-bizintel-x402',
      'agentic-market-coinmarketcap-x402',
      'agentic-market-exa-x402',
      'agentic-market-flightaware-x402',
      'agentic-market-tavily',
      'agentic-market-tavily-x402',
      'agentic-market-timezone-x402',
      'agentic-market-wolframalpha-x402',
    ])
    const observedX402Rows = rows
      .filter(({ slug }) => observedX402Slugs.includes(slug))
      .sort((left, right) => left.slug.localeCompare(right.slug))
    expect(observedX402Rows.map(({ slug }) => slug)).toEqual(observedX402Slugs)
    expect(observedX402Rows.every(({ availabilitySummary }) => availabilitySummary === 'Not verified by AE')).toBe(true)

    const exaFixture = DEV_SEED_BUSINESS_FIXTURES.find(({ requestedSlug }) => requestedSlug === 'agentic-market-exa')
    expect(exaFixture?.ownerMessage).toContain('provider connection')
    expect(exaFixture?.ownerMessage).not.toContain('x402')
    expect(observedX402Slugs).not.toContain('agentic-market-exa')
    expect(rows.find(({ slug }) => slug === 'agentic-market-exa')?.availabilitySummary).not.toBe('Not verified by AE')
    const curatedRows = rows.filter(({ slug }) => !observedX402Slugs.includes(slug))

    // Curated provider entries publish a real availability (hours) fact
    // through the public read, and none is the "unknown" placeholder sentinel.
    expect(curatedRows.length).toBeGreaterThan(0)
    expect(curatedRows.every((row) => row.availabilitySummary !== null)).toBe(true)
    expect(curatedRows.map((row) => row.availabilitySummary).filter((value) => value !== null).length).toBe(curatedRows.length)
    expect(curatedRows.map((row) => row.availabilitySummary)).not.toContain('Hours supplied by owner')

    for (const row of rows) {
      expect(row.availabilitySummary?.trim()).toBe(row.availabilitySummary)
      expect(row.availabilitySummary).not.toBe('')
    }

    // None of the curated provider listings carries a verifiable price AE can
    // publish as a fact, so the projection must not invent one: no pricing
    // sentence and no structured price reaches the public read or the store.
    expect(rows.every((row) => row.pricingSummary === null)).toBe(true)
    const pricedRevisions = await backend.run(async (ctx) => (
      (await ctx.db.query('businessOfferingRevisions').collect())
        .filter((revision) => revision.pricingSummary !== undefined)
    ))
    expect(pricedRevisions).toEqual([])

    // These external listings have no contact path. A rendered "Call" with
    // nothing to dial is a fabricated affordance, and a published number with
    // no path is supply the catalog silently dropped.
    for (const row of rows) {
      expect(row.phonePaths).toBe(0)
      expect(row.publishedPhone).toBeNull()
      expect(row.phonePaths > 0).toBe(row.publishedPhone !== null)
    }

    // Re-seeding is idempotent: the same real facts come back unchanged.
    await runOfferingCutover(backend)
    expect(await readEveryCatalogRow(backend)).toEqual(rows)

    // The snapshot is what every public read is served from, so the curated
    // hours must survive into it exactly as they reached the public read — and
    // the placeholder must never leak into the projection either.
    const projectedHours = await backend.run(async (ctx) => {
      const snapshots = await ctx.db.query('businessSupplyProjectionSnapshots').collect()
      const projections = snapshots.map((snapshot) => (
        readBusinessSupplyProjectionSnapshot(
          'projection' in snapshot ? snapshot.projection : snapshot.projectionJson,
          'catalog',
        )
      ))
      return projections.flatMap((projection) => (
        projection.offerings.map((item: BusinessSupplyProjection['offerings'][number]) => item.offering.availabilitySummary ?? null)
      ))
    })
    expect(projectedHours.filter((value) => value !== null)).not.toHaveLength(0)
    expect(projectedHours.map((value) => value === null ? null : value)).not.toContain('Hours supplied by owner')
  }, 300_000)

  it('republishes changed supply on the next seed instead of serving a stale mirror', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await runOfferingCutover(backend)

    // Stand in for an edited seed fixture: the native Offering revision moves
    // directly, and the next projection pass must not serve a stale mirror.
    const slug = (await readEveryCatalogRow(backend)).find((row) => row.availabilitySummary !== null)?.slug
    expect(slug).toBeDefined()
    await backend.run(async (ctx) => {
      const business = await ctx.db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', slug!)).unique()
      const offering = await ctx.db.query('businessOfferings')
        .withIndex('by_businessId_and_status', (query) => query.eq('businessId', business!._id))
        .first()
      const revision = await ctx.db.query('businessOfferingRevisions')
        .withIndex('by_offeringRef_and_revision', (query) => (
          query.eq('offeringRef', offering!.offeringRef).eq('revision', offering!.currentRevision)
        ))
        .unique()
      await ctx.db.patch(revision!._id, { availabilitySummary: 'Tue–Thu 10am–2pm' })
    })

    await runOfferingCutover(backend)

    const row = (await readEveryCatalogRow(backend)).find((item) => item.slug === slug)
    expect(row?.availabilitySummary).toBe('Tue–Thu 10am–2pm')
  }, 300_000)
  it('does not reseed retired sandbox quote supply or expose its routeable binding', async () => {
    const backend = convexTest(schema, modules)
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

    expect(await backend.mutation(internal.devSeed.retireHistoricalSandboxSupply, {}))
      .toEqual({ retired: [] })
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
