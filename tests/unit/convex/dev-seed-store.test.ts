import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { persistDevSeedCatalogState } from '../../../convex/devSeedStore'
import schema from '../../../convex/schema'
import { DEV_SEED_BUSINESS_FIXTURES, buildDevSeedCatalogState } from '../../../src/modules/dev/public'
import { convexModules as modules } from '../../helpers/convex-fixtures'

describe('dev seed Convex store', () => {
  it('persists and idempotently replays the fixture through native Convex storage', async () => {
    const backend = convexTest(schema, modules)
    const bundle = buildDevSeedCatalogState(DEV_SEED_BUSINESS_FIXTURES.slice(0, 3))

    const first = await backend.run((ctx) => persistDevSeedCatalogState(ctx.db, bundle))
    const replay = await backend.run((ctx) => persistDevSeedCatalogState(ctx.db, bundle))
    expect(replay).toEqual(first)

    const persisted = await backend.run(async (ctx) => ({
      businesses: await ctx.db.query('businesses').collect(),
      offerings: await ctx.db.query('businessOfferings').collect(),
      revisions: await ctx.db.query('businessOfferingRevisions').collect(),
      accessPaths: await ctx.db.query('offeringAccessPaths').collect(),
    }))
    const seededBusinesses = persisted.businesses.filter((row) => bundle.seededSlugs.includes(row.slug))
    // The curated-only seed is exactly the three AE-observed provider listings.
    expect(seededBusinesses).toHaveLength(3)
    expect(seededBusinesses).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: 'agentic-market-tavily' }),
      expect.objectContaining({ slug: 'agentic-market-exa' }),
    ]))
    expect(seededBusinesses.find((row) => row.slug === 'frankfurter-ecb-rates')).toBeDefined()
    // None of the curated external listings publishes a phone number.
    expect(seededBusinesses.every((row) => row.businessContext.kind === 'programmable_provider')).toBe(true)
    expect(persisted.offerings).toHaveLength(bundle.state.offerings.length)
    expect(persisted.revisions).toHaveLength(bundle.state.revisions.length)
    expect(persisted.accessPaths).toHaveLength(bundle.state.accessPaths.length)
  })
})
