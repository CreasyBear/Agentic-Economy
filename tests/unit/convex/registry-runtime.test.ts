import { convexTest } from 'convex-test'
import type { GenericDatabaseWriter } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { api } from '../../../convex/_generated/api'
import type { DataModel, Id } from '../../../convex/_generated/dataModel'
import schema from '../../../convex/schema'
import {
  convexModules as modules,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const businessContext = {
  kind: 'local_human' as const,
  suburb: 'Perth',
  stateTerritory: 'WA',
}
const placeKeys = ['perth', 'perth wa', 'wa']

describe('Convex registry public read paths', () => {
  it('returns every eligible public business exactly once across native cursors', async () => {
    const backend = convexTest(schema, modules)
    await seedRegistryFixture(backend)

    const first = await backend.query(api.registry.listPublicBusinessOfferingSupply, {
      paginationOpts: { cursor: null, numItems: 2 },
    })
    const second = await backend.query(api.registry.listPublicBusinessOfferingSupply, {
      paginationOpts: { cursor: first.continueCursor, numItems: 2 },
    })

    const slugs = [...first.page, ...second.page].map((business) => business.slug)
    expect(slugs).toEqual(['alpha-plumbing', 'beta-electric', 'gamma-cleaning'])
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(second.isDone).toBe(true)
    expect(slugs).not.toContain('published-no-offering')
  })

  it('returns detail by slug with the current canonical offering identity', async () => {
    const backend = convexTest(schema, modules)
    await seedRegistryFixture(backend)

    const result = await backend.query(api.registry.getPublicBusinessOfferingSupplyBySlug, {
      slug: 'alpha-plumbing',
    })

    expect(result).toMatchObject({
      kind: 'found',
      business: {
        slug: 'alpha-plumbing',
        offerings: [{
          offeringRef: 'catalog-offering:alpha-plumbing',
          revision: 1,
          name: 'Emergency pipe repair',
        }],
      },
    })
  })

  it('returns a bounded full-text search result for the canonical business', async () => {
    const backend = convexTest(schema, modules)
    await seedRegistryFixture(backend)

    const result = await backend.query(api.registry.searchPublicBusinessOfferingSupply, {
      query: 'emergency plumber perth',
      limit: 1,
    })

    expect(result).toMatchObject({
      kind: 'ok',
      items: [{
        slug: 'alpha-plumbing',
        offerings: [{ offeringRef: 'catalog-offering:alpha-plumbing' }],
      }],
      pagination: { limit: 1, total: 1, hasMore: false },
    })
    expect(result.items).toHaveLength(1)
  })

  it('returns empty results for a stop-word-only search', async () => {
    const backend = convexTest(schema, modules)
    await seedRegistryFixture(backend)

    const result = await backend.query(api.registry.searchPublicBusinessOfferingSupply, {
      query: 'find a provider',
      limit: 5,
    })

    expect(result).toMatchObject({
      kind: 'ok',
      items: [],
      pagination: { limit: 5, total: 0, hasMore: false },
    })
  })
})

async function seedRegistryFixture(backend: ConvexFixtureBackend): Promise<void> {
  const alpha = await publishedBusinessOwner(backend, 'alpha-plumbing')
  const beta = await publishedBusinessOwner(backend, 'beta-electric')
  const gamma = await publishedBusinessOwner(backend, 'gamma-cleaning')
  await publishedBusinessOwner(backend, 'published-no-offering')

  await backend.run(async (ctx) => {
    await seedCanonicalOffering(ctx.db, {
      businessId: alpha.businessId,
      slug: 'alpha-plumbing',
      name: 'Emergency pipe repair',
      category: 'Emergency plumbing',
      summary: 'Emergency plumber for urgent pipe repairs in Perth.',
      keywords: ['emergency', 'plumber', 'pipe', 'repair'],
    })
    await seedCanonicalOffering(ctx.db, {
      businessId: beta.businessId,
      slug: 'beta-electric',
      name: 'Electrical inspection',
      category: 'Electrical services',
      summary: 'Residential electrical inspection in Perth.',
      keywords: ['electrical', 'inspection'],
    })
    await seedCanonicalOffering(ctx.db, {
      businessId: gamma.businessId,
      slug: 'gamma-cleaning',
      name: 'Commercial cleaning',
      category: 'Cleaning services',
      summary: 'Commercial cleaning for Perth workplaces.',
      keywords: ['commercial', 'cleaning'],
    })
  })
}

async function seedCanonicalOffering(
  db: GenericDatabaseWriter<DataModel>,
  offering: {
    businessId: Id<'businesses'>
    slug: string
    name: string
    category: string
    summary: string
    keywords: readonly string[]
  },
): Promise<void> {
  const offeringRef = `catalog-offering:${offering.slug}`
  const offeringSourceHash = canonicalDigest({ offeringRef, revision: 1 })
  const capabilityOfferingId = `capability-offering:${offering.slug}`
  const bindingId = `binding:${offering.slug}`
  const contractRef = {
    capabilityId: `registry.${offering.slug}`,
    version: 1,
    contractDigest: canonicalDigest(`contract:${offering.slug}`),
  }
  const accessPathRef = `access:${offering.slug}:lookup`
  const descriptor = {
    kind: 'external_operation' as const,
    name: offering.name,
    summary: offering.summary,
    url: `https://${offering.slug}.example.test/lookup`,
    method: 'GET',
    provenance: 'business_declared' as const,
  }
  const searchText = [
    offering.slug,
    offering.category,
    businessContext.suburb,
    businessContext.stateTerritory,
    offering.name,
    offering.summary,
    ...offering.keywords,
  ].join(' ').toLowerCase()

  await db.insert('businessOfferings', {
    offeringRef,
    businessId: offering.businessId,
    currentRevision: 1,
    status: 'published',
    createdAt: 1,
    updatedAt: 1,
  })
  await db.insert('businessOfferingRevisions', {
    offeringRef,
    businessId: offering.businessId,
    revision: 1,
    name: offering.name,
    category: offering.category,
    summary: offering.summary,
    sourceHash: offeringSourceHash,
    createdAt: 1,
  })
  await db.insert('offeringAccessPaths', {
    accessPathRef,
    businessId: offering.businessId,
    offeringRef,
    offeringRevision: 1,
    offeringSourceHash,
    status: 'published',
    descriptor,
    sourceHash: canonicalDigest({ accessPathRef, descriptor }),
    createdAt: 1,
    updatedAt: 1,
  })
  await db.insert('capabilityOfferings', {
    offeringId: capabilityOfferingId,
    businessId: offering.businessId,
    networkId: 'ae:public',
    ...contractRef,
    origin: {
      kind: 'catalog_offering',
      offeringRef,
      offeringRevision: 1,
      offeringSourceHash,
    },
    presentation: {
      label: offering.name,
      summary: offering.summary,
      price: { kind: 'on_request' },
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
    searchTerms: [...offering.keywords],
    registrationEvidenceRefs: [],
    registrationHash: canonicalDigest({ capabilityOfferingId }),
    status: 'active',
    admissionEvidenceRefs: [],
    eligibilityHash: canonicalDigest({ capabilityOfferingId, status: 'active' }),
    registeredAt: 1,
    updatedAt: 1,
  })
  await db.insert('capabilityTransportBindings', {
    bindingId,
    offeringId: capabilityOfferingId,
    networkId: 'ae:public',
    ...contractRef,
    endpointUrl: `https://${offering.slug}.example.test/lookup`,
    authority: { kind: 'public_upstream' },
    continuation: { kind: 'single_response', evidenceRefs: [] },
    cancellation: { kind: 'unsupported', evidenceRefs: [] },
    adapterId: 'http-json:v1',
    configJson: '{}',
    configDigest: canonicalDigest({}),
    registrationEvidenceRefs: [],
    registrationHash: canonicalDigest({ bindingId }),
    admission: 'admitted',
    conformance: 'conformant',
    admissionEvidenceRefs: [],
    conformanceEvidenceRefs: [],
    eligibilityHash: canonicalDigest({ bindingId, admission: 'admitted', conformance: 'conformant' }),
    registeredAt: 1,
    updatedAt: 1,
  })
  await db.insert('registrySearchDocuments', {
    documentId: `${offering.slug}__${offeringRef.split(':').at(-1)}`,
    schemaVersion: 'registry-search-document:v1',
    businessSlug: offering.slug,
    offeringRef,
    businessName: offering.slug,
    name: offering.name,
    category: offering.category,
    categoryKey: offering.category.toLowerCase(),
    businessContext: { ...businessContext },
    publicStatus: 'published',
    trustTier: 'listed',
    firstRequestMode: 'not_available_yet',
    placeKeys: [...placeKeys],
    keywords: [...offering.keywords],
    searchText,
    serviceAreaSummary: 'Perth and nearby suburbs',
    generatedHash: canonicalDigest({ searchText }),
    updatedAt: 1,
  })
}
