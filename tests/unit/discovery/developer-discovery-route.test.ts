import { describe, expect, it } from 'vitest'

import { createEmptyBusinessSourceState } from '@/modules/business/public'
import { createEmptyCatalogSourceState } from '@/modules/catalog/public'
import {
  createDefaultDiscoverySourceState,
  regenerateDiscoveryManifest,
} from '@/modules/discovery/public'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import {
  evaluateDiscoveryProjectionGate,
  mapDeveloperDiscoveryRouteExecutions,
  readDeveloperDiscoveryRoute,
  readDeveloperDiscoverySupportMatrix,
  readP2InquiryAvailabilityPublicStatus,
  renderDeveloperDiscoveryRouteCopy,
} from '@/modules/discovery/developer-discovery'
import type { DeveloperDiscoveryRouteSnapshot } from '@/modules/discovery/developer-discovery'
import { loadDeveloperDiscoveryRoute } from '@/routes/developers.discovery'

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
    const state = createDefaultDiscoverySourceState()
    const generated = regenerateDiscoveryManifest(
      state,
      { businessId: firstBusiness(state).businessId },
      { now: 3_000 }
    )

    expect(generated.kind).toBe('ok')

    const readback = readDeveloperDiscoveryRoute(state, { now: 4_000 })
    const copy = renderDeveloperDiscoveryRouteCopy(readback)

    await expect(loadDeveloperDiscoveryRoute()).resolves.toMatchObject({ schemaVersion: 'developer-discovery:v1' })
    expect(readback.freshness.state).toBe('current')
    expect(readback.publicFacts).toEqual([
      expect.objectContaining({
        slug: 'parramatta-emergency-plumbing',
        schemaVersion: 'public-business-catalog-api:v1',
        discoveryStatus: 'available',
        serviceCount: 1,
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
        expect.objectContaining({
          label: 'Public catalog fixture bundle',
          downloadLabel: 'Download fixture bundle',
          state: 'available',
        }),
      ])
    )
    expect(readback.routeHealth.every((route) => route.status === 'available')).toBe(true)
    expect(readback.p2InquiryAvailability).toMatchObject({
      state: 'unavailable',
      source: 'phase2-public-status-contract',
    })
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
    expect(copy).toContain('Phase 2 inquiry public status: unavailable')
    expectCopyHasNoPlatformOrPaymentClaims(copy)
    expectNoPrivateP2Fields(JSON.stringify(readback))
  })

  it('can derive page facts and route health from executed public route snapshots', () => {
    const routeSnapshot = routeSnapshotWithBusiness({
      slug: 'durable-route-plumbing',
      name: 'Durable Route Plumbing',
      discoveryStatus: 'available',
    })
    const readback = readDeveloperDiscoveryRoute(createDefaultDiscoverySourceState(), {
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
        schemaVersion: 'public-business-catalog-api:v1',
      }),
    ])
    expect(JSON.stringify(readback)).not.toContain('parramatta-emergency-plumbing')
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
          schemaVersion: 'public-business-catalog-api:v1',
        }),
        expect.objectContaining({
          route: 'https://ae.example/durable-route-plumbing/ucp',
          label: 'AE-hosted UCP fallback',
          status: 'available',
          schemaVersion: 'ae-ucp-fallback:v1',
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
        schemaVersion: 'public-business-catalog-api:v1',
        expectedSchemaVersion: 'public-business-catalog-api:v1',
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

  it('renders degraded when public facts exist without current discovery readback', () => {
    const readback = readDeveloperDiscoveryRoute(createDefaultDiscoverySourceState(), { now: 4_000 })
    const copy = renderDeveloperDiscoveryRouteCopy(readback)

    expect(readback.catalogCount).toBe(1)
    expect(readback.freshness).toMatchObject({
      state: 'degraded',
      label: 'Discovery degraded',
    })
    expect(readback.artifacts.every((artifact) => artifact.state === 'degraded')).toBe(true)
    expect(readback.routeHealth.every((route) => route.status === 'stale' && route.freshness === 'degraded')).toBe(true)
    expect(readback.supportMatrix.every((row) => row.state === 'degraded')).toBe(true)
    expect(copy).toContain('At least one public catalog is missing a current discovery readback.')
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

  it('normalizes public Phase 2 inquiry availability without private inquiry fields', () => {
    for (const state of ['available', 'unavailable', 'degraded', 'not_shipped'] as const) {
      const status = readP2InquiryAvailabilityPublicStatus({
        state,
        publicReason: `Public ${state} reason`,
        source: `phase2:${state}`,
        lastVerifiedAt: 4_000,
      })

      expect(status).toEqual({
        state,
        publicReason: `Public ${state} reason`,
        source: `phase2:${state}`,
        lastVerifiedAt: 4_000,
      })
      expect(Object.keys(status).sort()).toEqual(['lastVerifiedAt', 'publicReason', 'source', 'state'])
      expectNoPrivateP2Fields(JSON.stringify(status))
    }
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

function firstBusiness(state: DiscoverySourceState) {
  const business = state.businesses.at(0)
  if (business === undefined) {
    throw new Error('Expected default discovery source state to include a business.')
  }

  return business
}

function routeSnapshotWithBusiness(input: {
  slug: string
  name: string
  discoveryStatus: 'available' | 'degraded' | 'unavailable' | 'stale'
}): DeveloperDiscoveryRouteSnapshot {
  const business = {
    slug: input.slug,
    name: input.name,
    category: 'Emergency plumbing',
    suburb: 'Fremantle',
    stateTerritory: 'WA',
    publicUrl: `/${input.slug}`,
    trustTier: 'claimed',
    publicStatus: 'published',
    indexStatus: 'indexed',
    discoveryStatus: input.discoveryStatus,
    schemaVersion: 'public-business-catalog-api:v1',
    updatedAt: 8_000,
    services: [
      {
        slug: 'burst-pipe-repair',
        name: 'Burst pipe repair',
        category: 'Emergency plumbing',
        summary: 'Urgent pipe repair readback.',
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
      checkedAt: 8_000,
      httpStatus: 200,
      cacheControl: 'no-store',
      schemaVersion: 'public-business-catalog-api:v1',
      expectedSchemaVersion: 'public-business-catalog-api:v1',
      body: page,
    },
    search: {
      route: 'https://ae.example/api/businesses/search?q=Emergency%20plumbing',
      label: 'Public catalog search JSON',
      ok: true,
      checkedAt: 8_000,
      httpStatus: 200,
      cacheControl: 'no-store',
      schemaVersion: 'public-business-catalog-api:v1',
      expectedSchemaVersion: 'public-business-catalog-api:v1',
      body: { ...page, query: 'emergency plumbing' },
    },
    detail: {
      route: `https://ae.example/api/businesses/${input.slug}`,
      label: 'Public catalog detail JSON',
      ok: true,
      checkedAt: 8_000,
      httpStatus: 200,
      cacheControl: 'no-store',
      schemaVersion: 'public-business-catalog-api:v1',
      expectedSchemaVersion: 'public-business-catalog-api:v1',
      body: { kind: 'found', schemaVersion: 'public-business-catalog-api:v1', business },
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
        schemaVersion: 'public-business-catalog-api:v1',
        expectedSchemaVersion: 'public-business-catalog-api:v1',
      },
      {
        route: 'https://ae.example/api/businesses/search?q=Emergency%20plumbing',
        label: 'Public catalog search JSON',
        ok: true,
        checkedAt: 8_000,
        httpStatus: 200,
        cacheControl: 'no-store',
        schemaVersion: 'public-business-catalog-api:v1',
        expectedSchemaVersion: 'public-business-catalog-api:v1',
      },
      {
        route: `https://ae.example/api/businesses/${input.slug}`,
        label: 'Public catalog detail JSON',
        ok: true,
        checkedAt: 8_000,
        httpStatus: 200,
        cacheControl: 'no-store',
        schemaVersion: 'public-business-catalog-api:v1',
        expectedSchemaVersion: 'public-business-catalog-api:v1',
      },
      {
        route: `https://ae.example/${input.slug}/ucp`,
        label: 'AE-hosted UCP fallback',
        ok: true,
        checkedAt: 8_000,
        httpStatus: 200,
        cacheControl: 'public, max-age=60, stale-while-revalidate=300',
        schemaVersion: 'ae-ucp-fallback:v1',
        expectedSchemaVersion: 'ae-ucp-fallback:v1',
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

function emptyDiscoverySourceState(): DiscoverySourceState {
  return {
    ...createEmptyBusinessSourceState(),
    ...createEmptyCatalogSourceState(),
    operationKeys: [],
    auditEvents: [],
    registryProjectionItems: [],
    registryProjectionAttempts: [],
    discoveryManifestAttempts: [],
    indexStatus: [],
    suppressionRules: [],
    discoveryManifests: [],
    invalidationIntents: [],
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
