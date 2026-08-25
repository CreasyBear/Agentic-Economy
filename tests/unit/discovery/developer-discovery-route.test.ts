import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { emptyDiscoverySourceState } from '../../fixtures/source-state'
import { createFixtureDiscoverySourceState } from '../../helpers/discovery-fixture-source-state'
import {
  evaluateDiscoveryProjectionGate,
  mapDeveloperDiscoveryRouteExecutions,
  readDeveloperDiscoveryRoute,
  readDeveloperDiscoverySupportMatrix,
  renderDeveloperDiscoveryRouteCopy,
} from '@/modules/discovery/developer-discovery'
import type { DeveloperDiscoveryRouteSnapshot } from '@/modules/discovery/developer-discovery'
import { loadDeveloperDiscoveryRoute } from '@/modules/discovery/developer-discovery-route'

const forbiddenClaims = [
  /\bapi keys?\b.{0,40}\b(?:live|available|enabled|ready|created|issued)\b/iu,
  /\bsdk\b.{0,40}\b(?:live|available|enabled|ready|launched)\b/iu,
  /\bcli\b.{0,40}\b(?:live|available|enabled|ready|launched)\b/iu,
  /\bmcp\b.{0,40}\b(?:mutation|callable|available|enabled|ready|launched)\b/iu,
  /\bopenapi\b.{0,40}\b(?:action|mutation|available|enabled|ready|launched)\b/iu,
  /payment.{0,40}\b(?:live|available|enabled|ready|required|handler)\b/iu,
  /action endpoint.{0,40}\b(?:live|available|enabled|ready)\b/iu,
  /marketplace/iu,
  /wallet/iu,
  /\bconnect\b/iu,
  /x402/iu,
  /stripe/iu,
  /autonomous/iu,
  /ai agent/iu,
  /callable=true/iu,
  /paymentrequired=true/iu,
] as const

const privateP2FieldNames = [
  'inquiryBody',
  'ownerReply',
  'claimantContact',
  'ownerNotes',
  'notificationPayload',
  'providerPayload',
  'adminEvidence',
] as const

