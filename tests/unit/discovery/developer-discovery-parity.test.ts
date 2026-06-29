import { describe, expect, it } from 'vitest'

import {
  createDefaultDiscoverySourceState,
  generateDeveloperDiscoveryExamples,
  generateDeveloperDiscoveryFixtureBundle,
  generateDeveloperDiscoverySchema,
  regenerateDiscoveryManifest,
  withholdDeveloperDiscoveryArtifact,
} from '@/modules/discovery/public'
import type { DeveloperDiscoveryRouteSnapshot, DiscoverySourceState } from '@/modules/discovery/public'

const forbiddenPrivateOrAuthorityPattern =
  /inquiryBody|ownerReply|claimantContact|ownerNotes|notificationPayload|providerPayload|adminEvidence|sourceHash|rawContact(?!Excluded)|private:evidence|callable":true|paymentRequired":true|providerOperation":true|requestMarket":true|mutation":true|payment":true|protectedAction":true/iu

describe('developer discovery generated artifact parity', () => {
  it('generates schema, examples, and fixtures from public route DTO fields only', () => {
    const state = availableDiscoveryState()
    const options = { canonicalBaseUrl: 'https://ae.example', now: 5_000 }
    const schema = generateDeveloperDiscoverySchema(state, options)
    const examples = generateDeveloperDiscoveryExamples(state, options)
    const fixtures = generateDeveloperDiscoveryFixtureBundle(state, options)
    const serialized = [schema, examples, fixtures].map((artifact) => JSON.stringify(artifact)).join('\n')

    expect(schema).toMatchObject({
      kind: 'public_catalog_schema',
      schemaVersion: 'developer-discovery:v1',
      cacheVersion: 'public-catalog-readonly-cache:v1',
      generatedAt: 5_000,
      sourceRoute: 'https://ae.example/api/discovery/schema',
      state: 'available',
      parityStatus: 'matched',
      nonAuthority: true,
      unsupported: {
        mutation: false,
        payment: false,
        protectedAction: false,
        providerOperation: false,
        requestMarket: false,
      },
      pagination: {
        listRoutes: ['/api/businesses', '/api/businesses/search'],
        cursorSupported: true,
        limitSupported: true,
      },
    })
    expect(schema.fields.map((field) => field.path)).toEqual(
      expect.arrayContaining([
        'slug',
        'services[].slug',
        'services[].firstRequest.publicChannel',
        'services[].capabilities[].kind',
        'services[].capabilities[].status',
      ])
    )
    expect(schema.statusVariants).toMatchObject({
      publicStatus: ['published'],
      indexStatus: ['not_queued', 'queued', 'indexed', 'failed', 'stale'],
      discoveryStatus: ['unavailable', 'degraded', 'available', 'stale'],
      firstRequestMode: ['inquiry_available', 'quote_request_available', 'not_available_yet'],
      capabilityStatus: ['unavailable', 'degraded', 'available', 'stale'],
    })

    expect(examples).toMatchObject({
      kind: 'public_catalog_examples',
      state: 'available',
      emptyExample: { kind: 'ok', items: [], pagination: { total: 0, hasMore: false } },
    })
    expect(examples.examples[0]).toMatchObject({
      slug: 'parramatta-emergency-plumbing',
      schemaVersion: 'public-business-catalog-api:v1',
      services: [
        expect.objectContaining({
          slug: 'emergency-pipe-repair',
          capabilities: [expect.objectContaining({ kind: 'phone_inquiry', status: 'unavailable' })],
        }),
      ],
    })

    expect(fixtures).toMatchObject({
      kind: 'public_catalog_fixture_bundle',
      state: 'available',
      schema: { kind: 'public_catalog_schema' },
      supportMatrix: expect.arrayContaining([expect.objectContaining({ surface: 'public_json_routes' })]),
      gatedExclusions: expect.arrayContaining([expect.objectContaining({ surface: 'api_keys', state: 'unavailable' })]),
      p2InquiryAvailability: {
        state: 'unavailable',
        publicReason: expect.any(String),
        source: 'phase2-public-status-contract',
        lastVerifiedAt: 0,
      },
    })
    expect(serialized).not.toMatch(forbiddenPrivateOrAuthorityPattern)
  })

  it('generates route-derived examples from public list/search/detail snapshots', () => {
    const state = availableDiscoveryState()
    const routeSnapshot = routeSnapshotWithNonDefaultBusiness()
    const options = { canonicalBaseUrl: 'https://ae.example', now: 6_000, routeSnapshot }
    const examples = generateDeveloperDiscoveryExamples(state, options)
    const fixtures = generateDeveloperDiscoveryFixtureBundle(state, options)
    const serialized = JSON.stringify({ examples, fixtures })

    expect(examples).toMatchObject({
      kind: 'public_catalog_examples',
      state: 'available',
      examples: [
        expect.objectContaining({
          slug: 'route-derived-solar-repair',
          name: 'Route Derived Solar Repair',
          schemaVersion: 'public-business-catalog-api:v1',
          services: [expect.objectContaining({ slug: 'inverter-diagnostics' })],
        }),
      ],
    })
    expect(serialized).not.toContain('parramatta-emergency-plumbing')
    expect(fixtures.routeHealth).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          route: 'https://ae.example/api/businesses',
          status: 'available',
          httpStatus: 200,
          schemaVersion: 'public-business-catalog-api:v1',
        }),
      ])
    )
    expect(serialized).not.toMatch(forbiddenPrivateOrAuthorityPattern)
  })

  it('withholds generated artifacts when publication is disabled or parity fails', () => {
    const state = availableDiscoveryState()
    const disabledOptions = {
      canonicalBaseUrl: 'https://ae.example',
      now: 5_000,
      operatorControls: [{ key: 'developer_discovery_publish_enabled', effectiveEnabled: false }],
    } as const
    const schema = generateDeveloperDiscoverySchema(state, disabledOptions)
    const examples = generateDeveloperDiscoveryExamples(state, disabledOptions)
    const fixtures = generateDeveloperDiscoveryFixtureBundle(state, disabledOptions)
    const withheld = withholdDeveloperDiscoveryArtifact(
      generateDeveloperDiscoverySchema(state, { canonicalBaseUrl: 'https://ae.example', now: 5_000 }),
      'Route parity failed for schema test.'
    )

    expect(schema).toMatchObject({
      state: 'unavailable',
      parityStatus: 'withheld',
      fields: [],
    })
    expect(examples).toMatchObject({
      state: 'unavailable',
      parityStatus: 'withheld',
      examples: [],
      emptyExample: { kind: 'ok' },
    })
    expect(fixtures).toMatchObject({
      state: 'unavailable',
      parityStatus: 'withheld',
      examples: [],
      schema: { state: 'unavailable', parityStatus: 'withheld' },
    })
    expect(withheld).toMatchObject({
      state: 'unavailable',
      parityStatus: 'withheld',
      parityReason: 'Route parity failed for schema test.',
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

function routeSnapshotWithNonDefaultBusiness(): DeveloperDiscoveryRouteSnapshot {
  const business = {
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
    updatedAt: 6_000,
    services: [
      {
        slug: 'inverter-diagnostics',
        name: 'Inverter diagnostics',
        category: 'Solar repair',
        summary: 'Read-only diagnostics listing.',
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
  } as const
  const page = {
    kind: 'ok',
    schemaVersion: 'public-business-catalog-api:v1',
    items: [business],
    pagination: { limit: 20, total: 1, hasMore: false },
  } as const

  return {
    list: {
      route: 'https://ae.example/api/businesses',
      label: 'Public catalog list JSON',
      ok: true,
      checkedAt: 6_000,
      httpStatus: 200,
      schemaVersion: 'public-business-catalog-api:v1',
      expectedSchemaVersion: 'public-business-catalog-api:v1',
      body: page,
    },
    search: {
      route: 'https://ae.example/api/businesses/search?q=Solar%20repair',
      label: 'Public catalog search JSON',
      ok: true,
      checkedAt: 6_000,
      httpStatus: 200,
      schemaVersion: 'public-business-catalog-api:v1',
      expectedSchemaVersion: 'public-business-catalog-api:v1',
      body: { ...page, query: 'solar repair' },
    },
    detail: {
      route: 'https://ae.example/api/businesses/route-derived-solar-repair',
      label: 'Public catalog detail JSON',
      ok: true,
      checkedAt: 6_000,
      httpStatus: 200,
      schemaVersion: 'public-business-catalog-api:v1',
      expectedSchemaVersion: 'public-business-catalog-api:v1',
      body: { kind: 'found', schemaVersion: 'public-business-catalog-api:v1', business },
    },
    routeExecutions: [
      {
        route: 'https://ae.example/api/businesses',
        label: 'Public catalog list JSON',
        ok: true,
        checkedAt: 6_000,
        httpStatus: 200,
        schemaVersion: 'public-business-catalog-api:v1',
        expectedSchemaVersion: 'public-business-catalog-api:v1',
      },
      {
        route: 'https://ae.example/api/businesses/search?q=Solar%20repair',
        label: 'Public catalog search JSON',
        ok: true,
        checkedAt: 6_000,
        httpStatus: 200,
        schemaVersion: 'public-business-catalog-api:v1',
        expectedSchemaVersion: 'public-business-catalog-api:v1',
      },
      {
        route: 'https://ae.example/api/businesses/route-derived-solar-repair',
        label: 'Public catalog detail JSON',
        ok: true,
        checkedAt: 6_000,
        httpStatus: 200,
        schemaVersion: 'public-business-catalog-api:v1',
        expectedSchemaVersion: 'public-business-catalog-api:v1',
      },
      {
        route: 'https://ae.example/route-derived-solar-repair/ucp',
        label: 'AE-hosted UCP fallback',
        ok: true,
        checkedAt: 6_000,
        httpStatus: 200,
        schemaVersion: 'ae-ucp-fallback:v1',
        expectedSchemaVersion: 'ae-ucp-fallback:v1',
      },
      { route: 'https://ae.example/llms.txt', label: 'LLMs text discovery file', ok: true, checkedAt: 6_000, httpStatus: 200 },
      { route: 'https://ae.example/sitemap.xml', label: 'Sitemap discovery file', ok: true, checkedAt: 6_000, httpStatus: 200 },
      { route: 'https://ae.example/robots.txt', label: 'Robots discovery file', ok: true, checkedAt: 6_000, httpStatus: 200 },
    ],
  }
}
