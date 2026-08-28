import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

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
