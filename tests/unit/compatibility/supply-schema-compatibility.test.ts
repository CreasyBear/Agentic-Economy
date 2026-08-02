import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import type { GenericId } from 'convex/values'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import schema from '../../../convex/schema'
import { claimBusinessCommand } from '../../../convex/business'
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
      value: { description: 'per visit', currency: 'AUD', unit: 'unit' as const },
      source: { kind: 'business_supplied' as const },
      observedAt: 1,
    },
    timingBasis: { kind: 'unknown' as const, explanation: 'Not supplied', source: { kind: 'business_supplied' as const }, observedAt: 1 },
    serviceArea: { kind: 'known' as const, value: 'Perth metro', source: { kind: 'publicly_observed' as const, referenceUrl: 'https://example.test/area' }, observedAt: 1 },
  },
}

const currentProjection = (businessId: Id<'businesses'>, slug: string) => ({
  business: { businessId, slug, name: 'Legacy-compatible business', category: 'Emergency plumbing', suburb: 'Perth', stateTerritory: 'WA', publicUrl: `/${slug}`, trustTier: 'listed' as const },
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
  it('accepts the exact historical Offering comparison envelope', async () => {
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

    await expect(backend.run((ctx) => ctx.db.insert('businessSupplyProjectionSnapshots', {
      businessId,
      sourceRevision: 1,
      sourceDigest: 'digest:mixed',
      observedAt: 1,
      disposition: 'current',
      status: 'current',
      projection: currentProjection(businessId, 'legacy-malformed'),
      projectionJson: JSON.stringify(currentProjection(businessId, 'legacy-malformed')),
      updatedAt: 1,
    }))).rejects.toThrow()

    const mixedDiscoveryManifest = structuredClone(legacyDiscoveryManifestRow(businessId, 'legacy-malformed'))
    Reflect.set(mixedDiscoveryManifest, 'schemaVersion', 'ae-ucp-fallback:v1')
    Reflect.set(mixedDiscoveryManifest, 'businessCatalogSchemaVersion', 'public-business-catalog-api:v2')
    Reflect.set(mixedDiscoveryManifest, 'disposition', 'current')
    Reflect.set(mixedDiscoveryManifest, 'observedAt', 1)
    Reflect.set(mixedDiscoveryManifest, 'offerings', [])
    await expect(backend.run((ctx) => ctx.db.insert('discoveryManifests', mixedDiscoveryManifest))).rejects.toThrow()
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

    await expect(backend.run((ctx) => ctx.db.insert('registryProjectionAttempts', {
      businessId,
      // @ts-expect-error legacy service IDs must remain exact Convex IDs
      serviceId: 'plain-string-service-id',
      logicalKey: 'registry:service:plain-string-service-id',
      sourceHash: 'digest:malformed-service-id',
      sourceVersion: 'public-catalog:v1',
      projectionKind: 'service_catalog',
      status: 'succeeded',
      retryCount: 0,
      startedAt: 1,
      repairAction: 'no_repair',
      repairResult: 'not_run',
    }))).rejects.toThrow()
  })

  it('keeps an untagged business_catalog attempt explicitly legacy', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId } = await publishedBusinessOwner(backend, 'legacy-untagged-business-catalog')

    await backend.run((ctx) => ctx.db.insert('registryProjectionAttempts', {
      businessId,
      logicalKey: `registry:business:${businessId}:source:legacy-untagged`,
      sourceHash: 'source:legacy-untagged',
      sourceVersion: 'public-catalog:v1',
      projectionKind: 'business_catalog',
      status: 'succeeded',
      retryCount: 0,
      startedAt: 1,
      repairAction: 'no_repair',
      repairResult: 'not_run',
    }))

    const health = await backend.query(api.registry.readCatalogHealth, { businessId: String(businessId) })
    expect(health.latestAttempt).toMatchObject({
      kind: 'legacy_unavailable',
      reason: 'offering_identity_unavailable',
      businessId: String(businessId),
      projectionKind: 'business_catalog',
    })
    expect(health.latestAttempt).not.toHaveProperty('offeringRef')
  })
  it('refuses replay when registry and discovery attempts are missing', async () => {
    const { backend, fixture } = await publishedReplayFixture()

    await backend.run(async (ctx) => {
      const registryAttempt = await ctx.db
        .query('registryProjectionAttempts')
        .withIndex('by_logicalKey', (query) => query.eq('logicalKey', `registry:business:${fixture.businessId}:${fixture.sourceHash}`))
        .unique()
      const discoveryAttempt = await ctx.db
        .query('discoveryManifestAttempts')
        .withIndex('by_attemptId', (query) => query.eq('attemptId', `discovery:manifest:${fixture.businessId}:${fixture.sourceHash}:v1`))
        .unique()
      if (registryAttempt === null || discoveryAttempt === null) throw new Error('published replay fixture attempts missing')
      await ctx.db.delete(registryAttempt._id)
      await ctx.db.delete(discoveryAttempt._id)
    })

    const replayed = await backend.run((ctx) => publishBusinessCatalogCommand(ctx.db, {
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

    await backend.run(async (ctx) => {
      const attempt = await ctx.db
        .query('registryProjectionAttempts')
        .withIndex('by_logicalKey', (query) => query.eq('logicalKey', `registry:business:${fixture.businessId}:${fixture.sourceHash}`))
        .unique()
      if (attempt === null) throw new Error('published replay fixture registry attempt missing')
      await ctx.db.replace(attempt._id, {
        businessId: fixture.businessId,
        logicalKey: attempt.logicalKey,
        sourceHash: fixture.sourceHash,
        sourceVersion: 'public-catalog:v1',
        projectionKind: 'business_catalog',
        status: 'succeeded',
        retryCount: attempt.retryCount,
        startedAt: attempt.startedAt,
        finishedAt: 2,
        latestReadback: {
          businessId: fixture.businessId,
          slug: fixture.slug,
          publicUrl: `/${fixture.slug}`,
          sourceVersion: 'public-catalog:v1',
          sourceHash: fixture.sourceHash,
          serviceCount: 1,
          publicSurfaces: ['/registry'],
          readAt: 2,
        },
        repairAction: 'no_repair',
        repairResult: 'not_run',
      })
    })

    const replayed = await backend.run((ctx) => publishBusinessCatalogCommand(ctx.db, {
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
      await ctx.db.insert('businessSupplyProjectionSnapshots', {
        businessId,
        sourceRevision: 1,
        sourceDigest: 'digest:projection',
        observedAt: 1,
        disposition: 'current',
        status: 'current',
        projection: currentProjection(businessId, 'legacy-registry'),
        updatedAt: 1,
      })
      await ctx.db.insert('registryProjectionAttempts', {
        businessId,
        serviceId,
        logicalKey: `registry:service:${serviceId}`,
        sourceHash: 'digest:registry',
        sourceVersion: 'public-catalog:v1',
        projectionKind: 'service_catalog',
        status: 'succeeded',
        retryCount: 0,
        startedAt: 1,
        latestReadback: {
          businessId,
          slug: 'legacy-registry',
          publicUrl: '/legacy-registry',
          sourceVersion: 'public-catalog:v1',
          sourceHash: 'digest:registry',
          serviceCount: 1,
          publicSurfaces: ['/registry'],
          readAt: 1,
        },
        repairAction: 'no_repair',
        repairResult: 'not_run',
      })
      await ctx.db.insert('registryProjectionItems', {
        businessId,
        serviceId,
        logicalKey: `registry:service:${serviceId}`,
        projectionKind: 'service_catalog',
        publicStatus: 'published',
        sourceHash: 'digest:registry',
        sourceVersion: 'public-catalog:v1',
        generatedHash: 'digest:registry-generated',
        publicUrl: '/legacy-registry',
        serviceCount: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('indexStatus', {
        targetType: 'service',
        targetRef: serviceId,
        businessId,
        serviceId,
        status: 'indexed',
        lastAttemptAt: 1,
        sourceHash: 'digest:registry',
        sourceVersion: 'public-catalog:v1',
      })
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

    await backend.run(async (ctx) => {
      await ctx.db.insert('businessSupplyProjectionSnapshots', {
        businessId,
        sourceRevision: 1,
        sourceDigest: 'digest:projection',
        observedAt: 1,
        disposition: 'current',
        status: 'current',
        projectionJson: JSON.stringify(currentProjection(businessId, 'legacy-discovery-replace')),
        updatedAt: 1,
      })
      await ctx.db.insert('discoveryManifests', legacyDiscoveryManifestRow(businessId, 'legacy-discovery-replace'))
    })

    const generated = await owner.mutation(api.discovery.regenerateDiscoveryManifest, withSourceWrite('discovery_repair', {
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
    const stored = await backend.run((ctx) => ctx.db.query('discoveryManifests').collect())
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      schemaVersion: 'ae-ucp-fallback:v1',
      businessCatalogSchemaVersion: 'public-business-catalog-api:v2',
      pathKind: 'ae_hosted_fallback',
      sourceVersion: 'public-catalog:v1',
      disposition: 'current',
    })
    expect(stored[0]).not.toHaveProperty('services')
    expect(stored[0]).not.toHaveProperty('status')
    expect(stored[0]).not.toHaveProperty('updatedAt')
    expect(stored[0]).not.toHaveProperty('unsupportedCapabilities')
  })

  it('returns a legacy manifest as stale during explicit invalidation', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'legacy-discovery-invalidate')

    await backend.run((ctx) => ctx.db.insert('discoveryManifests', legacyDiscoveryManifestRow(businessId, 'legacy-discovery-invalidate')))

    const invalidated = await owner.mutation(api.discovery.invalidateDiscoveryManifest, withSourceWrite('discovery_repair', {
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

    await backend.run(async (ctx) => {
      await ctx.db.insert('businessSupplyProjectionSnapshots', {
        businessId: malformed.businessId,
        sourceRevision: 1,
        sourceDigest: 'digest:projection',
        observedAt: 1,
        disposition: 'current',
        status: 'current',
        projectionJson: '{"business":',
        updatedAt: 1,
      })
      await ctx.db.insert('businessSupplyProjectionSnapshots', {
        businessId: foreign.businessId,
        sourceRevision: 1,
        sourceDigest: 'digest:projection',
        observedAt: 1,
        disposition: 'current',
        status: 'current',
        projectionJson: JSON.stringify(currentProjection(foreign.businessId, 'not-the-published-slug')),
        updatedAt: 1,
      })
    })

    await expect(backend.query(api.discovery.readCatalogDiscoveryManifest, {
      slug: 'legacy-json-malformed',
      canonicalBaseUrl: 'https://ae.example',
      now: 1,
    })).resolves.toEqual({ kind: 'hidden', reason: 'not_public' })
    await expect(backend.query(api.discovery.readCatalogDiscoveryManifest, {
      slug: 'legacy-json-foreign',
      canonicalBaseUrl: 'https://ae.example',
      now: 1,
    })).resolves.toEqual({ kind: 'hidden', reason: 'not_public' })

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

  it('reads a historical discovery manifest without converting services into offerings', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId } = await publishedBusinessOwner(backend, 'legacy-discovery')

    await backend.run((ctx) => ctx.db.insert('discoveryManifests', legacyDiscoveryManifestRow(businessId, 'legacy-discovery')))

    const health = await backend.query(api.discovery.readDiscoveryHealth, { businessId })
    expect(health.latestManifest).toMatchObject({
      kind: 'legacy_unavailable', reason: 'offering_identity_unavailable', status: 'available',
      services: [{ slug: 'emergency-pipe-repair', capabilities: [{ kind: 'phone_inquiry', callable: false }] }],
    })
    expect(health.latestManifest).not.toHaveProperty('offerings')
  })
})
async function publishedReplayFixture(): Promise<{
  backend: ConvexFixtureBackend
  fixture: {
    actor: { kind: 'authenticated_owner'; clerkUserId: string; displayName: string }
    businessId: Id<'businesses'>
    claimId: Id<'claims'>
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
  const published = await backend.run(async (ctx) => {

    await ctx.db.insert('operatorControls', {
      key: 'offering_public_projection_enabled',
      enabled: true,
      changedByAdminRef: actor.clerkUserId,
      reasonCode: 'compatibility_fixture',
      evidenceRefs: ['test:legacy-replay'],
      correlationId,
      operationKey: `${operationKey}:offering_public_projection_enabled`,
      updatedAt: 1,
    })
    await ctx.db.insert('operatorControls', {
      key: 'offering_authoring_enabled',
      enabled: true,
      changedByAdminRef: actor.clerkUserId,
      reasonCode: 'compatibility_fixture',
      evidenceRefs: ['test:legacy-replay'],
      correlationId,
      operationKey: `${operationKey}:offering_authoring_enabled`,
      updatedAt: 1,
    })
    const claim = await claimBusinessCommand(ctx.db, {
      actor,
      facts: {
        name: 'Legacy Replay Business',
        category: 'Emergency plumbing',
        suburb: 'Perth',
        stateTerritory: 'WA',
        requestedSlug: slug,
        sourceRefs: [{ label: 'compatibility fixture', evidenceRef: 'test:legacy-replay' }],
      },
      operationKey: 'op:legacy-replay:claim',
      correlationId: 'corr:legacy-replay:claim',
    }, 1)
    if (claim.kind !== 'ok') throw new Error(`legacy replay claim failed: ${claim.code}`)
    const catalog = await publishBusinessCatalogCommand(ctx.db, {
      actor,
      claimId: claim.claim.claimId,
      operationKey,
      correlationId,
      services,
    }, 2)
    if (catalog.kind !== 'ok') throw new Error(`legacy replay publish failed: ${catalog.code}`)
    return {
      businessId: catalog.business.businessId,
      claimId: catalog.claim.claimId,
      sourceHash: catalog.business.sourceHash,
    }
  })

  return {
    backend,
    fixture: {
      actor,
      businessId: published.businessId,
      claimId: published.claimId,
      slug,
      sourceHash: published.sourceHash,
      operationKey,
      correlationId,
      services,
    },
  }
}
