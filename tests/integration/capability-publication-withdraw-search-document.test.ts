import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { publicationPorts, publishCapabilityForSeed } from '../../convex/capabilitySupply'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { withdrawCapabilityCommand } from '@/modules/capability-supply/public'
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

const suffix = 'withdrawsearch'

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
    if (accessPath === null) throw new Error('withdraw_search_access_path_missing')
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

describe('withdraw rebuilds the registry search projection in the same transaction', () => {
  it('drops the stale search document as soon as the withdraw runs, with no sweep', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await publishedBusinessOwner(backend, suffix)
    await seedCatalogOffering(backend, businessId, suffix)
    await registerProviderConnection(backend, businessId, suffix)

    const input = await bootstrapPublishInput(backend, businessId, suffix)
    const published = await backend.run((ctx) => publishCapabilityForSeed(ctx, input))
    if (published.kind === 'refused') {
      throw new Error(`withdraw_search_publish_refused:${published.reason}`)
    }

    expect(await searchDocuments(backend, suffix)).toHaveLength(1)

    // A single publication's own disposition never gates its offering's
    // presence in `registrySearchDocuments` on its own: that table mirrors
    // the catalog offering (`businessOfferings.status`), which stays
    // `published` after a bare capability withdraw. What DOES take the
    // offering (and therefore its search document) out of the projection is
    // its catalog offering going non-`published` - the same fact an owner
    // retiring a listing produces. We land that fact in the same mutation as
    // an otherwise-unrelated capability-publication withdrawal, which is
    // exactly the ordering a bundled "retire this Tool" owner flow produces.
    await backend.run(async (ctx) => {
      const offering = await ctx.db
        .query('businessOfferings')
        .withIndex('by_offeringRef', (query) => query.eq('offeringRef', `catalog-offering:${suffix}`))
        .unique()
      if (offering === null) throw new Error('withdraw_search_offering_missing')
      await ctx.db.patch(offering._id, { status: 'retired', updatedAt: Date.now() })
    })

    // Withdraw through the same publication ports the production withdraw
    // paths use, but without ever calling the separate
    // `rebuildCapabilityOriginSupplyProjection` helper by hand - that call now
    // lives inside `patchPublicationWithdrawn`
    // (capabilitySupplyPublicationPorts.ts), in the same mutation as the
    // `disposition: 'withdrawn'` patch. Before that fix, nothing in this call
    // chain would touch `registrySearchDocuments` at all, so the stale
    // document (still advertising a now-retired offering) would survive
    // until `rebuildAllBusinessSupplyProjections` swept it up later.
    await backend.run(async (ctx) => {
      const ports = publicationPorts(ctx)
      const publication = await ports.loadPublicationAtRevision(
        published.publicationRef,
        published.publicationRevision,
      )
      if (publication === null) throw new Error('withdraw_search_publication_missing')
      const result = await withdrawCapabilityCommand(
        {
          publication,
          evidenceRefs: [`test:withdraw:${suffix}`],
          now: Date.now(),
        },
        ports,
      )
      if (result.kind !== 'withdrawn') {
        throw new Error(`withdraw_search_withdraw_refused:${JSON.stringify(result)}`)
      }
      const documents = await ctx.db
        .query('registrySearchDocuments')
        .withIndex('by_business', (query) => query.eq('businessSlug', suffix))
        .collect()
      expect(documents).toHaveLength(0)
    })

    // Confirm it stays gone once the transaction commits too.
    expect(await searchDocuments(backend, suffix)).toHaveLength(0)
  })
})
