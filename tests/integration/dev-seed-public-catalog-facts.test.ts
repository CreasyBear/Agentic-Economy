import { convexTest, type TestConvex } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'

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
  it('publishes supplied price and hours, omits absent ones, and never publishes the placeholder', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await runOfferingCutover(backend)

    const rows = await readEveryCatalogRow(backend)
    const withHours = rows.filter((row) => row.availabilitySummary !== null)
    const withPrice = rows.filter((row) => row.pricingSummary !== null)
    const priceWithoutHours = rows.filter((row) => row.pricingSummary !== null && row.availabilitySummary === null)
    const neither = rows.filter((row) => row.pricingSummary === null && row.availabilitySummary === null)

    expect(rows.length).toBeGreaterThan(0)
    expect(withHours.length).toBeGreaterThan(0)
    expect(withPrice.length).toBeGreaterThan(0)
    // Price and hours are independent facts. If they only ever appear together,
    // no surface is forced to handle one without the other.
    expect(priceWithoutHours.length).toBeGreaterThan(0)
    expect(neither.length).toBeGreaterThan(0)

    // The sentinel means "unknown". Reaching a public read as availability is
    // the exact fabrication the projection exists to stop.
    expect(rows.map((row) => row.availabilitySummary)).not.toContain('Hours supplied by owner')
    for (const row of withHours) {
      expect(row.availabilitySummary?.trim()).toBe(row.availabilitySummary)
      expect(row.availabilitySummary).not.toBe('')
    }

    // A catalog nobody can act on is a dead end no matter how good the facts
    // are. Most of the seeded supply has to be reachable, and a deliberate
    // minority must have no contact path at all.
    const reachable = rows.filter((row) => row.phonePaths > 0)
    const unreachable = rows.filter((row) => row.phonePaths === 0)
    expect(reachable.length).toBeGreaterThan(rows.length / 2)
    expect(unreachable.length).toBeGreaterThan(0)

    // A rendered "Call" with nothing to dial is a fabricated affordance, and a
    // published number with no path is supply the catalog silently dropped.
    for (const row of rows) {
      expect(row.phonePaths > 0).toBe(row.publishedPhone !== null)
    }

    // A published price is a fact the v1 service row cannot hold, so it only
    // ever exists natively. If legacy parity counted it as drift, the second
    // `seed:dev` would demote the business to `compare`, the v1 adapter would
    // serve, and every price would silently vanish.
    await runOfferingCutover(backend)
    expect(await readEveryCatalogRow(backend)).toEqual(rows)

    // Prose is not comparable. Every seeded price sentence has to be published
    // beside a structured price a machine can filter and sort on, and it has to
    // still be there after the parity pass that could have demoted it.
    const pricedRevisions = await backend.run(async (ctx) => (
      (await ctx.db.query('businessOfferingRevisions').collect())
        .filter((revision) => revision.pricingSummary !== undefined)
        .map((revision) => revision.price)
    ))
    expect(pricedRevisions.length).toBeGreaterThan(0)
    for (const price of pricedRevisions) {
      expect(price?.currency).toBe('AUD')
      expect(price?.taxTreatment).toBe('inclusive')
      expect(price?.amountMinor).toBeGreaterThan(0)
    }

    // The stored price is only worth writing if the projection carries it out
    // again: the snapshot is what every public read is served from.
    const projectedPrices = await backend.run(async (ctx) => (
      (await ctx.db.query('businessSupplyProjectionSnapshots').collect()).flatMap((snapshot) => (
        snapshot.projection?.offerings.map((item) => item.offering.price ?? null) ?? []
      ))
    ))
    expect(projectedPrices.filter((price) => price !== null)).not.toHaveLength(0)
    expect(projectedPrices.filter((price) => price !== null).every((price) => price?.currency === 'AUD')).toBe(true)
    // An Offering without a price still projects, exactly as it did before.
    expect(projectedPrices.filter((price) => price === null)).not.toHaveLength(0)
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
