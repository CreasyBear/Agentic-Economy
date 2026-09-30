/// <reference types="vite/client" />
import { register as registerAggregate } from '@convex-dev/aggregate/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../../_generated/api'
import { upsertProviderDirectoryRows } from './providerRows'
import { providerDocumentId } from './providerProjection'
import { ANALYTICS_VERSION } from './analytics'
import { directoryFacets } from './facets'
import schema from '../../../schema'
import { convexModules as modules, publishedBusinessOwner } from '../../../../tests/helpers/convex-fixtures'

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
  beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production'))
  afterEach(() => vi.unstubAllEnvs())
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
      await ctx.db.insert('capabilityTransportBindings', {
        bindingId: 'binding:lane-c-test', offeringId, networkId: 'eip155:8453',
        capabilityId: 'lookup.exact', version: 1, contractDigest: `sha256:${'b'.repeat(64)}`,
        endpointUrl: COINBASE_RESOURCE, authority: { kind: 'public_upstream' },
        continuation: { kind: 'single_response', evidenceRefs: [] },
        cancellation: { kind: 'unsupported', evidenceRefs: [] },
        adapterId: 'http-json:v1', configJson: '{}', configDigest: `sha256:${'a'.repeat(64)}`,
        registrationEvidenceRefs: [], registrationHash: `sha256:${'c'.repeat(64)}`,
        admission: 'admitted', conformance: 'conformant',
        admissionEvidenceRefs: [], conformanceEvidenceRefs: [],
        eligibilityHash: `sha256:${'d'.repeat(64)}`, registeredAt: 1, updatedAt: 1,
      })
      await ctx.db.insert('capabilityPublications', {
        publicationRef: 'publication:lane-c-test', toolRef: 'operation:lane-c-test', revision: 1,
        businessId, networkId: 'ae:public', runtimeEnvironment: 'production',
        pricingConfigJson: JSON.stringify({
          version: 'pricing:v3', kind: 'managed_x402', effectTiming: 'payment_required_before_effect',
          sourceRequirement: { network: 'eip155:8453', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', atomicUnits: '1000000' },
          pricingPolicyRef: 'pricing-policy:test', publicDisplay: 'on_request',
        }),
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
    await backend.run(async (ctx) => upsertProviderDirectoryRows(ctx, publication))

    const afterPublish = await backend.run(async (ctx) => await ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_sourceRouteRef', (q) => q.eq('generation', GENERATION).eq('sourceRouteRef', ROUTE_REF))
      .collect())
    // The Coinbase rows (network '*' and eip155:8453) are absorbed; only the
    // provider's own two rows (same two networks) remain, both source: 'provider'.
    expect(afterPublish).toHaveLength(2)
    expect(afterPublish.map(row => row.network).sort()).toEqual(['*', 'eip155:8453'])
    for (const row of afterPublish) {
      expect(row.source).toBe('provider')
      expect(row.providerKey).toBe('lane-c-provider')
      expect(row.slug).toBe('v1-lookup')
    }
    const starRow = afterPublish.find((row) => row.network === '*')
    expect(starRow).toBeDefined()
    if (starRow === undefined) return
    const entry = await backend.run(async (ctx) => await ctx.db.get(starRow.entryId))
    expect(entry?.source).toBe('provider')
    expect(entry?.name).toBe('Provider Lookup')
    expect(entry?.networks).toEqual(['eip155:8453'])
    expect(JSON.parse(entry?.directoryEntryJson ?? '{}').prices).toEqual([
      expect.objectContaining({ network: 'eip155:8453' }),
    ])
    expect(publication.networkId).toBe('ae:public')
    // The fixture proves source precedence, not Call eligibility: its placeholder
    // ToolRef has no registered contract or readiness observation.
    expect(await backend.query(api.x402DirectoryIndex.searchCompact, {
      query: 'lookup', access: 'ae_callable', paginationOpts: { cursor: null, numItems: 8 },
    })).toMatchObject({ kind: 'ok', page: [] })
    const nonCallable = await backend.query(api.x402DirectoryIndex.searchCompact, {
      query: 'lookup', access: 'external_listing', paginationOpts: { cursor: null, numItems: 8 },
    })
    expect(nonCallable).toMatchObject({ kind: 'ok', page: [{
      id: entry?.documentId, source: 'provider', sourceRouteRef: ROUTE_REF,
      title: 'Provider Lookup', choice: { access: 'unavailable', sourceRouteRef: ROUTE_REF },
    }] })
    if (nonCallable.kind === 'ok') expect(nonCallable.page[0]?.toolRef).toBeUndefined()

    // The old Coinbase registry entry (and its facet memberships) are gone -
    // absorbed, not merely shadowed.
    const staleCoinbaseEntry = await backend.run(async (ctx) => await ctx.db.query('marketExternalRegistryEntries')
      .withIndex('by_generation_and_documentId', (q) => q.eq('generation', GENERATION).eq('documentId', 'registry:coinbase-shared-route'))
      .unique())
    expect(staleCoinbaseEntry).toBeNull()

    // Missing or malformed managed pricing cannot turn a catalog namespace
    // into payment-network evidence. Reprojection also removes stale facets.
    const { pricingConfigJson: _originalPricing, ...withoutManagedPricing } = publication
    for (const pricingConfigJson of [undefined, '{bad-json']) {
      await backend.run(async (ctx) => upsertProviderDirectoryRows(ctx, {
        ...withoutManagedPricing,
        ...(pricingConfigJson === undefined ? {} : { pricingConfigJson }),
      }))
      const withoutPricing = await backend.run(async (ctx) => ctx.db.query('marketDirectorySearchEntries')
        .withIndex('by_generation_and_sourceRouteRef', (q) => q.eq('generation', GENERATION).eq('sourceRouteRef', ROUTE_REF))
        .collect())
      expect(withoutPricing.map(row => row.network)).toEqual(['*'])
      const withoutPricingEntry = await backend.run(async (ctx) => ctx.db.get(withoutPricing[0]!.entryId))
      expect(withoutPricingEntry?.networks).toEqual([])
      expect(JSON.parse(withoutPricingEntry?.directoryEntryJson ?? '{}').prices).toEqual([])
      expect(await backend.query(api.x402DirectoryIndex.searchCompact, {
        query: 'lookup', access: 'external_listing', paginationOpts: { cursor: null, numItems: 8 },
      })).toMatchObject({ kind: 'ok', page: [] })
    }
    await backend.run(async (ctx) => upsertProviderDirectoryRows(ctx, publication))

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

    // A projection-only identity conflict cannot roll back committed publication.
    // Removing the collision and replaying the same projection heals search.
    if (entry === null) throw new Error('provider projection fixture missing')
    const { _id: _entryId, _creationTime: _entryCreationTime, ...existingEntry } = entry
    const collisionId = await backend.run(async (ctx) => ctx.db.insert('marketExternalRegistryEntries', {
      ...existingEntry, source: 'coinbase' as const, documentId: providerDocumentId(ROUTE_REF),
    }))
    await expect(backend.mutation(internal.x402DirectoryIndexStore.projectProviderDirectoryRow, {
      publicationRef: publication.publicationRef, publicationRevision: publication.revision,
    })).rejects.toThrow('directory_source_identity_conflict')
    const canonical = await backend.run(async (ctx) => ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', q => q.eq('publicationRef', publication.publicationRef).eq('revision', publication.revision)).unique())
    expect(canonical?.disposition).toBe('current')
    await backend.run(async (ctx) => ctx.db.delete(collisionId))
    await backend.mutation(internal.x402DirectoryIndexStore.projectProviderDirectoryRow, {
      publicationRef: publication.publicationRef, publicationRevision: publication.revision,
    })
    const repaired = await backend.query(api.x402DirectoryIndex.searchCompact, {
      query: 'lookup', access: 'external_listing', paginationOpts: { cursor: null, numItems: 8 },
    })
    expect(repaired).toMatchObject({ kind: 'ok', page: [{ source: 'provider', title: 'Provider Lookup' }] })

    // A queued projection for the withdrawn revision must converge to the
    // newer canonical revision, not remove its Market row.
    if (canonical === null) throw new Error('publication fixture missing')
    await backend.run(async ctx => {
      await ctx.db.patch(canonical._id, { disposition: 'withdrawn' })
      const { _id: _publicationId, _creationTime: _createdAt, ...next } = canonical
      await ctx.db.insert('capabilityPublications', { ...next, revision: 2, disposition: 'current' })
    })
    await backend.mutation(internal.x402DirectoryIndexStore.projectProviderDirectoryRow, {
      publicationRef: publication.publicationRef, publicationRevision: 1,
    })
    expect(await backend.query(api.x402DirectoryIndex.searchCompact, {
      query: 'lookup', access: 'external_listing', paginationOpts: { cursor: null, numItems: 8 },
    })).toMatchObject({ kind: 'ok', page: [{ source: 'provider', title: 'Provider Lookup' }] })
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
      await ctx.db.insert('capabilityTransportBindings', {
        bindingId: 'binding:lane-c-owner-route', offeringId, networkId: 'eip155:8453',
        capabilityId: 'lookup.exact', version: 1, contractDigest: `sha256:${'b'.repeat(64)}`,
        endpointUrl: 'https://provider.example.com/owner-route-lookup',
        authority: { kind: 'public_upstream' },
        continuation: { kind: 'single_response', evidenceRefs: [] },
        cancellation: { kind: 'unsupported', evidenceRefs: [] },
        adapterId: 'http-json:v1', configJson: '{}', configDigest: `sha256:${'a'.repeat(64)}`,
        registrationEvidenceRefs: [], registrationHash: `sha256:${'c'.repeat(64)}`,
        admission: 'admitted', conformance: 'conformant',
        admissionEvidenceRefs: [], conformanceEvidenceRefs: [],
        eligibilityHash: `sha256:${'d'.repeat(64)}`, registeredAt: 1, updatedAt: 1,
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
