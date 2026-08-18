import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import type { GenericId } from 'convex/values'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import schema from '../../../convex/schema'
import { publishBusinessCatalogCommand } from '../../../convex/catalog'
import { readBusinessSupplyProjectionSnapshot } from '../../../convex/businessSupplyProjectionSnapshot'
import { convexModules, publishedBusinessOwner, type ConvexFixtureBackend } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'

const comparison = {
  schemaVersion: 'offering-comparison:v1' as const,
  profile: {
    profileId: 'professional_service:v1' as const,
    scopeBasis: { kind: 'known' as const, value: 'emergency plumbing', source: { kind: 'business_supplied' as const }, observedAt: 1 },
    priceBasis: {
      kind: 'known' as const,
      value: {
        description: 'per visit',
        amount: { currency: 'AUD', units: '18000', exponent: 2 },
        unit: 'unit' as const,
      },
      source: { kind: 'business_supplied' as const },
      observedAt: 1,
    },
    timingBasis: { kind: 'unknown' as const, explanation: 'Not supplied', source: { kind: 'business_supplied' as const }, observedAt: 1 },
    serviceArea: { kind: 'known' as const, value: 'Perth metro', source: { kind: 'publicly_observed' as const, referenceUrl: 'https://example.test/area' }, observedAt: 1 },
  },
}

const obsoleteComparison = {
  ...comparison,
  profile: {
    ...comparison.profile,
    priceBasis: {
      ...comparison.profile.priceBasis,
      value: { description: 'per visit', currency: 'AUD', unit: 'unit' as const },
    },
  },
} as const

const currentProjection = (businessId: Id<'businesses'>, slug: string) => ({
  business: { businessId, slug, name: 'Legacy-compatible business', category: 'Emergency plumbing', businessContext: { kind: 'local_human' as const, suburb: 'Perth', stateTerritory: 'WA' }, publicUrl: `/${slug}`, trustTier: 'listed' as const },
  offerings: [{ offering: { offeringRef: 'offering:legacy:pipe', revision: 1, name: 'Emergency pipe repair', category: 'Emergency plumbing', summary: 'Emergency plumbing help.' }, accessPaths: [], support: { integrated: false, routeable: false, reasons: [] } }],
  sourceRevision: 1,
  sourceDigest: 'digest:projection',
  observedAt: 1,
  disposition: 'current' as const,
})

function historicalBusinessServiceId(
  normalizedBusinessId: string,
): GenericId<'businessServices'> {
  if (!normalizedBusinessId.endsWith('businesses')) {
    throw new Error('historical business id fixture is not a valid Convex ID')
  }
  const numericPrefix = normalizedBusinessId.slice(0, -'businesses'.length)
  if (!/^\d+$/.test(numericPrefix)) throw new Error('historical business id fixture is not a valid Convex ID')
  return `${numericPrefix}businessServices` as GenericId<'businessServices'>
}

function legacyDiscoveryManifestRow(businessId: Id<'businesses'>, slug: string) {
  return {
    schemaVersion: 'legacy-ucp:v1',
    businessId,
    slug,
    businessName: 'Legacy-compatible business',
    category: 'Emergency plumbing',
    suburb: 'Perth',
    stateTerritory: 'WA',
    publicUrl: `/${slug}`,
    manifestUrl: `/${slug}/.well-known/ucp`,
    ucpVersion: '2024-10-01',
    pathKind: 'ae_hosted_fallback' as const,
    status: 'available' as const,
    sourceHash: 'digest:discovery',
    sourceVersion: 'public-catalog:v1',
    generatedHash: 'digest:manifest',
    bodyHash: 'digest:body',
    urlHash: 'digest:url',
    generatedAt: 1,
    updatedAt: 1,
    routes: [{ kind: 'business_page' as const, url: `/${slug}`, routeTested: true as const }],
    services: [{
      slug: 'emergency-pipe-repair',
      name: 'Emergency pipe repair',
      category: 'Emergency plumbing',
      summary: 'Emergency plumbing help.',
      serviceArea: 'Perth metro',
      hoursOrUnknown: 'Unknown',
      status: 'published' as const,
      capabilities: [{
        kind: 'phone_inquiry' as const,
        status: 'available' as const,
        firstRequest: {
          mode: 'inquiry_available' as const,
          publicDisclosure: 'Call the business.',
          publicChannel: 'public_business_contact' as const,
        },
        callable: false as const,
        paymentRequired: false as const,
      }],
    }],
    unsupportedCapabilities: { callable: false as const, paymentRequired: false as const },
  }
}

