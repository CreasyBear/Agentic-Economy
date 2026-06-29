import { describe, expect, it } from 'vitest'

import {
  buildLlmsTxt,
  buildSitemapXml,
  createDefaultDiscoverySourceState,
  regenerateDiscoveryManifest,
} from '@/modules/discovery/public'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import type {
  DeveloperDiscoveryExamplesArtifact,
  DeveloperDiscoveryFixtureBundleArtifact,
  DeveloperDiscoverySchemaArtifact,
} from '@/modules/discovery/developer-discovery'
import { setPublicDiscoverySourcePortForTests } from '@/modules/discovery/discovery.functions'
import { brandNonEmpty } from '@/modules/common/ids'
import type { PublicBusinessCatalogApiDto, PublicBusinessCatalogApiPage } from '@/modules/registry/public'
import { setPublicRegistrySourcePortForTests } from '@/modules/registry/registry.functions'
import { handleDurableBusinessDetailRequest } from '@/routes/api.businesses.$slug'
import { handleDurableListBusinessesRequest } from '@/routes/api.businesses'
import { handleDurableSearchBusinessesRequest } from '@/routes/api.businesses.search'
import { handleDeveloperDiscoveryExamplesRequest } from '@/routes/api.discovery.examples'
import { handleDeveloperDiscoveryFixturesRequest } from '@/routes/api.discovery.fixtures'
import { handleDeveloperDiscoverySchemaRequest } from '@/routes/api.discovery.schema'
import { loadDeveloperDiscoveryRoute } from '@/routes/developers.discovery'

const privateOrAuthorityPattern =
  /inquiryBody|ownerReply|claimantContact|ownerNotes|notificationPayload|providerPayload|adminEvidence|sourceHash|rawContact(?!Excluded)|private:evidence|ownerId|clerk|callable":true|paymentRequired":true|providerOperation":true|requestMarket":true|mutation":true|payment":true|protectedAction":true/iu