describe('developer discovery route readback', () => {
  it('renders available public catalog facts with schema, example, download, and unsupported labels', async () => {
    const state = createFixtureDiscoverySourceState()
    const readback = readDeveloperDiscoveryRoute(state, { now: 4_000 })
    const copy = renderDeveloperDiscoveryRouteCopy(readback)

    await expect(loadDeveloperDiscoveryRoute()).resolves.toMatchObject({ schemaVersion: 'developer-discovery:v1' })
    expect(readback.publicFacts).toEqual([
      expect.objectContaining({
        slug: 'demo-listed-provider',
        schemaVersion: 'public-business-catalog-api:v2',
        disposition: 'current',
        offeringCount: 1,
      }),
    ])
    expect(readback.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Public catalog schema',
          downloadLabel: 'Download schema JSON',
          state: 'available',
        }),
        expect.objectContaining({
          label: 'Public catalog examples',
          downloadLabel: 'Download examples JSON',
          state: 'available',
        }),
      ])
    )
    expect(readback.artifacts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Public catalog fixture bundle' })])
    )
    expect(readback.routeHealth.every((route) => route.status === 'available')).toBe(true)
    expect(readback.supportMatrix).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surface: 'public_json_routes',
          state: 'shipped',
          routeReadbackStatus: 'available',
          owner: 'agentic-economy-discovery',
        }),
        expect.objectContaining({
          surface: 'schema_examples',
          evidence: expect.arrayContaining(['public-catalog-dto', 'route-readback']),
        }),
      ])
    )
    expect(readback.supportMatrix.every((row) => row.evidence.length > 0 && row.nextAction.length > 0)).toBe(true)
    expect(readback.supportMatrix.some((row) => row.surface === 'openapi_read_projection')).toBe(false)
    expect(readback.supportMatrix.some((row) => row.surface === 'mcp_read_projection')).toBe(false)
    expect(readback.gatedExclusions.map((exclusion) => exclusion.surface)).toEqual(
      expect.arrayContaining(['api_keys', 'sdk', 'cli', 'plugin', 'payment_descriptors', 'protected_action_descriptors'])
    )
    expect(readback.unsupportedCapabilities.every((capability) => capability.reason.length > 0)).toBe(true)
    expect(copy).toContain('Read-only public facts')
    expect(copy).toContain('Business-origin discovery file: unavailable')
    expect(copy).toContain('Commercial or owner-action authority: unavailable')
    expect(copy).toContain('API keys: unavailable')
    expectCopyHasNoPlatformOrPaymentClaims(copy)
    expectNoPrivateP2Fields(JSON.stringify(readback))
  }, 30_000)

  it('can derive page facts and route health from executed public route snapshots', () => {
    const routeSnapshot = routeSnapshotWithBusiness({
      slug: 'durable-route-plumbing',
      name: 'Durable Route Plumbing',
      disposition: 'current',
    })
    const readback = readDeveloperDiscoveryRoute(createFixtureDiscoverySourceState(), {
      canonicalBaseUrl: 'https://ae.example',
      now: 8_000,
      routeSnapshot,
    })

    expect(readback.freshness).toMatchObject({
      state: 'current',
      label: 'Discovery current',
    })
    expect(readback.publicFacts).toEqual([
      expect.objectContaining({
        slug: 'durable-route-plumbing',
        name: 'Durable Route Plumbing',
        schemaVersion: 'public-business-catalog-api:v2',
      }),
    ])
    expect(JSON.stringify(readback)).not.toContain('demo-listed-provider')
    expect(readback.routeHealth).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          route: 'https://ae.example/api/businesses',
          label: 'Public catalog list JSON',
          status: 'available',
          freshness: 'current',
          httpStatus: 200,
          checkedAt: 8_000,
          cacheControl: 'no-store',
          schemaVersion: 'public-business-catalog-api:v2',
        }),
        expect.objectContaining({
          route: 'https://ae.example/durable-route-plumbing/ucp',
          label: 'AE-hosted UCP manifest',
          status: 'available',
          schemaVersion: 'ae-ucp:v2',
        }),
      ])
    )
    expectNoPrivateP2Fields(JSON.stringify(readback))
  })

  it('maps executed route failures to public health rows', () => {
    const health = mapDeveloperDiscoveryRouteExecutions([
      {
        route: 'https://ae.example/api/businesses',
        label: 'Public catalog list JSON',
        ok: true,
        checkedAt: 9_000,
        httpStatus: 200,
        schemaVersion: 'public-business-catalog-api:v2',
        expectedSchemaVersion: 'public-business-catalog-api:v2',
      },
      {
        route: 'https://ae.example/api/businesses/missing',
        label: 'Public catalog detail JSON',
        ok: false,
        checkedAt: 9_000,
        httpStatus: 404,
      },
      {
        route: 'https://ae.example/llms.txt',
        label: 'LLMs text discovery file',
        ok: false,
        checkedAt: 9_000,
        errorCode: 'route_outage',
      },
      {
        route: 'https://ae.example/sitemap.xml',
        label: 'Sitemap discovery file',
        ok: true,
        checkedAt: 9_000,
        stale: true,
      },
      {
        route: 'https://ae.example/api/discovery/schema',
        label: 'Discovery schema',
        ok: true,
        checkedAt: 9_000,
        schemaVersion: 'unexpected:v1',
        expectedSchemaVersion: 'developer-discovery:v1',
      },
    ])

    expect(health).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ route: 'https://ae.example/api/businesses', status: 'available' }),
        expect.objectContaining({
          route: 'https://ae.example/api/businesses/missing',
          status: 'unavailable',
          freshness: 'unavailable',
          errorCode: 'not_found',
          httpStatus: 404,
        }),
        expect.objectContaining({
          route: 'https://ae.example/llms.txt',
          status: 'unavailable',
          errorCode: 'route_outage',
        }),
        expect.objectContaining({
          route: 'https://ae.example/sitemap.xml',
          status: 'stale',
          freshness: 'degraded',
          errorCode: 'stale',
        }),
        expect.objectContaining({
          route: 'https://ae.example/api/discovery/schema',
          status: 'degraded',
          errorCode: 'schema_version_mismatch',
        }),
      ])
    )
  })

  it('renders current when public facts are available', () => {
    const readback = readDeveloperDiscoveryRoute(createFixtureDiscoverySourceState(), { now: 4_000 })
    const copy = renderDeveloperDiscoveryRouteCopy(readback)

    expect(readback.catalogCount).toBe(1)
    expect(readback.freshness).toMatchObject({
      state: 'current',
      label: 'Discovery current',
    })
    expect(readback.artifacts.every((artifact) => artifact.state === 'available')).toBe(true)
    expect(readback.routeHealth.every((route) => route.status === 'available' && route.freshness === 'current')).toBe(true)
    expect(readback.supportMatrix.every((row) => row.state === 'shipped')).toBe(true)
    expect(copy).toContain('Public catalog, read path status, schema, and examples match current source state.')
    expectCopyHasNoPlatformOrPaymentClaims(copy)
  })

  it('renders all artifacts unavailable when no public catalog facts exist', () => {
    const readback = readDeveloperDiscoveryRoute(emptyDiscoverySourceState(), { now: 4_000 })
    const copy = renderDeveloperDiscoveryRouteCopy(readback)

    expect(readback.catalogCount).toBe(0)
    expect(readback.publicFacts).toEqual([])
    expect(readback.freshness).toMatchObject({
      state: 'unavailable',
      label: 'Artifacts unavailable',
    })
    expect(readback.artifacts.every((artifact) => artifact.state === 'unavailable')).toBe(true)
    expect(readback.routeHealth.every((route) => route.status === 'unavailable')).toBe(true)
    expect(readback.supportMatrix.every((row) => row.state === 'unavailable')).toBe(true)
    expect(copy).toContain('No source-owned public catalog facts are published.')
    expectCopyHasNoPlatformOrPaymentClaims(copy)
  })

  it('keeps OpenAPI and MCP out of the support matrix until route parity evidence accepts them', () => {
    const degraded = { state: 'degraded' as const, label: 'Degraded', reason: 'Route health is stale.' }
    const withheld = readDeveloperDiscoverySupportMatrix({
      freshness: degraded,
      projectionGates: [
        { surface: 'openapi_read_projection', routeParity: false, descriptorScanClean: true, evidence: ['route:public-json'] },
      ],
    })
    expect(withheld.some((row) => row.surface === 'openapi_read_projection')).toBe(false)
    expect(evaluateDiscoveryProjectionGate({
      surface: 'mcp_read_projection',
      routeParity: true,
      descriptorScanClean: false,
      evidence: ['route:public-json'],
    })).toMatchObject({ kind: 'withheld' })

    const accepted = readDeveloperDiscoverySupportMatrix({
      freshness: { state: 'current', label: 'Current', reason: 'Route parity passed.' },
      projectionGates: [
        {
          surface: 'openapi_read_projection',
          routeParity: true,
          descriptorScanClean: true,
          evidence: ['route:/api/businesses', 'scan:read-only-descriptors'],
        },
      ],
    })
    expect(accepted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surface: 'openapi_read_projection',
          state: 'shipped',
          evidence: expect.arrayContaining(['route:/api/businesses', 'scan:read-only-descriptors']),
        }),
      ])
    )
  })
})

