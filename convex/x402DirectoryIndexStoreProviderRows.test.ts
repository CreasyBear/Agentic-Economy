/// <reference types="vite/client" />
import { register as registerAggregate } from '@convex-dev/aggregate/test'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import { upsertProviderDirectoryRows } from './x402DirectoryIndexStore'
import { ANALYTICS_VERSION } from './lib/x402DirectoryIndex/analytics'
import { directoryFacets } from './lib/x402DirectoryIndex/facets'
import schema from './schema'
import { publishedBusinessOwner } from '../tests/helpers/convex-fixtures'

const modules = import.meta.glob('./**/*.ts')

function backendWithAggregates() {
  const backend = convexTest(schema, modules)
  registerAggregate(backend, 'marketDirectoryFacets')
  return backend
}

const GENERATION = 'coinbase-lane-c-test'
const ROUTE_REF = 'sha256:shared-route-lane-c-test'
const COINBASE_RESOURCE = 'https://provider.example.com/v1/lookup'

/** Well 8 Lane C: exercises upsertProviderDirectoryRows directly - the write
 * path shared by the publish/withdraw hooks and the hourly reconcile sweep. */
describe('provider directory rows (Well 8 Lane C)', () => {
  it('absorbs a Coinbase row sharing sourceRouteRef, then lets it be restored once the provider row is withdrawn', async () => {
    const backend = backendWithAggregates()
    const { businessId } = await publishedBusinessOwner(backend, 'lane-c-provider')

    const offeringId = 'offering:lane-c-test'
    await backend.run(async (ctx) => {
      // Active directory generation, otherwise upsertProviderDirectoryRows is a no-op.
      const generationId = await ctx.db.insert('marketExternalRegistryGenerations', {
        generation: GENERATION, source: 'coinbase', status: 'complete', startedAt: 1, completedAt: 1,
        ingestedCount: 1, pagesFetched: 1, observations: 1, duplicateObservations: 0,
        terminalObserved: true, analyticsVersion: ANALYTICS_VERSION, analyticsStatus: 'ready',
      })
      await ctx.db.insert('marketExternalRegistryState', {
        key: 'coinbase', activeGeneration: GENERATION, lastAttemptAt: 1, lastAttemptStatus: 'complete',
      })

      // A pre-existing Coinbase row observed at the same real-world route.
      const coinbaseEntryId = await ctx.db.insert('marketExternalRegistryEntries', {
        generation: GENERATION, documentId: 'registry:coinbase-shared-route', source: 'coinbase',
        upstreamServiceId: 'svc', upstreamEndpointId: COINBASE_RESOURCE,
        sourceUrl: 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources', endpointUrl: COINBASE_RESOURCE,
        name: 'Shared Lookup', summary: 'Coinbase-observed summary', provider: 'provider.example.com', category: 'search',
        tags: [], networks: ['eip155:8453'], access: 'x402', authority: 'source_metadata_only',
        sourceDigest: `sha256:${'a'.repeat(64)}`, searchText: 'shared lookup', updatedAt: 1,
        directoryEntryJson: JSON.stringify({
          resource: COINBASE_RESOURCE, title: 'Shared Lookup', description: 'Coinbase-observed summary',
          protocol: 'x402', provider: 'provider.example.com', prices: [], metadataJson: '',
        }),
        directorySourceJson: JSON.stringify({ title: 'Shared Lookup' }),
        directoryCategory: 'search', lastSeenRunAt: 1,
      })
      for (const network of ['*', 'eip155:8453']) {
        await ctx.db.insert('marketDirectorySearchEntries', {
          generation: GENERATION, resource: COINBASE_RESOURCE, entryId: coinbaseEntryId, network,
          category: 'search', provider: 'provider.example.com', providerKey: 'provider.example.com',
          eligible: true, sourceRouteRef: ROUTE_REF, slug: 'lookup', searchText: 'shared lookup',
          popularOrder: -1, updatedOrder: -1, minimumUsdPriceOrder: Number.MAX_VALUE,
        })
      }
      // Matching facet memberships - a row written through the real
      // writeSource() path always has these; the fixture mirrors that
      // invariant so absorbCoinbaseRowAtRoute's teardown has something real
      // to delete (same strict-delete pattern x402DirectoryIndexStore.cleanup
      // already relies on for a genuine row).
      const facetKeys: [string, string | number][] = [['category', 'search'], ['provider', 'provider.example.com'], ['network', 'eip155:8453']]
      for (const key of facetKeys) {
        await directoryFacets.insert(ctx, { namespace: GENERATION, key, id: COINBASE_RESOURCE })
      }

      // The reviewed-tier publication that will claim the same sourceRouteRef.
      await ctx.db.insert('capabilityOfferings', {
        offeringId, businessId, networkId: 'eip155:8453', capabilityId: 'lookup.exact', version: 1,
        contractDigest: `sha256:${'b'.repeat(64)}`,
        presentation: {
          label: 'Provider Lookup', summary: 'Provider-owned lookup Tool',
          materialTerms: [],
          commercialRelationship: { kind: 'none', summary: '', influencesEligibility: false, influencesInclusion: false, influencesOrder: false, evidenceRefs: [] },
        },
        searchTerms: [], registrationEvidenceRefs: [], registrationHash: `sha256:${'c'.repeat(64)}`,
        status: 'active', admissionEvidenceRefs: [], eligibilityHash: `sha256:${'d'.repeat(64)}`,
        registeredAt: 1, updatedAt: 1,
      })
      await ctx.db.insert('capabilityPublications', {
        publicationRef: 'publication:lane-c-test', toolRef: 'operation:lane-c-test', revision: 1,
        businessId, networkId: 'eip155:8453', runtimeEnvironment: 'production',
        capabilityId: 'lookup.exact', version: 1, contractDigest: `sha256:${'b'.repeat(64)}`,
        sourceKind: 'x402', sourceRevision: '1', sourceDigest: `sha256:${'e'.repeat(64)}`,
        sourceRouteRef: ROUTE_REF,
        publisherRef: 'system:test', authorityMode: 'provider_owned', provenanceDigest: `sha256:${'f'.repeat(64)}`,
        offeringId, bindingId: 'binding:lane-c-test', disposition: 'current',
        credentialState: 'unobserved', healthState: 'unobserved',
        readinessEvidenceRefs: [], registrationEvidenceRefs: ['test:lane-c'],
        createdAt: 1, updatedAt: 1,
      })
      return generationId
    })

    const publication = await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (q) => q.eq('publicationRef', 'publication:lane-c-test').eq('revision', 1))
        .unique()
      if (row === null) throw new Error('fixture publication missing')
      return row
    })

    await backend.run(async (ctx) => upsertProviderDirectoryRows(ctx, publication))

    const afterPublish = await backend.run(async (ctx) => await ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_sourceRouteRef', (q) => q.eq('generation', GENERATION).eq('sourceRouteRef', ROUTE_REF))
      .collect())
    // The Coinbase rows (network '*' and eip155:8453) are absorbed; only the
    // provider's own two rows (same two networks) remain, both source: 'provider'.
    expect(afterPublish).toHaveLength(2)
    for (const row of afterPublish) {
      expect(row.source).toBe('provider')
      expect(row.providerKey).toBe('lane-c-provider')
      expect(row.slug).toBe('provider-lookup')
    }
    const starRow = afterPublish.find((row) => row.network === '*')
    expect(starRow).toBeDefined()
    if (starRow === undefined) return
    const entry = await backend.run(async (ctx) => await ctx.db.get(starRow.entryId))
    expect(entry?.source).toBe('provider')
    expect(entry?.name).toBe('Provider Lookup')

    // The old Coinbase registry entry (and its facet memberships) are gone -
    // absorbed, not merely shadowed.
    const staleCoinbaseEntry = await backend.run(async (ctx) => await ctx.db.query('marketExternalRegistryEntries')
      .withIndex('by_generation_and_documentId', (q) => q.eq('generation', GENERATION).eq('documentId', 'registry:coinbase-shared-route'))
      .unique())
    expect(staleCoinbaseEntry).toBeNull()

    // Withdraw: the provider row is removed...
    const withdrawn = { ...publication, disposition: 'withdrawn' as const }
    await backend.run(async (ctx) => upsertProviderDirectoryRows(ctx, withdrawn))
    const afterWithdraw = await backend.run(async (ctx) => await ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_sourceRouteRef', (q) => q.eq('generation', GENERATION).eq('sourceRouteRef', ROUTE_REF))
      .collect())
    expect(afterWithdraw).toHaveLength(0)

    // ...and no provider row claims the route any longer, so Coinbase's own
    // writeSource() suppression check (x402DirectoryIndexStore.ts) would no
    // longer refuse to reinsert it - "restored on the next refresh tier".
    const remainingProviderClaim = await backend.run(async (ctx) => await ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_sourceRouteRef', (q) => q.eq('generation', GENERATION).eq('sourceRouteRef', ROUTE_REF))
      .filter((q) => q.eq(q.field('source'), 'provider'))
      .first())
    expect(remainingProviderClaim).toBeNull()
  })

  it('resolves the owner detail route by slug, scoped to the requesting owner', async () => {
    const backend = backendWithAggregates()
    const { businessId, owner } = await publishedBusinessOwner(backend, 'lane-c-owner-route')

    const offeringId = 'offering:lane-c-owner-route'
    const offeringRef = 'offering:lane-c-owner-route:catalog'
    await backend.run(async (ctx) => {
      await ctx.db.insert('marketExternalRegistryGenerations', {
        generation: GENERATION, source: 'coinbase', status: 'complete', startedAt: 1, completedAt: 1,
        ingestedCount: 0, pagesFetched: 1, observations: 0, duplicateObservations: 0,
        terminalObserved: true, analyticsVersion: ANALYTICS_VERSION, analyticsStatus: 'ready',
      })
      await ctx.db.insert('marketExternalRegistryState', {
        key: 'coinbase', activeGeneration: GENERATION, lastAttemptAt: 1, lastAttemptStatus: 'complete',
      })
      await ctx.db.insert('capabilityOfferings', {
        offeringId, businessId, networkId: 'eip155:8453', capabilityId: 'lookup.exact', version: 1,
        contractDigest: `sha256:${'b'.repeat(64)}`,
        origin: { kind: 'catalog_offering', offeringRef, offeringRevision: 1, offeringSourceHash: `sha256:${'g'.repeat(64)}` },
        presentation: {
          label: 'Owner Route Lookup', summary: 'Resolves by slug for the owner workspace',
          materialTerms: [],
          commercialRelationship: { kind: 'none', summary: '', influencesEligibility: false, influencesInclusion: false, influencesOrder: false, evidenceRefs: [] },
        },
        searchTerms: [], registrationEvidenceRefs: [], registrationHash: `sha256:${'c'.repeat(64)}`,
        status: 'active', admissionEvidenceRefs: [], eligibilityHash: `sha256:${'d'.repeat(64)}`,
        registeredAt: 1, updatedAt: 1,
      })
      await ctx.db.insert('capabilityPublications', {
        publicationRef: 'publication:lane-c-owner-route', toolRef: 'operation:lane-c-owner-route', revision: 1,
        businessId, networkId: 'eip155:8453', runtimeEnvironment: 'production',
        capabilityId: 'lookup.exact', version: 1, contractDigest: `sha256:${'b'.repeat(64)}`,
        sourceKind: 'openapi_http', sourceRevision: '1', sourceDigest: `sha256:${'e'.repeat(64)}`,
        sourceRouteRef: 'sha256:owner-route-test',
        publisherRef: 'system:test', authorityMode: 'provider_owned', provenanceDigest: `sha256:${'f'.repeat(64)}`,
        offeringId, bindingId: 'binding:lane-c-owner-route', disposition: 'current',
        credentialState: 'unobserved', healthState: 'unobserved',
        readinessEvidenceRefs: [], registrationEvidenceRefs: ['test:lane-c'],
        createdAt: 1, updatedAt: 1,
      })
      // capabilityProviderToolProjections is the owner workspace's own
      // denormalised row (written by capabilityProviderToolProjection.ts on
      // every publish) - inserted directly here rather than re-running the
      // whole publish command pipeline.
      await ctx.db.insert('capabilityProviderToolProjections', {
        businessId, providerRef: 'test', toolRef: 'operation:lane-c-owner-route',
        offeringRef, offeringRevision: 1, publicationRef: 'publication:lane-c-owner-route', publicationRevision: 1,
        offeringId, bindingId: 'binding:lane-c-owner-route', updatedAt: 1,
      })
    })
    const publication = await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (q) => q.eq('publicationRef', 'publication:lane-c-owner-route').eq('revision', 1))
        .unique()
      if (row === null) throw new Error('fixture publication missing')
      return row
    })
    await backend.run(async (ctx) => upsertProviderDirectoryRows(ctx, publication))

    const resolved = await owner.query(api.capabilityProviderTools.resolveOwnerToolSlug, {
      businessId, slug: 'owner-route-lookup',
    })
    expect(resolved).toEqual({ offeringRef })

    // A different (unauthenticated / wrong-owner-scoped) caller can't resolve it.
    const anonymous = await backend.query(api.capabilityProviderTools.resolveOwnerToolSlug, {
      businessId, slug: 'owner-route-lookup',
    })
    expect(anonymous).toBeNull()
  })

  it('is a no-op with no active directory generation', async () => {
    const backend = backendWithAggregates()
    const { businessId } = await publishedBusinessOwner(backend, 'lane-c-no-generation')
    const publication = {
      disposition: 'current' as const, authorityMode: 'provider_owned' as const,
      sourceRouteRef: 'sha256:no-generation', businessId,
      offeringId: 'offering:no-generation', networkId: 'eip155:8453', sourceKind: 'x402' as const,
    }
    await backend.run(async (ctx) => {
      await upsertProviderDirectoryRows(ctx, publication as Parameters<typeof upsertProviderDirectoryRows>[1])
    })
    const rows = await backend.run(async (ctx) => await ctx.db.query('marketExternalRegistryEntries').collect())
    expect(rows).toHaveLength(0)
  })
})
