import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { publishCapabilityForSeed } from '../../convex/capabilitySupply'
import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  rebuildBusinessSupplyProjectionSnapshotCommand,
} from '../../convex/capabilitySupplyProjection'
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

const suffix = 'supplyretract'

async function bootstrapPublishInput(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
  slugSuffix: string,
) {
  const origin = await backend.run(async (ctx) => {
    const accessPath = await ctx.db
      .query('offeringAccessPaths')
      .withIndex('by_offeringRef_and_status', (query) =>
        query.eq('offeringRef', `catalog-offering:${slugSuffix}`).eq('status', 'published'),
      )
      .unique()
    if (accessPath === null) throw new Error('supply_retract_access_path_missing')
    return {
      kind: 'catalog_offering' as const,
      offeringRef: accessPath.offeringRef,
      offeringRevision: accessPath.offeringRevision,
      offeringSourceHash: accessPath.offeringSourceHash,
      declaredAccessPathRef: accessPath.accessPathRef,
      accessPathSourceHash: accessPath.sourceHash,
    }
  })
  const fixture = capabilityPublicationInput(businessId, slugSuffix)
  return {
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
  }
}

async function searchDocuments(backend: ConvexFixtureBackend, slug: string) {
  return await backend.run((ctx) =>
    ctx.db
      .query('registrySearchDocuments')
      .withIndex('by_business', (query) => query.eq('businessSlug', slug))
      .collect(),
  )
}

async function seedPublishedBusinessWithSearchDocument(slugSuffix: string) {
  const backend = convexTest(schema, modules)
  const { businessId } = await publishedBusinessOwner(backend, slugSuffix)
  await seedCatalogOffering(backend, businessId, slugSuffix)
  await registerProviderConnection(backend, businessId, slugSuffix)

  const input = await bootstrapPublishInput(backend, businessId, slugSuffix)
  const published = await backend.run((ctx) => publishCapabilityForSeed(ctx, input))
  if (published.kind === 'refused') {
    throw new Error(`supply_retract_publish_refused:${published.reason}`)
  }
  expect(await searchDocuments(backend, slugSuffix)).toHaveLength(1)
  return { backend, businessId }
}

async function runRebuild(backend: ConvexFixtureBackend, businessId: Id<'businesses'>) {
  await backend.run(async (ctx) => {
    const now = Date.now()
    const support = await deriveBusinessOfferingSupportFromCapabilitySupply(ctx.db, businessId, now)
    await rebuildBusinessSupplyProjectionSnapshotCommand({
      db: ctx.db,
      sourceDb: ctx.db,
      businessId,
      support,
      now,
    })
  })
}

describe('rebuildBusinessSupplyProjectionSnapshotCommand retracts search documents', () => {
  it('deletes registrySearchDocuments once a business stops being published', async () => {
    const slugSuffix = `${suffix}unpub`
    const { backend, businessId } = await seedPublishedBusinessWithSearchDocument(slugSuffix)

    await backend.run(async (ctx) => {
      await ctx.db.patch(businessId, { publicStatus: 'unpublished', updatedAt: Date.now() })
    })

    await runRebuild(backend, businessId)

    expect(await searchDocuments(backend, slugSuffix)).toHaveLength(0)
  })

  it('deletes registrySearchDocuments once a published business is suppressed', async () => {
    const slugSuffix = `${suffix}suppr`
    const { backend, businessId } = await seedPublishedBusinessWithSearchDocument(slugSuffix)

    await backend.run(async (ctx) => {
      // publicStatus stays 'published' - suppressedAt alone must gate this out,
      // matching every other eligibility/routing check that honours it.
      await ctx.db.patch(businessId, { suppressedAt: Date.now(), updatedAt: Date.now() })
    })

    await runRebuild(backend, businessId)

    expect(await searchDocuments(backend, slugSuffix)).toHaveLength(0)
  })
})
