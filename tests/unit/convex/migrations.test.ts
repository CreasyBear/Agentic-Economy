/// <reference types="vite/client" />
import { register as registerMigrations } from '@convex-dev/migrations/test'
import { describe, expect, it } from 'vitest'

import { convexTest } from 'convex-test'

import { internal } from '../../../convex/_generated/api'
import schema from '../../../convex/schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { convexModules, publishedBusinessOwner } from '../../helpers/convex-fixtures'
import type { Id } from '../../../convex/_generated/dataModel'

async function insertOffering(
  backend: ReturnType<typeof convexTest>,
  businessId: Id<'businesses'>,
  offeringId: string,
  price: { kind: 'on_request' } | undefined,
) {
  await backend.run(async (ctx) => {
    await ctx.db.insert('capabilityOfferings', {
      offeringId,
      businessId,
      networkId: 'ae:public',
      capabilityId: 'cap:price-migration-test',
      version: 1,
      contractDigest: canonicalDigest({ offeringId, part: 'contract' }),
      presentation: {
        label: 'Test offering',
        summary: 'Test offering summary',
        price,
        materialTerms: [],
        commercialRelationship: {
          kind: 'none',
          summary: 'No commercial relationship.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [],
        },
      },
      searchTerms: [],
      registrationEvidenceRefs: [],
      registrationHash: canonicalDigest({ offeringId, part: 'registration' }),
      status: 'active',
      admissionEvidenceRefs: [],
      eligibilityHash: canonicalDigest({ offeringId, part: 'eligibility' }),
      registeredAt: 1,
      updatedAt: 1,
    })
  })
}

// Runs one batch of the migration directly against the mutation handler, the
// same "oneBatchOnly" shape the mounted migrations component uses internally
// when it schedules a batch (see @convex-dev/migrations' define()).
function runOneBatch(backend: ReturnType<typeof convexTest>) {
  return backend.mutation(internal.migrations.removeOfferingPrice, {
    cursor: null,
    dryRun: false,
    oneBatchOnly: true,
  })
}

describe('migrations.removeOfferingPrice', () => {
  it('unsets presentation.price on every capabilityOffering and skips docs already migrated', async () => {
    const backend = convexTest(schema, convexModules)
    registerMigrations(backend)
    const { businessId } = await publishedBusinessOwner(backend, 'price-migration')
    await insertOffering(backend, businessId, 'offering:priced', { kind: 'on_request' })
    await insertOffering(backend, businessId, 'offering:already-unset', undefined)

    const status = await runOneBatch(backend)
    expect(status.isDone).toBe(true)
    expect(status.processed).toBe(2)

    const offerings = await backend.run((ctx) => ctx.db.query('capabilityOfferings').collect())
    expect(offerings).toHaveLength(2)
    for (const offering of offerings) {
      expect(offering.presentation.price).toBeUndefined()
      expect(Object.keys(offering.presentation)).not.toContain('price')
    }
  })

  it('is idempotent on a second run', async () => {
    const backend = convexTest(schema, convexModules)
    registerMigrations(backend)
    const { businessId } = await publishedBusinessOwner(backend, 'price-migration-rerun')
    await insertOffering(backend, businessId, 'offering:rerun', { kind: 'on_request' })

    await runOneBatch(backend)
    const second = await runOneBatch(backend)
    expect(second.isDone).toBe(true)

    const offering = await backend.run((ctx) =>
      ctx.db
        .query('capabilityOfferings')
        .withIndex('by_offeringId', (q) => q.eq('offeringId', 'offering:rerun'))
        .unique(),
    )
    expect(offering?.presentation.price).toBeUndefined()
  })
})