describe('developer discovery route handlers', () => {
  it('serves schema, examples, and fixtures with public headers and read-only payloads', async () => {
    const state = availableDiscoveryState()
    const request = new Request('https://ae.example/api/discovery/schema')
    const schemaResponse = await handleDeveloperDiscoverySchemaRequest(request, state, {
      now: 7_000,
      p2InquiryAvailability: {
        state: 'not_shipped',
        publicReason: 'Phase 2 public inquiry status is not shipped in this environment.',
        source: 'phase2-public-status-contract',
        lastVerifiedAt: 6_900,
      },
    })
    const examplesResponse = await handleDeveloperDiscoveryExamplesRequest(
      new Request('https://ae.example/api/discovery/examples'),
      state,
      { now: 7_000 }
    )
    const fixturesResponse = await handleDeveloperDiscoveryFixturesRequest(
      new Request('https://ae.example/api/discovery/fixtures'),
      state,
      { now: 7_000 }
    )
    const schema = (await schemaResponse.json()) as DeveloperDiscoverySchemaArtifact
    const examples = (await examplesResponse.json()) as DeveloperDiscoveryExamplesArtifact
    const fixtures = (await fixturesResponse.json()) as DeveloperDiscoveryFixtureBundleArtifact
    const serialized = JSON.stringify({ schema, examples, fixtures })

    expect(schemaResponse.headers.get('Cache-Control')).toBe('public, max-age=60, stale-while-revalidate=300')
    expect(schemaResponse.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(schemaResponse.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(schemaResponse.headers.get('X-AE-Discovery-Schema-Version')).toBe('developer-discovery:v1')
    expect(schemaResponse.headers.get('X-AE-Discovery-Cache-Version')).toBe('public-catalog-readonly-cache:v1')
    expect(schemaResponse.headers.get('X-AE-Discovery-Fetch-Status')).toBe('successful')
    expect(schemaResponse.headers.get('X-AE-Required-Funnel-Event')).toBe('schema_downloaded')

    expect(schema).toMatchObject({
      kind: 'public_catalog_schema',
      state: 'available',
      p2InquiryAvailability: {
        state: 'not_shipped',
        publicReason: 'Phase 2 public inquiry status is not shipped in this environment.',
        source: 'phase2-public-status-contract',
        lastVerifiedAt: 6_900,
      },
    })
    expect(examples).toMatchObject({
      kind: 'public_catalog_examples',
      state: 'available',
      examples: [expect.objectContaining({ slug: 'parramatta-emergency-plumbing' })],
    })
    expect(fixtures).toMatchObject({
      kind: 'public_catalog_fixture_bundle',
      state: 'available',
      supportMatrix: expect.arrayContaining([expect.objectContaining({ surface: 'route_health' })]),
      gatedExclusions: expect.arrayContaining([expect.objectContaining({ surface: 'api_keys', state: 'unavailable' })]),
      routeHealth: expect.arrayContaining([expect.objectContaining({ route: 'https://ae.example/api/businesses' })]),
    })
    expect(serialized).not.toMatch(privateOrAuthorityPattern)
  })

  it('keeps the page loader on the public readback contract', async () => {
    const readback = await loadDeveloperDiscoveryRoute()

    expect(readback).toMatchObject({
      schemaVersion: 'developer-discovery:v1',
      p2InquiryAvailability: {
        state: 'unavailable',
        source: 'phase2-public-status-contract',
      },
      publicationControls: {
        discoveryApiKeysEnabled: false,
      },
    })
    expect(Object.keys(readback.p2InquiryAvailability).sort()).toEqual(['lastVerifiedAt', 'publicReason', 'source', 'state'])
    expect(JSON.stringify(readback)).not.toMatch(privateOrAuthorityPattern)
  })

  it('derives default discovery artifacts from durable public route handlers', async () => {
    const business = routeBusinessFixture()
    await withRouteClients([business], async () => {
      const list = (await (
        await handleDurableListBusinessesRequest(new Request('https://ae.example/api/businesses'))
      ).json()) as PublicBusinessCatalogApiPage
      const search = (await (
        await handleDurableSearchBusinessesRequest(
          new Request('https://ae.example/api/businesses/search?q=encoded%20solar%20repair')
        )
      ).json()) as PublicBusinessCatalogApiPage
      const detail = await (await handleDurableBusinessDetailRequest(business.slug)).json()
      const schemaResponse = await handleDeveloperDiscoverySchemaRequest(
        new Request('https://ae.example/api/discovery/schema'),
        undefined,
        { now: 8_000 }
      )
      const examplesResponse = await handleDeveloperDiscoveryExamplesRequest(
        new Request('https://ae.example/api/discovery/examples'),
        undefined,
        { now: 8_000 }
      )
      const fixturesResponse = await handleDeveloperDiscoveryFixturesRequest(
        new Request('https://ae.example/api/discovery/fixtures'),
        undefined,
        { now: 8_000 }
      )
      const schema = (await schemaResponse.json()) as DeveloperDiscoverySchemaArtifact
      const examples = (await examplesResponse.json()) as DeveloperDiscoveryExamplesArtifact
      const fixtures = (await fixturesResponse.json()) as DeveloperDiscoveryFixtureBundleArtifact
      const serialized = JSON.stringify({ schema, examples, fixtures })

      expect(list.items).toEqual([expect.objectContaining({ slug: business.slug, name: business.name })])
      expect(search.items).toEqual([expect.objectContaining({ slug: business.slug })])
      expect(detail).toMatchObject({ kind: 'found', business: { slug: business.slug } })
      expect(schema).toMatchObject({
        state: 'available',
        parityStatus: 'matched',
        pagination: { listRoutes: ['/api/businesses', '/api/businesses/search'] },
      })
      expect(examples.examples).toEqual([expect.objectContaining({ slug: business.slug, name: business.name })])
      expect(fixtures.routeHealth).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            route: 'https://ae.example/api/businesses',
            status: 'available',
            httpStatus: 200,
            schemaVersion: 'public-business-catalog-api:v1',
          }),
          expect.objectContaining({
            route: `https://ae.example/api/businesses/${business.slug}`,
            status: 'available',
            httpStatus: 200,
            schemaVersion: 'public-business-catalog-api:v1',
          }),
          expect.objectContaining({
            route: `https://ae.example/${business.slug}/ucp`,
            status: 'available',
            schemaVersion: 'ae-ucp-fallback:v1',
          }),
        ])
      )
      expect(serialized).not.toContain('parramatta-emergency-plumbing')
      expect(serialized).not.toMatch(privateOrAuthorityPattern)
    })
  })
})

