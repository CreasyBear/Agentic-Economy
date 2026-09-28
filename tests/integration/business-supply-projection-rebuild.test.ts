import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

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
    expect(dry).toMatchObject({ isDone: false, processed: 1 })
    if (dry.continueCursor === null) throw new Error('projection_rebuild_dry_run_cursor_missing')
    const dryNext = await backend.mutation(
      internal.capabilitySupplyProjection.rebuildAllBusinessSupplyProjections,
      { cursor: dry.continueCursor, dryRun: true },
    )
    expect(dry.rebuilt + dryNext.rebuilt).toBe(2)
    expect(dry.processed + dryNext.processed).toBe(dry.rebuilt + dryNext.rebuilt + dry.skipped + dryNext.skipped)
    // A dry run reports without writing.
    expect(await searchDocuments(backend, legacySuffix)).toHaveLength(0)

    const applied = await backend.mutation(
      internal.capabilitySupplyProjection.rebuildAllBusinessSupplyProjections,
      {},
    )
    expect(applied).toMatchObject({ isDone: false, processed: 1 })
    expect(applied.rebuilt).toBe(dry.rebuilt)
    await backend.finishAllScheduledFunctions(() => undefined)

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
      isDone: false,
    })
    await backend.finishAllScheduledFunctions(() => undefined)
    expect(await searchDocuments(backend, legacySuffix)).toStrictEqual(restored)
    expect(await searchDocuments(backend, searchableSuffix)).toStrictEqual(current)
  })

  it('retracts registrySearchDocuments for unpublished businesses during the full sweep', async () => {
    const slugSuffix = 'rebuildsweepunpub'
    const backend = convexTest(schema, modules)
    const businessId = await publishBusiness(backend, slugSuffix)
    expect(await searchDocuments(backend, slugSuffix)).toHaveLength(1)

    await backend.run(async (ctx) => {
      await ctx.db.patch(businessId, { publicStatus: 'unpublished', updatedAt: Date.now() })
    })

    const applied = await backend.mutation(
      internal.capabilitySupplyProjection.rebuildAllBusinessSupplyProjections,
      {},
    )
    expect(applied).toMatchObject({ isDone: true, continueCursor: null })
    expect(await searchDocuments(backend, slugSuffix)).toHaveLength(0)
  })

  it('retracts registrySearchDocuments for suppressed businesses during the full sweep', async () => {
    const slugSuffix = 'rebuildsweepsuppr'
    const backend = convexTest(schema, modules)
    const businessId = await publishBusiness(backend, slugSuffix)
    expect(await searchDocuments(backend, slugSuffix)).toHaveLength(1)

    await backend.run(async (ctx) => {
      await ctx.db.patch(businessId, { suppressedAt: Date.now(), updatedAt: Date.now() })
    })

    const applied = await backend.mutation(
      internal.capabilitySupplyProjection.rebuildAllBusinessSupplyProjections,
      {},
    )
    expect(applied).toMatchObject({ isDone: true, continueCursor: null })
    expect(await searchDocuments(backend, slugSuffix)).toHaveLength(0)
  })

  it('converges an oversized published fleet in bounded pages and retracts it when suppressed', async () => {
    const suffix = 'rebuildoversized'
    const backend = convexTest(schema, modules)
    const businessId = await publishBusiness(backend, suffix)
    const original = await backend.run(async (ctx) => {
      const offering = await ctx.db.query('businessOfferings')
        .withIndex('by_businessId_and_offeringRef', (q) => q.eq('businessId', businessId))
        .unique()
      if (!offering) throw new Error('fixture_offering_missing')
      const revision = await ctx.db.query('businessOfferingRevisions')
        .withIndex('by_offeringRef_and_revision', (q) => q.eq('offeringRef', offering.offeringRef).eq('revision', offering.currentRevision))
        .unique()
      if (!revision) throw new Error('fixture_revision_missing')
      return { offering, revision }
    })
    for (let base = 0; base < 100; base += 10) {
      await backend.run(async (ctx) => {
        for (let index = base; index < base + 10; index += 1) {
          const offeringRef = `catalog-offering:${suffix}:${index}`
          const { _id: _offeringId, _creationTime: _offeringCreated, ...offering } = original.offering
          const { _id: _revisionId, _creationTime: _revisionCreated, ...revision } = original.revision
          await ctx.db.insert('businessOfferings', { ...offering, offeringRef })
          await ctx.db.insert('businessOfferingRevisions', { ...revision, offeringRef, name: `Fleet Tool ${index}` })
        }
      })
    }
    const originalSearch = (await searchDocuments(backend, suffix))[0]
    const canonicalPublication = await backend.run((ctx) => ctx.db.query('capabilityPublications')
      .withIndex('by_businessId_and_disposition', (q) => q.eq('businessId', businessId).eq('disposition', 'current'))
      .unique())
    expect(originalSearch).toBeDefined()
    expect(canonicalPublication?.disposition).toBe('current')
    await backend.run(async (ctx) => {
      const source = await ctx.db.query('registrySearchDocuments')
        .withIndex('by_business', (q) => q.eq('businessSlug', suffix))
        .unique()
      if (!source) throw new Error('fixture_search_document_missing')
      const { _id, _creationTime, ...document } = source
      await ctx.db.insert('registrySearchDocuments', {
        ...document, documentId: `${suffix}__orphan`,
        offeringRef: 'catalog-offering:orphan',
      })
    })
    expect(await searchDocuments(backend, suffix)).toHaveLength(2)
    vi.useFakeTimers()
    const providerFetch = vi.spyOn(globalThis, 'fetch')
    const initial = await backend.mutation(internal.capabilitySupplyProjection.rebuildAllBusinessSupplyProjections, {})
    expect(initial.skipped).toBeGreaterThanOrEqual(1)
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    const search = await searchDocuments(backend, suffix)
    expect(search).toHaveLength(101)
    expect({
      missing: Array.from({ length: 100 }, (_, index) => index)
        .filter((index) => !search.some((row) => row.offeringRef === `catalog-offering:${suffix}:${index}`)),
      orphan: search.some((row) => row.offeringRef === 'catalog-offering:orphan'),
    }).toEqual({ missing: [], orphan: false })
    expect(search.every((row) => row.publicStatus === 'published')).toBe(true)
    expect(search.find((row) => row.offeringRef === `catalog-offering:${suffix}`)?.firstRequestMode)
      .toBe(originalSearch?.firstRequestMode)
    expect(await backend.run((ctx) => ctx.db.query('capabilityPublications')
      .withIndex('by_businessId_and_disposition', (q) => q.eq('businessId', businessId).eq('disposition', 'current'))
      .unique())).toStrictEqual(canonicalPublication)
    const replay = await backend.mutation(internal.capabilitySupplyProjection.rebuildAllBusinessSupplyProjections, {})
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    expect(replay.skipped).toBeGreaterThanOrEqual(1)
    expect(await searchDocuments(backend, suffix)).toStrictEqual(search)

    await backend.run(async (ctx) => ctx.db.patch(businessId, { suppressedAt: Date.now(), updatedAt: Date.now() }))
    await backend.mutation(internal.capabilitySupplyProjection.rebuildAllBusinessSupplyProjections, {})
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    expect(await searchDocuments(backend, suffix)).toHaveLength(0)
    expect(providerFetch).not.toHaveBeenCalled()
  })
})
