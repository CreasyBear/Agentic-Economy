import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'

import { regenerateDiscoveryManifest } from '@/modules/discovery/public'
import {
  createFixtureDiscoverySourceState,
  testOnlyDiscoveryManifestAdapter,
} from '../../helpers/discovery-fixture-source-state'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import {
  generateDeveloperDiscoveryExamples,
  generateDeveloperDiscoverySchema,
  withholdDeveloperDiscoveryArtifact,
} from '@/modules/discovery/developer-discovery'
import type { DeveloperDiscoveryRouteSnapshot } from '@/modules/discovery/developer-discovery'

const forbiddenPrivateOrAuthorityPattern =
  /inquiryBody|ownerReply|claimantContact|ownerNotes|notificationPayload|providerPayload|adminEvidence|rawContact(?!Excluded)|private:evidence|callable":true|paymentRequired":true|providerOperation":true|requestMarket":true|mutation":true|payment":true|protectedAction":true/iu

describe('developer discovery generated artifact parity', () => {
  it('generates schema and examples from public route DTO fields only', () => {
    const state = availableDiscoveryState()
    const options = { canonicalBaseUrl: 'https://ae.example', now: 5_000 }
    const schema = generateDeveloperDiscoverySchema(state, options)
    const examples = generateDeveloperDiscoveryExamples(state, options)
    const serialized = [schema, examples].map((artifact) => JSON.stringify(artifact)).join('\n')

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
        'businessId',
        'offerings[].offeringRef',
        'offerings[].accessPaths',
        'offerings[].support',
      ])
    )
    expect(schema.statusVariants).toMatchObject({
      disposition: ['current', 'partial', 'stale'],
      offeringAccessPathKind: ['human_request', 'external_operation'],
      offeringSupport: ['integrated', 'ae_supported_action'],
    })

    expect(examples).toMatchObject({
      kind: 'public_catalog_examples',
      state: 'available',
      emptyExample: {
        kind: 'ok',
        schemaVersion: 'public-business-catalog-api:v2',
        page: [],
        isDone: true,
        continueCursor: '',
      },
    })
    expect(examples.examples[0]).toMatchObject({
      slug: 'parramatta-emergency-plumbing',
      schemaVersion: 'public-business-catalog-api:v2',
      offerings: [expect.objectContaining({ name: 'Emergency pipe repair' })],
    })

    expect(serialized).not.toMatch(forbiddenPrivateOrAuthorityPattern)
    expect(serialized).not.toContain('public_catalog_fixture_bundle')
  })

  it('generates route-derived examples from public list/search/detail snapshots', () => {
    const state = availableDiscoveryState()
    const routeSnapshot = routeSnapshotWithNonDefaultBusiness()
    const options = { canonicalBaseUrl: 'https://ae.example', now: 6_000, routeSnapshot }
    const examples = generateDeveloperDiscoveryExamples(state, options)
    const serialized = JSON.stringify({ examples })

    expect(examples).toMatchObject({
      kind: 'public_catalog_examples',
      state: 'available',
      examples: [
        expect.objectContaining({
          slug: 'route-derived-solar-repair',
          name: 'Route Derived Solar Repair',
          schemaVersion: 'public-business-catalog-api:v2',
          offerings: [expect.objectContaining({ name: 'Inverter diagnostics' })],
        }),
      ],
    })
    expect(serialized).not.toContain('parramatta-emergency-plumbing')
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
    expect(withheld).toMatchObject({
      state: 'unavailable',
      parityStatus: 'withheld',
      parityReason: 'Route parity failed for schema test.',
    })
  })
})

function availableDiscoveryState(): DiscoverySourceState {
  const state = createFixtureDiscoverySourceState()
  const business = state.businesses.at(0)

  if (business === undefined) {
    throw new Error('Expected default discovery source state to include a business.')
  }

  const generated = regenerateDiscoveryManifest(
    state,
    { businessId: business.businessId },
    {
      canonicalBaseUrl: 'https://agentic.test',
      now: 3_000,
      adapter: testOnlyDiscoveryManifestAdapter,
    },
  )
  if (generated.kind !== 'ok') {
    throw new Error(`Expected discovery manifest generation to succeed: ${generated.reason}`)
  }

  return state
}