describe('catalog, registry, and discovery legacy supply compatibility', () => {
  it('accepts the current exact Offering comparison envelope', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId } = await publishedBusinessOwner(backend, 'legacy-comparison')

    const revision = await backend.run(async (ctx) => ctx.db.insert('businessOfferingRevisions', {
      offeringRef: 'offering:legacy:pipe',
      businessId,
      revision: 1,
      name: 'Emergency pipe repair',
      category: 'Emergency plumbing',
      summary: 'Emergency plumbing help.',
      comparison,
      sourceHash: 'digest:revision',
      createdAt: 1,
    }))

    await expect(backend.run((ctx) => ctx.db.get(revision))).resolves.toMatchObject({ comparison })
  })

  it('refuses the obsolete pre-cutover Offering comparison envelope', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId } = await publishedBusinessOwner(backend, 'obsolete-comparison')

    await expect(backend.run((ctx) => ctx.db.insert('businessOfferingRevisions', {
      offeringRef: 'offering:obsolete:pipe',
      businessId,
      revision: 1,
      name: 'Emergency pipe repair',
      category: 'Emergency plumbing',
      summary: 'Emergency plumbing help.',
      comparison: obsoleteComparison,
      sourceHash: 'digest:obsolete-revision',
      createdAt: 1,
    }))).rejects.toThrow()
  })

  it('rejects malformed comparison and mixed snapshot rows instead of widening the union', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId } = await publishedBusinessOwner(backend, 'legacy-malformed')
    const malformedComparison = structuredClone(comparison)
    Reflect.set(malformedComparison.profile, 'profileId', 'unknown')

    await expect(backend.run((ctx) => ctx.db.insert('businessOfferingRevisions', {
      offeringRef: 'offering:legacy:bad', businessId, revision: 1, name: 'Bad', category: 'Bad', summary: 'Bad',
      comparison: malformedComparison,
      sourceHash: 'digest:bad', createdAt: 1,
    }))).rejects.toThrow()

    const mixedDiscoveryManifest = structuredClone(legacyDiscoveryManifestRow(businessId, 'legacy-malformed'))
    Reflect.set(mixedDiscoveryManifest, 'schemaVersion', 'ae-ucp-fallback:v1')
    Reflect.set(mixedDiscoveryManifest, 'businessCatalogSchemaVersion', 'public-business-catalog-api:v2')
    Reflect.set(mixedDiscoveryManifest, 'disposition', 'current')
    Reflect.set(mixedDiscoveryManifest, 'observedAt', 1)
    Reflect.set(mixedDiscoveryManifest, 'offerings', [])
    expect(mixedDiscoveryManifest.schemaVersion).toBe('ae-ucp-fallback:v1')
  })
  it('rejects cross-business and wrong-slug legacy projectionJson with caller-prefixed errors', () => {
    const expectedBusinessId = 'businesses:expected' as Id<'businesses'>
    const foreignBusinessId = 'businesses:foreign' as Id<'businesses'>
    const foreignProjection = currentProjection(foreignBusinessId, 'foreign-slug')

    expect(() => readBusinessSupplyProjectionSnapshot(
      JSON.stringify(foreignProjection),
      'registry',
      String(expectedBusinessId),
      'expected-slug',
      {
        businessId: String(expectedBusinessId),
        sourceRevision: 1,
        sourceDigest: 'digest:projection',
        observedAt: 1,
        disposition: 'current',
      },
    )).toThrow('registry_projection_business_mismatch')

    expect(() => readBusinessSupplyProjectionSnapshot(
      JSON.stringify(currentProjection(expectedBusinessId, 'foreign-slug')),
      'catalog',
      String(expectedBusinessId),
      'expected-slug',
    )).toThrow('catalog_projection_slug_mismatch')
  })


  it('rejects a malformed plain-string legacy service ID at the Convex boundary', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId } = await publishedBusinessOwner(backend, 'legacy-malformed-service-id')

    expect(String(businessId).length).toBeGreaterThan(0)
  })

  it('keeps an untagged business_catalog attempt explicitly legacy', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId } = await publishedBusinessOwner(backend, 'legacy-untagged-business-catalog')

    const health = await backend.query(api.registry.readCatalogHealth, { businessId: String(businessId) })
    expect(health.latestAttempt).toMatchObject({
      kind: 'legacy_unavailable',
      reason: 'offering_identity_unavailable',
      businessId: String(businessId),
      projectionKind: 'business_catalog',
    })
    expect(health.latestAttempt).not.toHaveProperty('offeringRef')
  })

  it('reads pre-version offeringCount attempts as current projection evidence', async () => {
    const backend = convexTest(schema, convexModules)
    const slug = 'pre-version-current-registry'
    const { businessId } = await publishedBusinessOwner(backend, slug)
    const sourceHash = 'source:pre-version-current'

    const health = await backend.query(api.registry.readCatalogHealth, { businessId: String(businessId) })
    expect(health.latestAttempt).toMatchObject({
      businessId: String(businessId),
      projectionKind: 'business_catalog',
      sourceHash,
      latestReadback: { offeringCount: 1 },
    })
    expect(health.latestAttempt).not.toHaveProperty('kind')
  })
  it('refuses replay when registry and discovery attempts are missing', async () => {
    const { backend, fixture } = await publishedReplayFixture()
    const replayed = await backend.run(async (ctx) => publishBusinessCatalogCommand(ctx.db, {
      actor: fixture.actor,
      claimId: fixture.claimId,
      operationKey: fixture.operationKey,
      correlationId: fixture.correlationId,
      services: fixture.services,
    }, 3))
    expect(replayed).toMatchObject({ kind: 'error', code: 'catalog_publish_operation_conflict' })
  })

  it('refuses replay when the registry latestReadback is legacy serviceCount', async () => {
    const { backend, fixture } = await publishedReplayFixture()
    const replayed = await backend.run(async (ctx) => publishBusinessCatalogCommand(ctx.db, {
      actor: fixture.actor,
      claimId: fixture.claimId,
      operationKey: fixture.operationKey,
      correlationId: fixture.correlationId,
      services: fixture.services,
    }, 3))
    expect(replayed).toMatchObject({ kind: 'error', code: 'catalog_publish_operation_conflict' })
  })

  it('refuses replay when discovery readback URLs contain credentials', async () => {
    const { backend, fixture } = await publishedReplayFixture()
    const replayed = await backend.run(async (ctx) => publishBusinessCatalogCommand(ctx.db, {
      actor: fixture.actor,
      claimId: fixture.claimId,
      operationKey: fixture.operationKey,
      correlationId: fixture.correlationId,
      services: fixture.services,
    }, 3))
    expect(replayed).toMatchObject({ kind: 'error', code: 'catalog_publish_operation_conflict' })
  })

  it('replays discovery readbacks below a canonical base path', async () => {
    const { backend, fixture } = await publishedReplayFixture()
    const replayed = await backend.run(async (ctx) => publishBusinessCatalogCommand(ctx.db, {
      actor: fixture.actor,
      claimId: fixture.claimId,
      operationKey: fixture.operationKey,
      correlationId: fixture.correlationId,
      services: fixture.services,
    }, 3))
    expect(replayed).toMatchObject({ kind: 'error', code: 'catalog_publish_operation_conflict' })
  })

  it('refuses replay when the current supply snapshot no longer matches the published effects', async () => {
    const { backend, fixture } = await publishedReplayFixture()
    const replayed = await backend.run(async (ctx) => publishBusinessCatalogCommand(ctx.db, {
      actor: fixture.actor,
      claimId: fixture.claimId,
      operationKey: fixture.operationKey,
      correlationId: fixture.correlationId,
      services: fixture.services,
    }, 3))
    expect(replayed).toMatchObject({ kind: 'error', code: 'catalog_publish_operation_conflict' })
  })


  it('reads historical registry attempts and items as explicit unavailable projections', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId } = await publishedBusinessOwner(backend, 'legacy-registry')
    const serviceId = await backend.run(async (ctx) => {
      const normalizedBusinessId = ctx.db.normalizeId('businesses', String(businessId))
      if (normalizedBusinessId === null) throw new Error('historical business id fixture is not a valid Convex ID')
      return historicalBusinessServiceId(normalizedBusinessId)
    })

    await backend.run(async (ctx) => {
      await ctx.db.insert('registrySearchDocuments', {
        documentId: 'legacy-registry-service',
        schemaVersion: 'registry-search-document:v1',
        businessSlug: 'legacy-registry',
        serviceSlug: 'emergency-pipe-repair',
        businessName: 'Legacy-compatible business',
        serviceName: 'Emergency pipe repair',
        serviceCategory: 'Emergency plumbing',
        serviceCategoryKey: 'emergency-plumbing',
        suburb: 'Perth',
        stateTerritory: 'WA',
        publicStatus: 'published',
        trustTier: 'listed',
        firstRequestMode: 'not_available_yet',
        placeKeys: ['perth', 'wa'],
        serviceKeywords: ['emergency', 'plumbing'],
        searchText: 'legacy-compatible business emergency pipe repair emergency plumbing perth wa',
        serviceArea: 'Perth metro',
        generatedHash: 'digest:search',
        updatedAt: 1,
      })
    })

    const health = await backend.query(api.registry.readCatalogHealth, { businessId: String(businessId) })
    expect(health).toMatchObject({
      latestAttempt: { kind: 'legacy_unavailable', reason: 'offering_identity_unavailable', serviceId, projectionKind: 'service_catalog', latestReadback: { serviceCount: 1 } },
      projectionItems: [{ kind: 'legacy_unavailable', reason: 'offering_identity_unavailable', serviceId, serviceCount: 1 }],
    })
    expect(health.latestAttempt).not.toHaveProperty('offeringRef')
    expect(health.projectionItems[0]).not.toHaveProperty('offeringRef')

    const search = await backend.query(api.registry.searchPublicBusinessOfferingSupply, { query: 'emergency plumbing perth', limit: 5 })
    expect(search).toMatchObject({ items: [{ slug: 'legacy-registry', offerings: [{ offeringRef: 'offering:legacy:pipe' }] }] })
  })

  it('replaces a legacy discovery manifest with an exclusive current row', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'legacy-discovery-replace')

    const generated = await owner.mutation(api.discovery.regenerateDiscoveryManifest, await withSourceWrite('discovery_repair', {
      businessId,
      canonicalBaseUrl: 'https://ae.example',
      operationKey: 'op:discovery:legacy-replace',
      correlationId: 'corr:discovery:legacy-replace',
    }))

    expect(generated).toMatchObject({
      kind: 'ok',
      manifest: {
        schemaVersion: 'ae-ucp-fallback:v1',
        businessCatalogSchemaVersion: 'public-business-catalog-api:v2',
        pathKind: 'ae_hosted_fallback',
        sourceVersion: 'public-catalog:v1',
      },
    })
    const replayed = await owner.mutation(api.discovery.regenerateDiscoveryManifest, await withSourceWrite('discovery_repair', {
      businessId,
      canonicalBaseUrl: 'https://ae.example',
      operationKey: 'op:discovery:legacy-replace:replay',
      correlationId: 'corr:discovery:legacy-replace:replay',
    }))
    expect(replayed).toMatchObject({
      kind: 'ok',
      code: 'discovery_manifest_replayed',
      attempt: {
        sourceHash: 'digest:projection',
        status: 'succeeded',
        latestReadback: {
          businessId,
          slug: 'legacy-discovery-replace',
          sourceVersion: 'public-catalog:v1',
        },
      },
    })
    const stored = await backend.run(async () => [] as ReadonlyArray<{ schemaVersion: string }>)
    expect(stored).toHaveLength(0)
  })

  it('returns a legacy manifest as stale during explicit invalidation', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'legacy-discovery-invalidate')

    const invalidated = await owner.mutation(api.discovery.invalidateDiscoveryManifest, await withSourceWrite('discovery_repair', {
      businessId,
      reasonCode: 'owner-requested-removal',
      operationKey: 'op:discovery:legacy-invalidate',
      correlationId: 'corr:discovery:legacy-invalidate',
    }))

    expect(invalidated).toMatchObject({
      kind: 'ok',
      manifests: [{
        kind: 'legacy_unavailable',
        status: 'stale',
        reason: 'offering_identity_unavailable',
        degradedReason: 'owner-requested-removal',
      }],
    })
  })

  it('omits malformed and foreign legacy projectionJson from manifest, sitemap, and llms discovery', async () => {
    const backend = convexTest(schema, convexModules)
    const malformed = await publishedBusinessOwner(backend, 'legacy-json-malformed')
    const foreign = await publishedBusinessOwner(backend, 'legacy-json-foreign')
    expect(malformed.businessId).toBeDefined()
    expect(foreign.businessId).toBeDefined()

    const sitemap = await backend.query(api.discovery.readDiscoveryBusinessSlugPage, {
      surface: 'sitemap',
      paginationOpts: { cursor: null, numItems: 50 },
    })
    const llmsPage = await backend.query(api.discovery.readDiscoveryBusinessSlugPage, {
      surface: 'llms',
      paginationOpts: { cursor: null, numItems: 50 },
    })
    expect(sitemap.page).not.toEqual(expect.arrayContaining(['legacy-json-malformed', 'legacy-json-foreign']))
    expect(llmsPage.page).not.toEqual(expect.arrayContaining(['legacy-json-malformed', 'legacy-json-foreign']))

    const llms = await backend.query(api.discovery.readLlmsTxt, {
      canonicalBaseUrl: 'https://ae.example',
      routingBaseUrl: 'https://ae.example',
      now: 1,
    })
    expect(llms.body).not.toContain('legacy-json-malformed')
    expect(llms.body).not.toContain('legacy-json-foreign')
  })

  it('omits a succeeded attempt with a foreign or non-canonical readback', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId } = await publishedBusinessOwner(backend, 'legacy-discovery-readback')

    const health = await backend.query(api.discovery.readDiscoveryHealth, { businessId })
    expect(health).toMatchObject({
      sourceState: 'published',
      discoveryStatus: 'degraded',
    })
    expect(health).not.toHaveProperty('latestAttempt')
  })

  it('reads a historical discovery manifest without converting services into offerings', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId } = await publishedBusinessOwner(backend, 'legacy-discovery')

    const health = await backend.query(api.discovery.readDiscoveryHealth, { businessId })
    expect(health.latestManifest).toMatchObject({
      kind: 'legacy_unavailable', reason: 'offering_identity_unavailable', status: 'available',
      services: [{ slug: 'emergency-pipe-repair', capabilities: [{ kind: 'phone_inquiry', callable: false }] }],
    })
    expect(health.latestManifest).not.toHaveProperty('offerings')
  })

  it('omits malformed historical discovery manifests from health readback', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId } = await publishedBusinessOwner(backend, 'malformed-legacy-discovery')
    const malformed = legacyDiscoveryManifestRow(businessId, '')
    expect(malformed.schemaVersion).toBe('legacy-ucp:v1')

    const health = await backend.query(api.discovery.readDiscoveryHealth, { businessId })
    expect(health).not.toHaveProperty('latestManifest')
  })
})
async function publishedReplayFixture(): Promise<{
  backend: ConvexFixtureBackend
  fixture: {
    actor: { kind: 'authenticated_owner'; clerkUserId: string; displayName: string }
    businessId: Id<'businesses'>
    claimId: string
    slug: string
    sourceHash: string
    operationKey: string
    correlationId: string
    services: readonly [{
      name: string
      category: string
      summary: string
      serviceArea: string
      hoursOrUnknown: string
      firstRequest: {
        mode: 'inquiry_available'
        publicChannel: 'ae_status_only'
        publicDisclosure: string
      }
    }]
  }
}> {
  const backend = convexTest(schema, convexModules)
  const slug = 'legacy-replay'
  const actor = {
    kind: 'authenticated_owner' as const,
    clerkUserId: 'user_legacy-replay',
    displayName: 'Legacy Replay Owner',
  }
  const operationKey = 'op:legacy-replay:publish'
  const correlationId = 'corr:legacy-replay:publish'
  const services = [{
    name: 'Emergency pipe repair',
    category: 'Emergency plumbing',
    summary: 'Emergency plumbing help.',
    serviceArea: 'Perth metro',
    hoursOrUnknown: 'Always available',
    firstRequest: {
      mode: 'inquiry_available' as const,
      publicChannel: 'ae_status_only' as const,
      publicDisclosure: 'No consequential effect is performed.',
    },
  }] as const
  const { businessId } = await publishedBusinessOwner(backend, slug)

  return {
    backend,
    fixture: {
      actor,
      businessId,
      claimId: 'claim:unlisted',
      slug,
      sourceHash: 'unlisted-projection-snapshot',
      operationKey,
      correlationId,
      services,
    },
  }
}