function routeSnapshotWithBusiness(input: {
  slug: string
  name: string
  disposition: 'current' | 'partial' | 'stale'
}): DeveloperDiscoveryRouteSnapshot {
  const business = {
    businessId: `businesses:${input.slug}`,
    slug: input.slug,
    name: input.name,
    category: 'Emergency plumbing',
    businessContext: { kind: 'local_human', suburb: 'Fremantle', stateTerritory: 'WA' },
    publicUrl: `/${input.slug}`,
    trustTier: 'claimed',
    observedAt: 8_000,
    disposition: input.disposition,
    photos: [],
    offerings: [
      {
        offeringRef: `offering:${input.slug}:burst-pipe-repair`,
        revision: 1,
        name: 'Burst pipe repair',
        category: 'Emergency plumbing',
        summary: 'Urgent pipe repair readback.',
        serviceAreaSummary: 'Fremantle',
        availabilitySummary: 'Owner supplied hours',
        accessPaths: [
          {
            accessPathRef: `access:${input.slug}:burst-pipe-repair`,
            offeringRevision: 1,
            offeringSourceHash: canonicalDigest({
              fixture: 'developer-discovery-route',
              offeringRef: `offering:${input.slug}:burst-pipe-repair`,
            }),
            sourceHash: canonicalDigest({
              fixture: 'developer-discovery-route',
              accessPathRef: `access:${input.slug}:burst-pipe-repair`,
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
    query: 'emergency plumbing',
    items: [business],
    pagination: { limit: 20, total: 1, hasMore: false },
  } as const

  return {
    list: {
      route: 'https://ae.example/api/businesses',
      label: 'Public catalog list JSON',
      ok: true,
      checkedAt: 8_000,
      httpStatus: 200,
      cacheControl: 'no-store',
      schemaVersion: 'public-business-catalog-api:v2',
      expectedSchemaVersion: 'public-business-catalog-api:v2',
      body: page,
    },
    search: {
      route: 'https://ae.example/api/businesses/search?q=Emergency%20plumbing',
      label: 'Public catalog search JSON',
      ok: true,
      checkedAt: 8_000,
      httpStatus: 200,
      cacheControl: 'no-store',
      schemaVersion: 'public-business-catalog-api:v2',
      expectedSchemaVersion: 'public-business-catalog-api:v2',
      body: searchPage,
    },
    detail: {
      route: `https://ae.example/api/businesses/${input.slug}`,
      label: 'Public catalog detail JSON',
      ok: true,
      checkedAt: 8_000,
      httpStatus: 200,
      cacheControl: 'no-store',
      schemaVersion: 'public-business-catalog-api:v2',
      expectedSchemaVersion: 'public-business-catalog-api:v2',
      body: { kind: 'found', schemaVersion: 'public-business-catalog-api:v2', business },
    },
    missingDetail: {
      route: 'https://ae.example/api/businesses/__missing_discovery_slug__',
      label: 'Public catalog missing detail JSON',
      ok: false,
      checkedAt: 8_000,
      httpStatus: 404,
      errorCode: 'not_found',
      body: {
        kind: 'not_found',
        code: 'business_not_found',
        reason: 'No public business catalog exists for this slug.',
      },
    },
    routeExecutions: [
      {
        route: 'https://ae.example/api/businesses',
        label: 'Public catalog list JSON',
        ok: true,
        checkedAt: 8_000,
        httpStatus: 200,
        cacheControl: 'no-store',
        schemaVersion: 'public-business-catalog-api:v2',
        expectedSchemaVersion: 'public-business-catalog-api:v2',
      },
      {
        route: 'https://ae.example/api/businesses/search?q=Emergency%20plumbing',
        label: 'Public catalog search JSON',
        ok: true,
        checkedAt: 8_000,
        httpStatus: 200,
        cacheControl: 'no-store',
        schemaVersion: 'public-business-catalog-api:v2',
        expectedSchemaVersion: 'public-business-catalog-api:v2',
      },
      {
        route: `https://ae.example/api/businesses/${input.slug}`,
        label: 'Public catalog detail JSON',
        ok: true,
        checkedAt: 8_000,
        httpStatus: 200,
        cacheControl: 'no-store',
        schemaVersion: 'public-business-catalog-api:v2',
        expectedSchemaVersion: 'public-business-catalog-api:v2',
      },
      {
        route: `https://ae.example/${input.slug}/ucp`,
        label: 'AE-hosted UCP manifest',
        ok: true,
        checkedAt: 8_000,
        httpStatus: 200,
        cacheControl: 'public, max-age=60, stale-while-revalidate=300',
        schemaVersion: 'ae-ucp:v2',
        expectedSchemaVersion: 'ae-ucp:v2',
      },
      {
        route: 'https://ae.example/llms.txt',
        label: 'LLMs text discovery file',
        ok: true,
        checkedAt: 8_000,
        httpStatus: 200,
        cacheControl: 'public, max-age=60, stale-while-revalidate=300',
      },
      {
        route: 'https://ae.example/sitemap.xml',
        label: 'Sitemap discovery file',
        ok: true,
        checkedAt: 8_000,
        httpStatus: 200,
        cacheControl: 'public, max-age=60, stale-while-revalidate=300',
      },
      {
        route: 'https://ae.example/robots.txt',
        label: 'Robots discovery file',
        ok: true,
        checkedAt: 8_000,
        httpStatus: 200,
        cacheControl: 'public, max-age=60, stale-while-revalidate=300',
      },
    ],
  }
}


function expectCopyHasNoPlatformOrPaymentClaims(copy: string): void {
  for (const claim of forbiddenClaims) {
    expect(copy).not.toMatch(claim)
  }
}

function expectNoPrivateP2Fields(copy: string): void {
  for (const field of privateP2FieldNames) {
    expect(copy).not.toContain(field)
  }
}
