import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createDefaultDiscoverySourceState,
  regenerateDiscoveryManifest,
} from '@/modules/discovery/public'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import type {
  DeveloperDiscoveryExamplesArtifact,
  DeveloperDiscoveryFixtureBundleArtifact,
  DeveloperDiscoverySchemaArtifact,
} from '@/modules/discovery/developer-discovery'
import type {
  PublicBusinessCatalogApiV2Page,
  PublicBusinessCatalogApiV2SearchPage,
} from '@/modules/registry/public'
import { handleDurableBusinessDetailRequest } from '@/routes/api.businesses.$slug'
import { handleDurableListBusinessesRequest } from '@/routes/api.businesses'
import { handleDurableSearchBusinessesRequest } from '@/routes/api.businesses.search'
import { handleDeveloperDiscoveryExamplesRequest } from '@/routes/api.discovery.examples'
import { handleDeveloperDiscoveryFixturesRequest } from '@/routes/api.discovery.fixtures'
import { handleDeveloperDiscoverySchemaRequest } from '@/routes/api.discovery.schema'
import { loadDeveloperDiscoveryRoute } from '@/routes/developers.discovery'

const privateOrAuthorityPattern =
  /inquiryBody|ownerReply|claimantContact|ownerNotes|notificationPayload|providerPayload|adminEvidence|sourceHash|rawContact(?!Excluded)|private:evidence|ownerId|clerk|callable":true|paymentRequired":true|providerOperation":true|requestMarket":true|mutation":true|payment":true|protectedAction":true/iu

beforeEach(() => {
  // Vite loads `.env.local`, so a developer's `VITE_CONVEX_URL` reaches this
  // process and `useLocalRegistryFixture()` (registry.functions.ts:409-412)
  // turns false — these handlers then read whatever the local Convex
  // deployment holds instead of the state each case constructs. Remove the
  // keys rather than blanking them: the gate tests `=== undefined`, so an
  // empty string still reads as configured.
  vi.stubEnv('CONVEX_URL', undefined)
  vi.stubEnv('VITE_CONVEX_URL', undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

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
      routeHealth: expect.arrayContaining([expect.objectContaining({ route: 'http://localhost:3000/api/businesses' })]),
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
  }, 15_000)

  it('derives default discovery artifacts from explicit local public route handlers', async () => {
    const previous = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const list = (await (
        await handleDurableListBusinessesRequest(new Request('https://ae.example/api/businesses'))
      ).json()) as PublicBusinessCatalogApiV2Page
      const search = (await (
        await handleDurableSearchBusinessesRequest(
          new Request('https://ae.example/api/businesses/search?q=emergency%20plumber%20parramatta')
        )
      ).json()) as PublicBusinessCatalogApiV2SearchPage
      const detail = await (await handleDurableBusinessDetailRequest('parramatta-emergency-plumbing')).json()
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
      const firstListedBusiness = list.page.at(0)

      if (firstListedBusiness === undefined) {
        throw new Error('Expected the explicit local public catalog route to return a business.')
      }

      const expectedExampleSlugs = list.page
        .map((item) => item.slug)
        .sort((left, right) => left.localeCompare(right))

      expect(list.page.map((item) => item.slug)).toEqual([
        'parramatta-emergency-plumbing',
        'plumbing-demo',
        'joondalup-rapid-plumbing',
        'fremantle-coastal-electrical',
        'adelaide-dental-clinic',
      ])
      expect(search).toMatchObject({
        kind: 'ok',
        schemaVersion: 'public-business-catalog-api:v2',
        query: 'emergency plumber parramatta',
      })
      expect(search.items.map((item) => item.slug)).toEqual([
        'parramatta-emergency-plumbing',
        'plumbing-demo',
      ])
      expect(search.items.every((item) => list.page.some((listed) => listed.slug === item.slug))).toBe(true)
      expect(detail).toMatchObject({ kind: 'found', business: { slug: 'parramatta-emergency-plumbing' } })
      expect(schema).toMatchObject({
        state: 'degraded',
        parityStatus: 'matched',
        pagination: { listRoutes: ['/api/businesses', '/api/businesses/search'] },
      })
      expect(examples.examples.map((item) => item.slug)).toEqual(expectedExampleSlugs)
      expect(fixtures.routeHealth).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            route: 'http://localhost:3000/api/businesses',
            status: 'available',
            httpStatus: 200,
            schemaVersion: 'public-business-catalog-api:v2',
          }),
          expect.objectContaining({
            route: `http://localhost:3000/api/businesses/${firstListedBusiness.slug}`,
            status: 'available',
            httpStatus: 200,
            schemaVersion: 'public-business-catalog-api:v2',
          }),
          expect.objectContaining({
            route: `http://localhost:3000/${firstListedBusiness.slug}/ucp`,
            status: 'unavailable',
            errorCode: 'route_outage',
          }),
        ])
      )
      expect(serialized).not.toMatch(privateOrAuthorityPattern)
    } finally {
      if (previous === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previous
      }
    }
  })
})

function availableDiscoveryState(): DiscoverySourceState {
  const state = createDefaultDiscoverySourceState()
  const business = state.businesses.at(0)

  if (business === undefined) {
    throw new Error('Expected default discovery source state to include a business.')
  }

  const generated = regenerateDiscoveryManifest(state, { businessId: business.businessId }, { canonicalBaseUrl: 'https://agentic.test', now: 3_000 })
  if (generated.kind !== 'ok') {
    throw new Error(`Expected discovery manifest generation to succeed: ${generated.reason}`)
  }

  return state
}