function availableDiscoveryState(): DiscoverySourceState {
  const state = createDefaultDiscoverySourceState()
  const business = state.businesses.at(0)

  if (business === undefined) {
    throw new Error('Expected default discovery source state to include a business.')
  }

  const generated = regenerateDiscoveryManifest(state, { businessId: business.businessId }, { now: 3_000 })
  if (generated.kind !== 'ok') {
    throw new Error(`Expected discovery manifest generation to succeed: ${generated.reason}`)
  }

  return state
}

async function withRouteClients(
  businesses: readonly PublicBusinessCatalogApiDto[],
  run: () => Promise<void>
): Promise<void> {
  const registryReset = setPublicRegistrySourcePortForTests({
    list: () => Promise.resolve(routePage(businesses)),
    search: ({ query }) => Promise.resolve(query.trim().length === 0 ? routePage([]) : routePage(businesses, query)),
    detail: ({ slug }) => {
      const business = businesses.find((candidate) => candidate.slug === slug)
      return Promise.resolve(
        business === undefined
          ? { kind: 'not_found', code: 'business_not_found', reason: 'No public business catalog exists for this slug.' }
          : { kind: 'found', schemaVersion: 'public-business-catalog-api:v1', business }
      )
    },
  })
  const discoveryState = availableDiscoveryState()
  const discoveryReset = setPublicDiscoverySourcePortForTests({
    manifest: ({ slug, canonicalBaseUrl, now }) => {
      const generated = regenerateDiscoveryManifest(discoveryState, { slug: 'parramatta-emergency-plumbing' }, {
        ...(canonicalBaseUrl === undefined ? {} : { canonicalBaseUrl }),
        now,
      })
      if (generated.kind !== 'ok') {
        return Promise.resolve({ kind: 'hidden', reason: 'not_public' })
      }

      return Promise.resolve({
        kind: 'available',
        manifest: {
          ...generated.manifest,
          slug: brandNonEmpty(slug, 'Slug'),
          businessName: businesses[0]?.name ?? generated.manifest.businessName,
          publicUrl: `/${slug}`,
          manifestUrl: `${canonicalBaseUrl ?? 'https://ae.example'}/${slug}/ucp`,
        },
      })
    },
    llms: (options) => Promise.resolve(buildLlmsTxt(discoveryState, options)),
    sitemap: (options) => Promise.resolve(buildSitemapXml(discoveryState, options)),
  })

  try {
    await run()
  } finally {
    discoveryReset()
    registryReset()
  }
}

function routePage(items: readonly PublicBusinessCatalogApiDto[], query?: string): PublicBusinessCatalogApiPage {
  return {
    kind: 'ok',
    schemaVersion: 'public-business-catalog-api:v1',
    ...(query === undefined ? {} : { query }),
    items,
    pagination: {
      limit: 20,
      total: items.length,
      hasMore: false,
    },
  }
}

function routeBusinessFixture(): PublicBusinessCatalogApiDto {
  return {
    slug: 'route-derived-solar-repair',
    name: 'Route Derived Solar Repair',
    category: 'Solar repair',
    suburb: 'Fremantle',
    stateTerritory: 'WA',
    publicUrl: '/route-derived-solar-repair',
    trustTier: 'claimed',
    publicStatus: 'published',
    indexStatus: 'indexed',
    discoveryStatus: 'available',
    schemaVersion: 'public-business-catalog-api:v1',
    updatedAt: 8_000,
    services: [
      {
        slug: 'inverter-diagnostics',
        name: 'Inverter diagnostics',
        category: 'Solar repair',
        summary: 'Route-derived public example.',
        serviceArea: 'Fremantle',
        hoursOrUnknown: 'Owner supplied hours',
        firstRequest: {
          mode: 'not_available_yet',
          publicDisclosure: 'First request is not available yet.',
          publicChannel: 'not_available',
          noContactReason: 'Owner has not supplied public contact instructions.',
        },
        status: 'published',
        capabilities: [{ kind: 'phone_inquiry', status: 'unavailable' }],
      },
    ],
  }
}
