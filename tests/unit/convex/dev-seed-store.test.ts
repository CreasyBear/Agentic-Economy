import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { persistDevSeedCatalogState } from '../../../convex/devSeedStore'
import schema from '../../../convex/schema'
import { DEV_SEED_BUSINESS_FIXTURES, buildDevSeedCatalogState } from '../../../src/modules/dev/public'
import { convexModules as modules } from '../../helpers/convex-fixtures'

describe('dev seed Convex store', () => {
  it('persists an empty catalog after retired seed eviction', async () => {
    const backend = convexTest(schema, modules)
    const bundle = buildDevSeedCatalogState(DEV_SEED_BUSINESS_FIXTURES)
    const authority = {
      principalRef: 'prn_d2000000000000000000000000000001',
      accountRef: 'acc_d2000000000000000000000000000001',
    }

    const first = await backend.run((ctx) => persistDevSeedCatalogState(ctx.db, bundle, authority))
    const replay = await backend.run((ctx) => persistDevSeedCatalogState(ctx.db, bundle, authority))
    expect(replay).toEqual(first)
    expect(bundle.seededSlugs).toEqual([])

    const persisted = await backend.run(async (ctx) => ({
      businesses: await ctx.db.query('businesses').collect(),
      offerings: await ctx.db.query('businessOfferings').collect(),
      owners: await ctx.db.query('owners').collect(),
    }))
    expect(persisted.businesses.filter((row) => bundle.seededSlugs.includes(row.slug))).toEqual([])
    expect(persisted.offerings).toHaveLength(bundle.state.offerings.length)
    expect(persisted.owners).toEqual([
      expect.objectContaining({
        canonicalPrincipalRef: authority.principalRef,
        canonicalAccountRef: authority.accountRef,
      }),
    ])

    await expect(backend.run((ctx) => persistDevSeedCatalogState(ctx.db, bundle, {
      principalRef: 'prn_forged000000000000000000000000001',
      accountRef: 'acc_forged000000000000000000000000001',
    }))).rejects.toThrow('Dev seed owner canonical authority conflicts with persisted state.')
  })
})
