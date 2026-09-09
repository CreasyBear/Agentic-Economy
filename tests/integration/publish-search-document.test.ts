import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { publishCapabilityForSeed } from '../../convex/capabilitySupply'
import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import {
  convexModules as modules,
  publishedBusinessOwner,
} from '../helpers/convex-fixtures'
import {
  capabilityPublicationInput,
  registerProviderConnection,
  seedCatalogOffering,
} from './capability-publication-harness'

const suffix = 'bootstrapsearch'

describe('bootstrap publish registry search documents', () => {
  it('makes the published business findable by name and by category, once per offering', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await publishedBusinessOwner(backend, suffix)
    await seedCatalogOffering(backend, businessId, suffix)
    await registerProviderConnection(backend, businessId, suffix)

    // A catalog offering alone leaves business search blind: only a projection
    // rebuild writes `registrySearchDocuments`.
    await expect(
      backend.query(api.registry.searchPublicBusinessOfferingSupply, { query: suffix, limit: 5 }),
    ).resolves.toMatchObject({ kind: 'ok', items: [] })

    const origin = await backend.run(async (ctx) => {
      const accessPath = await ctx.db
        .query('offeringAccessPaths')
        .withIndex('by_offeringRef_and_status', (query) =>
          query.eq('offeringRef', `catalog-offering:${suffix}`).eq('status', 'published'),
        )
        .unique()
      if (accessPath === null) throw new Error('publish_search_access_path_missing')
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
    const input = {
      ...fixture,
      // The bootstrap path derives its pricing config from the offering price,
      // and only accepts canonical AUD micro-units.
      offering: {
        ...fixture.offering,
        presentation: {
          ...fixture.offering.presentation,
          price: {
            kind: 'fixed' as const,
            amount: { currency: 'AUD' as const, units: '12000000', exponent: 6 },
          },
        },
      },
      businessId: String(businessId),
      runtimeEnvironment: 'sandbox' as const,
      origin,
      now: Date.now(),
    }

    const published = await backend.run((ctx) => publishCapabilityForSeed(ctx, input))
    if (published.kind === 'refused') throw new Error(`publish_search_publish_refused:${published.reason}`)

    await expect(
      backend.query(api.registry.searchPublicBusinessOfferingSupply, { query: suffix, limit: 5 }),
    ).resolves.toMatchObject({
      kind: 'ok',
      items: [{ businessId, slug: suffix, name: suffix }],
    })
    await expect(
      backend.query(api.registry.searchPublicBusinessOfferingSupply, { query: 'Data', limit: 5 }),
    ).resolves.toMatchObject({
      kind: 'ok',
      items: [{ businessId, slug: suffix }],
    })

    const republished = await backend.run((ctx) => publishCapabilityForSeed(ctx, input))
    if (republished.kind === 'refused') throw new Error(`publish_search_replay_refused:${republished.reason}`)

    const documents = await backend.run((ctx) =>
      ctx.db
        .query('registrySearchDocuments')
        .withIndex('by_business', (query) => query.eq('businessSlug', suffix))
        .collect(),
    )
    expect(documents).toHaveLength(1)
    expect(documents[0]).toMatchObject({
      businessSlug: suffix,
      businessName: suffix,
      offeringRef: `catalog-offering:${suffix}`,
      category: 'Data',
      publicStatus: 'published',
    })
  })
})
