import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { publishCapabilityForSeed } from '../../convex/capabilitySupply'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { MAX_ELIGIBLE_SUPPLY } from '@/modules/capability-supply/public'
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

const suffix = 'bootstrapsearch'
const providerSuffix = 'providersearch'
const oversizedSuffix = 'oversizedsearch'
const overCapacitySuffix = 'overcapacitysearch'

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
  const fixture = capabilityPublicationInput(businessId, slugSuffix)
  return {
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
}

async function searchDocuments(backend: ConvexFixtureBackend, slug: string) {
  return await backend.run((ctx) =>
    ctx.db
      .query('registrySearchDocuments')
      .withIndex('by_business', (query) => query.eq('businessSlug', slug))
      .collect(),
  )
}

async function makeProgrammableProvider(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
  slugSuffix: string,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.patch(businessId, {
      businessContext: {
        kind: 'programmable_provider',
        providerIdentifier: `provider:test:${slugSuffix}`,
        website: `https://${slugSuffix}.example.test`,
      },
    })
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

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

    const input = await bootstrapPublishInput(backend, businessId, suffix)

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

    const documents = await searchDocuments(backend, suffix)
    expect(documents).toHaveLength(1)
    expect(documents[0]).toMatchObject({
      businessSlug: suffix,
      businessName: suffix,
      offeringRef: `catalog-offering:${suffix}`,
      category: 'Data',
      publicStatus: 'published',
    })
  })

  // Every x402 provider is a programmable provider. The publish path used to
  // skip the projection rebuild for them outright, so none was ever searchable
  // until an unrelated maintenance sweep ran.
  it('writes a search document for a programmable provider without any maintenance sweep', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await publishedBusinessOwner(backend, providerSuffix)
    await makeProgrammableProvider(backend, businessId, providerSuffix)
    await seedCatalogOffering(backend, businessId, providerSuffix)
    await registerProviderConnection(backend, businessId, providerSuffix)

    const input = await bootstrapPublishInput(backend, businessId, providerSuffix)
    const published = await backend.run((ctx) => publishCapabilityForSeed(ctx, input))
    if (published.kind === 'refused') {
      throw new Error(`publish_search_provider_refused:${published.reason}`)
    }

    const documents = await searchDocuments(backend, providerSuffix)
    expect(documents).toHaveLength(1)
    expect(documents[0]).toMatchObject({
      businessSlug: providerSuffix,
      offeringRef: `catalog-offering:${providerSuffix}`,
      category: 'Data',
      publicStatus: 'published',
    })
    await expect(
      backend.query(api.registry.searchPublicBusinessOfferingSupply, {
        query: providerSuffix,
        limit: 5,
      }),
    ).resolves.toMatchObject({
      kind: 'ok',
      items: [{ businessId, slug: providerSuffix }],
    })
  })

  it('defers the rebuild instead of failing the publish when the fleet outgrows one page', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await publishedBusinessOwner(backend, oversizedSuffix)
    await makeProgrammableProvider(backend, businessId, oversizedSuffix)
    await seedCatalogOffering(backend, businessId, oversizedSuffix)
    await registerProviderConnection(backend, businessId, oversizedSuffix)

    const input = await bootstrapPublishInput(backend, businessId, oversizedSuffix)

    // One more offering than the rebuild reads in a single transaction, so the
    // command throws `business_catalog_rebuild_requires_pagination`. Only the
    // `businessOfferings` rows matter: the page cap is checked before any
    // revision or access path is read.
    await backend.run(async (ctx) => {
      for (let index = 0; index < 100; index += 1) {
        await ctx.db.insert('businessOfferings', {
          offeringRef: `catalog-offering:${oversizedSuffix}:filler:${index}`,
          businessId,
          currentRevision: 1,
          status: 'published',
          createdAt: 1,
          updatedAt: 1,
        })
      }
    })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const published = await backend.run((ctx) => publishCapabilityForSeed(ctx, input))
    if (published.kind === 'refused') {
      throw new Error(`publish_search_oversized_refused:${published.reason}`)
    }

    // The publish succeeded and the deferred rebuild is recorded as a fact, not
    // swallowed silently: `rebuildAllBusinessSupplyProjections` is the recovery.
    expect(warn.mock.calls.map(([line]) => line)).toContain(
      JSON.stringify({
        kind: 'business_supply_projection_deferred',
        businessId,
        reason: 'requires_pagination',
      }),
    )
    expect(await searchDocuments(backend, oversizedSuffix)).toHaveLength(0)
  })

  it('defers the rebuild instead of failing the publish when active capability offerings outgrow the eligible supply cap', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await publishedBusinessOwner(backend, overCapacitySuffix)
    await makeProgrammableProvider(backend, businessId, overCapacitySuffix)
    await seedCatalogOffering(backend, businessId, overCapacitySuffix)
    await registerProviderConnection(backend, businessId, overCapacitySuffix)

    const input = await bootstrapPublishInput(backend, businessId, overCapacitySuffix)

    // One more active `capabilityOfferings` row than
    // `deriveBusinessOfferingSupportFromCapabilitySupply` reads in a single
    // transaction (`MAX_ELIGIBLE_SUPPLY`), so the derive step - not the
    // rebuild command - throws `capability_offering_capacity_exceeded`. Only
    // `businessId`/`status` matter to the count; the rest of the row is
    // filler that satisfies the schema.
    await backend.run(async (ctx) => {
      for (let index = 0; index <= MAX_ELIGIBLE_SUPPLY; index += 1) {
        await ctx.db.insert('capabilityOfferings', {
          offeringId: `co:${overCapacitySuffix}:filler:${index}`,
          businessId,
          networkId: 'ae:public',
          capabilityId: `independent.${overCapacitySuffix}.filler`,
          version: 1,
          contractDigest: 'digest:filler',
          presentation: {
            label: 'filler',
            summary: 'filler',
            price: { kind: 'on_request' as const },
            materialTerms: [],
            commercialRelationship: {
              kind: 'none' as const,
              summary: 'filler',
              influencesEligibility: false,
              influencesInclusion: false,
              influencesOrder: false,
              evidenceRefs: [],
            },
          },
          searchTerms: [],
          registrationEvidenceRefs: [],
          registrationHash: 'hash:filler',
          status: 'active',
          admissionEvidenceRefs: [],
          eligibilityHash: 'hash:filler',
          registeredAt: 1,
          updatedAt: 1,
        })
      }
    })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const published = await backend.run((ctx) => publishCapabilityForSeed(ctx, input))
    if (published.kind === 'refused') {
      throw new Error(`publish_search_over_capacity_refused:${published.reason}`)
    }

    // The publish succeeded and the deferred rebuild is recorded as a fact, not
    // swallowed silently: `rebuildAllBusinessSupplyProjections` is the recovery.
    expect(warn.mock.calls.map(([line]) => line)).toContain(
      JSON.stringify({
        kind: 'business_supply_projection_deferred',
        businessId,
        reason: 'capacity_exceeded',
      }),
    )
    expect(await searchDocuments(backend, overCapacitySuffix)).toHaveLength(0)
  })
})