describe('migrations.backfillDirectorySourceRouteRefAndSlug', () => {
  it('computes sourceRouteRef from the retained source JSON and a path slug, and is idempotent', async () => {
    const backend = convexTest(schema, convexModules)
    registerMigrations(backend)
    const generation = 'coinbase-slug-migration'
    const resource = 'https://provider.test/tools/weather'
    const entryId = await backend.run((ctx) => ctx.db.insert('marketExternalRegistryEntries', {
      generation, documentId: 'registry:slug-migration-fixture', source: 'coinbase',
      upstreamServiceId: 'weather', upstreamEndpointId: resource,
      sourceUrl: 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources', endpointUrl: resource,
      name: 'Weather', summary: 'Weather tool', provider: 'provider.test', category: 'weather',
      method: 'POST', tags: [], networks: ['base'], access: 'x402', authority: 'source_metadata_only',
      sourceDigest: `sha256:${'0'.repeat(64)}`, searchText: 'weather', updatedAt: 1,
      directorySourceJson: JSON.stringify({ resourceUrl: resource, method: 'POST' }),
    }))
    // Pre-migration shape: no sourceRouteRef/slug, same as every row written before Well-7.
    await backend.run((ctx) => ctx.db.insert('marketDirectorySearchEntries', {
      generation, resource, entryId, network: '*', category: 'weather', provider: 'provider.test',
      providerKey: 'provider.test', eligible: true, searchText: 'weather', popularOrder: 0, updatedOrder: 0, minimumUsdPriceOrder: Number.MAX_VALUE,
    }))

    const status = await backend.mutation(internal.migrations.backfillDirectorySourceRouteRefAndSlug, {
      cursor: null, dryRun: false, oneBatchOnly: true,
    })
    expect(status.isDone).toBe(true)

    const row = () => backend.run((ctx) => ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_network_and_resource', (q) => q.eq('generation', generation).eq('network', '*').eq('resource', resource))
      .unique())
    const first = await row()
    expect(first?.slug).toBe('tools-weather')
    expect(first?.sourceRouteRef).toMatch(/^sha256:[0-9a-f]{64}$/u)

    const second = await backend.mutation(internal.migrations.backfillDirectorySourceRouteRefAndSlug, {
      cursor: null, dryRun: false, oneBatchOnly: true,
    })
    expect(second.isDone).toBe(true)
    expect(await row()).toEqual(first)
  })

  it('qualifies a colliding path slug with its method instead of touching the earlier resource', async () => {
    const backend = convexTest(schema, convexModules)
    registerMigrations(backend)
    const generation = 'coinbase-slug-collision'
    const getResource = 'https://provider.test/tools/weather'
    const postResource = 'https://provider.test/tools/weather?refresh=true'
    async function insertRow(resource: string, method: string, documentId: string) {
      const entryId = await backend.run((ctx) => ctx.db.insert('marketExternalRegistryEntries', {
        generation, documentId, source: 'coinbase',
        upstreamServiceId: 'weather', upstreamEndpointId: resource,
        sourceUrl: 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources', endpointUrl: resource,
        name: 'Weather', summary: 'Weather tool', provider: 'provider.test', category: 'weather',
        method, tags: [], networks: ['base'], access: 'x402', authority: 'source_metadata_only',
        sourceDigest: `sha256:${'0'.repeat(64)}`, searchText: 'weather', updatedAt: 1,
        directorySourceJson: JSON.stringify({ resourceUrl: resource, method }),
      }))
      await backend.run((ctx) => ctx.db.insert('marketDirectorySearchEntries', {
        generation, resource, entryId, network: '*', category: 'weather', provider: 'provider.test',
        providerKey: 'provider.test', eligible: true, searchText: 'weather', popularOrder: 0, updatedOrder: 0, minimumUsdPriceOrder: Number.MAX_VALUE,
      }))
    }
    await insertRow(getResource, 'GET', 'registry:slug-collision-get')
    await insertRow(postResource, 'POST', 'registry:slug-collision-post')

    let done = false
    while (!done) {
      const status = await backend.mutation(internal.migrations.backfillDirectorySourceRouteRefAndSlug, {
        cursor: null, dryRun: false, oneBatchOnly: true,
      })
      done = status.isDone
    }

    const slugs = await backend.run((ctx) => ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_resource', (q) => q.eq('generation', generation))
      .collect())
    expect(new Set(slugs.map((entry) => entry.slug)).size).toBe(2)
  })
})
