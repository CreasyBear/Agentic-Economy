import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { publishCapabilityForSeed } from '../../convex/capabilitySupply'
import { internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import {
  convexModules as modules,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
import {
  capabilityPublicationInput,
  registerProviderConnection,
  seedCatalogOffering,
} from './capability-publication-harness'

const searchableSuffix = 'rebuildcurrent'
const legacySuffix = 'rebuildlegacy'

async function publishBusiness(
  backend: ConvexFixtureBackend,
  suffix: string,
): Promise<Id<'businesses'>> {
  const { businessId } = await publishedBusinessOwner(backend, suffix)
  await seedCatalogOffering(backend, businessId, suffix)
  await registerProviderConnection(backend, businessId, suffix)
  const origin = await backend.run(async (ctx) => {
    const accessPath = await ctx.db
      .query('offeringAccessPaths')
      .withIndex('by_offeringRef_and_status', (query) =>
        query.eq('offeringRef', `catalog-offering:${suffix}`).eq('status', 'published'),
      )
      .unique()
    if (accessPath === null) throw new Error('projection_rebuild_access_path_missing')
    return {
      kind: 'catalog_offering' as const,
      offeringRef: accessPath.offeringRef,
      offeringRevision: accessPath.offeringRevision,
      offeringSourceHash: accessPath.offeringSourceHash,
      declaredAccessPathRef: accessPath.accessPathRef,
      accessPathSourceHash: accessPath.sourceHash,
    }
  })
  const fixture = capabilityPublicationInput(businessId, suffix)
  const published = await backend.run((ctx) =>
    publishCapabilityForSeed(ctx, {
      ...fixture,
      // The bootstrap path requires an explicit pricing config (Well 4,
      // decision D7: `presentation.price` is display-only and retired), only
      // accepting canonical AUD micro-units.
      pricingConfig: {
        version: 'pricing:v3' as const,
        kind: 'fixed_aud' as const,
        currency: 'AUD' as const,
        exponent: 6 as const,
        amountUnits: '12000000',
      },
      businessId: String(businessId),
      runtimeEnvironment: 'sandbox' as const,
      origin,
      now: Date.now(),
    }),
  )
  if (published.kind === 'refused') {
    throw new Error(`projection_rebuild_publish_refused:${published.reason}`)
  }
  return businessId
}

async function searchDocuments(backend: ConvexFixtureBackend, slug: string) {
  return await backend.run((ctx) =>
    ctx.db
      .query('registrySearchDocuments')
      .withIndex('by_business', (query) => query.eq('businessSlug', slug))
      .collect(),
  )
}

describe('rebuildAllBusinessSupplyProjections', () => {
  it('restores search documents for businesses published before the rebuild existed', async () => {
    const backend = convexTest(schema, modules)
    await publishBusiness(backend, searchableSuffix)
    await publishBusiness(backend, legacySuffix)

    // Simulate the legacy state this entry point exists to repair: a published,
    // routeable programmable provider whose `registrySearchDocuments` row was
    // never written, because `rebuildCapabilityOriginSupplyProjection` skips
    // programmable providers and no other write path rebuilt it.
    const legacyBusinessId = await backend.run(async (ctx) => {
      const business = await ctx.db
        .query('businesses')
        .withIndex('by_slug', (query) => query.eq('slug', legacySuffix))
        .unique()
      if (business === null) throw new Error('projection_rebuild_legacy_business_missing')
      await ctx.db.patch(business._id, {
        businessContext: {
          kind: 'programmable_provider',
          providerIdentifier: `provider:test:${legacySuffix}`,
          website: `https://${legacySuffix}.example.test`,
        },
      })
      for (const document of await ctx.db
        .query('registrySearchDocuments')
        .withIndex('by_business', (query) => query.eq('businessSlug', legacySuffix))
        .collect()) {
        await ctx.db.delete(document._id)
      }
      return business._id
    })
    expect(legacyBusinessId).toBeDefined()
    expect(await searchDocuments(backend, legacySuffix)).toHaveLength(0)

    const dry = await backend.mutation(
      internal.capabilitySupplyProjection.rebuildAllBusinessSupplyProjections,
      { dryRun: true },
    )
    expect(dry).toMatchObject({ isDone: true, continueCursor: null })
    expect(dry.rebuilt).toBeGreaterThanOrEqual(2)
    expect(dry.processed).toBe(dry.rebuilt + dry.skipped)
    // A dry run reports without writing.
    expect(await searchDocuments(backend, legacySuffix)).toHaveLength(0)

    const applied = await backend.mutation(
      internal.capabilitySupplyProjection.rebuildAllBusinessSupplyProjections,
      {},
    )
    expect(applied).toMatchObject({ isDone: true, continueCursor: null })
    expect(applied.rebuilt).toBe(dry.rebuilt)

    const restored = await searchDocuments(backend, legacySuffix)
    expect(restored).toHaveLength(1)
    expect(restored[0]).toMatchObject({
      businessSlug: legacySuffix,
      offeringRef: `catalog-offering:${legacySuffix}`,
      category: 'Data',
      publicStatus: 'published',
    })
    const current = await searchDocuments(backend, searchableSuffix)
    expect(current).toHaveLength(1)

    // A second full run rebuilds nothing new: the command diffs before writing.
    const replay = await backend.mutation(
      internal.capabilitySupplyProjection.rebuildAllBusinessSupplyProjections,
      {},
    )
    expect(replay).toMatchObject({
      processed: applied.processed,
      rebuilt: applied.rebuilt,
      skipped: applied.skipped,
      isDone: true,
      continueCursor: null,
    })
    expect(await searchDocuments(backend, legacySuffix)).toStrictEqual(restored)
    expect(await searchDocuments(backend, searchableSuffix)).toStrictEqual(current)
  })
})