function routeSnapshotWithNonDefaultBusiness(): DeveloperDiscoveryRouteSnapshot {
  const business = {
    businessId: 'businesses:route-derived-solar-repair',
    slug: 'route-derived-solar-repair',
    name: 'Route Derived Solar Repair',
    category: 'Solar repair',
    businessContext: { kind: 'local_human', suburb: 'Fremantle', stateTerritory: 'WA' },
    publicUrl: '/route-derived-solar-repair',
    trustTier: 'claimed',
    observedAt: 6_000,
    disposition: 'current',
    photos: [],
    offerings: [
      {
        offeringRef: 'offering:route-derived-solar-repair:inverter-diagnostics',
        revision: 1,
        name: 'Inverter diagnostics',
        category: 'Solar repair',
        summary: 'Read-only diagnostics listing.',
        serviceAreaSummary: 'Fremantle',
        availabilitySummary: 'Owner supplied hours',
        accessPaths: [
          {
            accessPathRef: 'access:route-derived-solar-repair:inverter-diagnostics',
            offeringRevision: 1,
            offeringSourceHash: canonicalDigest({
              fixture: 'developer-discovery-parity',
              offeringRef: 'offering:route-derived-solar-repair:inverter-diagnostics',
            }),
            sourceHash: canonicalDigest({
              fixture: 'developer-discovery-parity',
              accessPathRef: 'access:route-derived-solar-repair:inverter-diagnostics',
            }),
            kind: 'human_request',
            channel: 'phone',
            disclosure: 'This business has not published a request path.',
          },
        ],
        support: {
          integrated: false,
          aeSupportedAction: false,
        },
      },
    ],
    accessSummary: {
      humanRequest: true,
      externalOperation: false,
      aeSupportedAction: false,
    },
    schemaVersion: 'public-business-catalog-api:v2',
  } as const
  const page = {
    kind: 'ok',
    schemaVersion: 'public-business-catalog-api:v2',
    page: [business],
    isDone: true,
    continueCursor: '1',
  } as const
  const searchPage = {
    kind: 'ok',
    schemaVersion: 'public-business-catalog-api:v2',
    query: 'solar repair',
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
      schemaVersion: 'public-business-catalog-api:v2',
      expectedSchemaVersion: 'public-business-catalog-api:v2',
      body: page,
    },
    search: {
      route: 'https://ae.example/api/businesses/search?q=Solar%20repair',
      label: 'Public catalog search JSON',
      ok: true,
      checkedAt: 6_000,
      httpStatus: 200,
      schemaVersion: 'public-business-catalog-api:v2',
      expectedSchemaVersion: 'public-business-catalog-api:v2',
      body: searchPage,
    },
    detail: {
      route: 'https://ae.example/api/businesses/route-derived-solar-repair',
      label: 'Public catalog detail JSON',
      ok: true,
      checkedAt: 6_000,
      httpStatus: 200,
      schemaVersion: 'public-business-catalog-api:v2',
      expectedSchemaVersion: 'public-business-catalog-api:v2',
      body: { kind: 'found', schemaVersion: 'public-business-catalog-api:v2', business },
    },
    routeExecutions: [
      {
        route: 'https://ae.example/api/businesses',
        label: 'Public catalog list JSON',
        ok: true,
        checkedAt: 6_000,
        httpStatus: 200,
        schemaVersion: 'public-business-catalog-api:v2',
        expectedSchemaVersion: 'public-business-catalog-api:v2',
      },
      {
        route: 'https://ae.example/api/businesses/search?q=Solar%20repair',
        label: 'Public catalog search JSON',
        ok: true,
        checkedAt: 6_000,
        httpStatus: 200,
        schemaVersion: 'public-business-catalog-api:v2',
        expectedSchemaVersion: 'public-business-catalog-api:v2',
      },
      {
        route: 'https://ae.example/api/businesses/route-derived-solar-repair',
        label: 'Public catalog detail JSON',
        ok: true,
        checkedAt: 6_000,
        httpStatus: 200,
        schemaVersion: 'public-business-catalog-api:v2',
        expectedSchemaVersion: 'public-business-catalog-api:v2',
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
