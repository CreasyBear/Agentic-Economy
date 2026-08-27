import { describe, expect, it } from 'vitest'

import { getPublicBusinessCatalog } from '@/modules/registry/public'
import {
  operationCompareOutputSchema,
  operationDetailOutputSchema,
  operationInspectPlanOutputSchema,
  operationSearchOutputSchema,
} from '@/modules/capability-supply/public'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { brandNonEmpty } from '@/modules/common/ids'
import { isRecord } from '@/modules/common/is-record'
import {
  createPublicSourceTransport,
  setPublicSourceTransportForTests,
} from '@/lib/server/convex-source'
import {
  OPERATION_MARKET_ACTION_ENTRIES,
  OPERATION_MARKET_COMPARE_PATH,
  OPERATION_MARKET_DETAIL_PATH,
  OPERATION_MARKET_INSPECT_PLAN_PATH,
  OPERATION_MARKET_SEARCH_PATH,
} from '@/modules/registry/operation-entry'
import { registryDetailAction, registryListAction } from '@/modules/registry/registry.actions'
import {
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
} from '@/modules/discovery/public'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import {
  getPublicBusinessOfferingSupplyBySlug,
  listPublicBusinessOfferingSupply,
  searchPublicBusinessOfferingSupply,
} from '@/modules/registry/public'
import { Route as MarketOperationCompareRoute } from '@/routes/api.v1.market-operations.compare'
import { Route as MarketOperationDetailRoute } from '@/routes/api.v1.market-operations.detail'
import { Route as MarketOperationInspectPlanRoute } from '@/routes/api.v1.market-operations.inspect-plan'
import { Route as MarketOperationSearchRoute } from '@/routes/api.v1.market-operations.search'
import { handleUcpManifestRequest } from '../helpers/discovery-fixture-routes'
import { createFixtureDiscoverySourceState } from '../helpers/discovery-fixture-source-state'
import { handleRobotsTxtRequest } from '@/routes/robots[.]txt'
import { handleSiteDiscoveryManifestRequest } from '@/routes/[.]well-known/ucp'
import { createDurablePublishedDiscoveryState } from '../fixtures/discovery-published-state'

/**
 * Every case here asserts parity between advertised discovery output and the
 * pure projections that back the public routes.
 */
describe('discovery route parity', () => {

  it('tracks one durable catalog and suppression across public page, registry projections, UCP, llms, and sitemap', async () => {
    const state = createDurablePublishedDiscoveryState({
      businessName: 'Fremantle Heat Pump Repairs',
      requestedSlug: 'fremantle-heat-pump-repairs',
      serviceName: 'Heat pump diagnostics',
      serviceQuery: 'heat pump fremantle',
      suburb: 'Fremantle',
      idPrefix: 'discovery-parity-test',
    })

    const page = getPublicBusinessCatalog(state, {
      slug: brandNonEmpty('fremantle-heat-pump-repairs', 'Slug'),
      indexStatus: 'indexed',
      discoveryStatus: 'available',
    })
    const registryList = listPublicBusinessOfferingSupply(state, {
      paginationOpts: { cursor: null, numItems: 20 },
    })
    const registrySearch = searchPublicBusinessOfferingSupply(state, {
      query: 'heat pump fremantle',
    })
    const apiDetail = getPublicBusinessOfferingSupplyBySlug(state, {
      slug: 'fremantle-heat-pump-repairs',
    })
    const ucpResponse = handleUcpManifestRequest(
      new Request('https://ae.example/fremantle-heat-pump-repairs/ucp'),
      'fremantle-heat-pump-repairs',
      state,
    )
    const ucp = await ucpResponse.json()
    const llms = buildLlmsTxt(state, { canonicalBaseUrl: 'https://ae.example' })
    const sitemap = buildSitemapXml(state, { canonicalBaseUrl: 'https://ae.example', now: 13_000 })

    expect(page).toMatchObject({
      kind: 'available',
      catalog: { slug: 'fremantle-heat-pump-repairs', name: 'Fremantle Heat Pump Repairs' },
    })
    expect(registryList.page.map((item) => item.slug)).toEqual(['fremantle-heat-pump-repairs'])
    expect(registrySearch.items.map((item) => item.slug)).toEqual(['fremantle-heat-pump-repairs'])
    expect(apiDetail).toMatchObject({
      kind: 'found',
      business: { slug: 'fremantle-heat-pump-repairs', name: 'Fremantle Heat Pump Repairs' },
    })
    expect(ucp).toMatchObject({
      slug: 'fremantle-heat-pump-repairs',
      businessName: 'Fremantle Heat Pump Repairs',
    })
    expect(llms.body).toContain('slug=fremantle-heat-pump-repairs')
    expect(sitemap.body).toContain('https://ae.example/fremantle-heat-pump-repairs')
    expect(JSON.stringify({ page, registryList, registrySearch, apiDetail, ucp, llms })).not.toContain(
      'demo-listed-provider'
    )

    suppressFirstBusiness(state)

    const suppressedPage = getPublicBusinessCatalog(state, {
      slug: brandNonEmpty('fremantle-heat-pump-repairs', 'Slug'),
      indexStatus: 'indexed',
      discoveryStatus: 'available',
    })
    const suppressedRegistryList = listPublicBusinessOfferingSupply(state, {
      paginationOpts: { cursor: null, numItems: 20 },
    })
    const suppressedRegistrySearch = searchPublicBusinessOfferingSupply(state, {
      query: 'heat pump fremantle',
    })
    const suppressedDetail = getPublicBusinessOfferingSupplyBySlug(state, {
      slug: 'fremantle-heat-pump-repairs',
    })
    const suppressedManifest = handleUcpManifestRequest(
      new Request('https://ae.example/fremantle-heat-pump-repairs/ucp'),
      'fremantle-heat-pump-repairs',
      state,
    )
    const suppressedLlms = buildLlmsTxt(state, { canonicalBaseUrl: 'https://ae.example' })
    const suppressedSitemap = buildSitemapXml(state, { canonicalBaseUrl: 'https://ae.example', now: 13_000 })

    expect(suppressedPage).toEqual({ kind: 'hidden', reason: 'not_published' })
    expect(suppressedRegistryList.page).toEqual([])
    expect(suppressedRegistrySearch.items).toEqual([])
    expect(suppressedDetail).toEqual({
      kind: 'not_found',
      code: 'business_not_found',
      reason: 'No public business catalog exists for this slug.',
    })
    expect(suppressedManifest.status).toBe(404)
    expect(suppressedLlms.body).not.toContain('fremantle-heat-pump-repairs')
    expect(suppressedSitemap.body).not.toContain('fremantle-heat-pump-repairs')
  })

  it('keeps every URL advertised by explicit local manifest, llms, sitemap, and robots outputs resolvable', async () => {
    const origin = 'https://ae.example'
    const state = createFixtureDiscoverySourceState()
    const manifestResponse = handleUcpManifestRequest(
      new Request(`${origin}/demo-listed-provider/ucp`),
      'demo-listed-provider',
      state,
    )
    const manifest = await manifestResponse.json()
    const llms = buildLlmsTxt(state, { canonicalBaseUrl: origin })
    const sitemap = buildSitemapXml(state, { canonicalBaseUrl: origin, now: 0 })
    const robots = buildRobotsTxt({ canonicalBaseUrl: origin })
    const routes = uniqueRoutes([
      ...[manifest.publicUrl, manifest.manifestUrl].map(advertisedRoute),
      ...llms.urls.map(advertisedRoute),
      ...sitemap.urls.map(advertisedRoute),
      ...sitemapLocs(sitemap.body).map(advertisedRoute),
      ...robots.urls.map(advertisedRoute),
    ])

    expect(routes.length).toBeGreaterThan(0)
    const restoreMarketOperationSource = installMarketOperationSource()
    try {
      for (const route of routes) {
        const resolved = await resolveAdvertisedRoute(route, state)
        expect(resolved, `${route.method} ${route.url}`).toBe(true)
      }
    } finally {
      restoreMarketOperationSource()
    }
  })

  it('keeps llms API routes aligned with current public response schemas', async () => {
    const state = createFixtureDiscoverySourceState()
    const origin = 'https://ae.example'
    const llms = buildLlmsTxt(state, { canonicalBaseUrl: origin })
    const apiRoutes = llms.urls
      .filter((url) => new URL(url).pathname.startsWith('/api/'))
      .map(advertisedRoute)
    const apiPaths = apiRoutes.map((route) => new URL(route.url).pathname)
    const expectedApiPaths = [
      '/api/businesses',
      ...state.businesses.map((business) => `/api/businesses/${business.slug}`),
      OPERATION_MARKET_SEARCH_PATH,
      OPERATION_MARKET_DETAIL_PATH,
      OPERATION_MARKET_COMPARE_PATH,
      OPERATION_MARKET_INSPECT_PLAN_PATH,
    ].sort()

    expect(apiPaths.sort()).toEqual(expectedApiPaths)
    expect(
      apiRoutes
        .filter((route) => new URL(route.url).pathname.startsWith('/api/v1/market-operations/'))
        .every((route) => route.method === 'POST'),
    ).toBe(true)

    const listRoute = apiRoutes.find((route) => new URL(route.url).pathname === '/api/businesses')
    const businessDetailRoute = apiRoutes.find(
      (route) => new URL(route.url).pathname === '/api/businesses/demo-listed-provider',
    )
    const searchRoute = apiRoutes.find((route) => new URL(route.url).pathname === OPERATION_MARKET_SEARCH_PATH)
    const operationDetailRoute = apiRoutes.find((route) => new URL(route.url).pathname === OPERATION_MARKET_DETAIL_PATH)
    if (
      listRoute === undefined
      || businessDetailRoute === undefined
      || searchRoute === undefined
      || operationDetailRoute === undefined
    ) {
      throw new Error('Expected current llms list, search, and detail URLs to be present.')
    }

    const listBody = listPublicBusinessOfferingSupply(state, {
      paginationOpts: { cursor: null, numItems: 20 },
    })
    const detailBody = getPublicBusinessOfferingSupplyBySlug(state, {
      slug: new URL(businessDetailRoute.url).pathname.split('/').at(-1) ?? '',
    })

    expect(registryListAction.outputSchema.safeParse(listBody).success).toBe(true)
    expect(listBody.page.map((item) => item.slug)).toContain('demo-listed-provider')
    expect(registryDetailAction.outputSchema.safeParse(detailBody).success).toBe(true)
    const restoreMarketOperationSource = installMarketOperationSource()
    const operationDetailResponse = await routeHandler(MarketOperationDetailRoute, 'POST')({
      request: new Request(`${origin}${OPERATION_MARKET_DETAIL_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operationRef: MARKET_OPERATION_DETAIL_REF }),
      }),
      params: {},
    })
    expect(operationDetailResponse.status).toBe(200)
    const operationDetailBody: unknown = await operationDetailResponse.json()
    expect(operationDetailOutputSchema.safeParse(operationDetailBody).success).toBe(true)
    expect(operationDetailBody).toMatchObject({
      kind: 'found',
      operation: {
        callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
        paymentLane: 'brokered',
      },
    })
    try {
      for (const route of apiRoutes) {
        expect(await resolveAdvertisedRoute(route, state), `${route.method} ${route.url}`).toBe(true)
      }

      const wrongMethod = await routeHandler(MarketOperationSearchRoute, 'GET')({
        request: new Request(`${origin}${OPERATION_MARKET_SEARCH_PATH}`, { method: 'GET' }),
        params: {},
      })
      expect(wrongMethod.status).toBe(405)
      expect(wrongMethod.headers.get('allow')).toBe('POST')
      await expect(wrongMethod.json()).resolves.toMatchObject({
        status: 405,
        kind: 'METHOD_NOT_ALLOWED',
        code: 'method_not_allowed',
      })
    } finally {
      restoreMarketOperationSource()
    }
  })
})

type AdvertisedRoute = Readonly<{
  url: string
  method: 'GET' | 'POST'
}>

function advertisedRoute(url: string): AdvertisedRoute {
  const path = new URL(url).pathname
  const marketRoute = OPERATION_MARKET_ACTION_ENTRIES.find((entry) => entry.pathTemplate === path)
  return {
    url,
    method: marketRoute?.method ?? 'GET',
  }
}
type RouteHandler = (context: Readonly<{
  request: Request
  params: Record<string, string>
}>) => Response | Promise<Response>


type OutputSchema = Readonly<{
  safeParse: (value: unknown) => Readonly<{ success: boolean }>
}>

type MarketOperationRouteCase = Readonly<{
  path: string
  route: unknown
  input: Readonly<Record<string, unknown>>
  outputSchema: OutputSchema
}>

const MARKET_OPERATION_DETAIL_REF = `operation:v1:${'f'.repeat(64)}`
const MARKET_OPERATION_DETAIL_WIRE_DESCRIPTOR = {
  operationRef: MARKET_OPERATION_DETAIL_REF,
  operationId: 'reference-operation',
  callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
  paymentLane: 'brokered',
  contract: {
    capabilityId: 'reference.lookup',
    version: 1,
    inputJsonSchema: '{"type":"object","properties":{},"required":[],"additionalProperties":false}',
    outputJsonSchema: '{"type":"object","properties":{},"required":[],"additionalProperties":false}',
    customerAnnotations: [],
  },
  business: { businessId: 'business:reference', slug: 'reference-business', name: 'Reference Business' },
  offering: {
    offeringRef: 'offering:reference',
    revision: 1,
    label: 'Reference lookup',
    summary: 'Reference lookup operation.',
  },
  summary: 'Reference lookup operation.',
  commercial: {
    price: { kind: 'on_request' },
    materialTerms: [],
    relationship: { kind: 'none', summary: 'No commercial relationship.' },
  },
  dataUse: [],
  effects: [],
  evidence: [],
  cancellation: { kind: 'unsupported' },
  recovery: { idempotency: 'not_applicable', recovery: 'retry_safe' },
  authentication: { kind: 'keyless' },
  transport: { method: 'POST', requestTimeoutMs: 1_000 },
  provenance: { publisher: 'ae_curated_external', sourceKind: 'ae_envelope' },
  availability: { posture: 'integrated' },
  navigation: [],
} as const

const MARKET_OPERATION_ROUTE_CASES: readonly MarketOperationRouteCase[] = [
  {
    path: OPERATION_MARKET_SEARCH_PATH,
    route: MarketOperationSearchRoute,
    input: { query: 'reference lookup', limit: 1 },
    outputSchema: operationSearchOutputSchema,
  },
  {
    path: OPERATION_MARKET_DETAIL_PATH,
    route: MarketOperationDetailRoute,
    input: { operationRef: MARKET_OPERATION_DETAIL_REF },
    outputSchema: operationDetailOutputSchema,
  },
  {
    path: OPERATION_MARKET_COMPARE_PATH,
    route: MarketOperationCompareRoute,
    input: {
      operationRefs: [`operation:v1:${'a'.repeat(64)}`, `operation:v1:${'b'.repeat(64)}`],
    },
    outputSchema: operationCompareOutputSchema,
  },
  {
    path: OPERATION_MARKET_INSPECT_PLAN_PATH,
    route: MarketOperationInspectPlanRoute,
    input: { operationRefs: [`operation:v1:${'c'.repeat(64)}`], expiresInMs: 1_000 },
    outputSchema: operationInspectPlanOutputSchema,
  },
]

async function resolveAdvertisedRoute(route: AdvertisedRoute, state: DiscoverySourceState): Promise<boolean> {
  const parsed = new URL(route.url)
  const path = parsed.pathname
  const marketRoute = OPERATION_MARKET_ACTION_ENTRIES.find((entry) => entry.pathTemplate === path)

  if (marketRoute !== undefined) {
    return route.method === marketRoute.method && await resolveMarketOperationRoute(route)
  }

  if (path === '/') {
    return route.method === 'GET'
  }

  // Literal static GETs advertised by llms/sitemap. `/market`, `/about`,
  // `/terms`, and `/privacy` are static public routes (src/routes/*.tsx, no
  // `$slug` data dependency), so they cannot fall through to the business-catalog
  // pageMatch below — that lookup only resolves registered provider slugs.
  if (path === '/for-agents' || path === '/for-providers' || path === '/privacy/remove-business'
    || path === '/market' || path === '/about' || path === '/terms' || path === '/privacy') {
    return route.method === 'GET'
  }

  if (path === '/llms.txt') {
    return route.method === 'GET' && buildLlmsTxt(state, { canonicalBaseUrl: parsed.origin }).body.length > 0
  }

  if (path === '/sitemap.xml') {
    return route.method === 'GET' && buildSitemapXml(state, { canonicalBaseUrl: parsed.origin, now: 0 }).body.length > 0
  }

  if (path === '/robots.txt') {
    return route.method === 'GET' && handleRobotsTxtRequest(new Request(route.url)).status === 200
  }

  if (path === '/.well-known/ucp') {
    return route.method === 'GET' && handleSiteDiscoveryManifestRequest(new Request(route.url)).status === 200
  }

  if (path === '/api/businesses') {
    const body = listPublicBusinessOfferingSupply(state, {
      paginationOpts: { cursor: null, numItems: 20 },
    })
    return route.method === 'GET' && registryListAction.outputSchema.safeParse(body).success
  }

  const detailMatch = /^\/api\/businesses\/([^/]+)$/u.exec(path)
  if (detailMatch?.[1] !== undefined) {
    const body = getPublicBusinessOfferingSupplyBySlug(state, { slug: detailMatch[1] })
    return route.method === 'GET'
      && body.kind === 'found'
      && registryDetailAction.outputSchema.safeParse(body).success
  }

  const ucpMatch = /^\/([^/]+)\/ucp$/u.exec(path)
  if (ucpMatch?.[1] !== undefined) {
    return route.method === 'GET' && handleUcpManifestRequest(new Request(route.url), ucpMatch[1], state).status === 200
  }

  const pageMatch = /^\/([^/]+)$/u.exec(path)
  if (pageMatch?.[1] !== undefined) {
    return route.method === 'GET' && getPublicBusinessCatalog(state, {
      slug: brandNonEmpty(pageMatch[1], 'Slug'),
      indexStatus: 'indexed',
      discoveryStatus: 'available',
    }).kind === 'available'
  }

  return false
}

async function resolveMarketOperationRoute(route: AdvertisedRoute): Promise<boolean> {
  const path = new URL(route.url).pathname
  const routeCase = MARKET_OPERATION_ROUTE_CASES.find((candidate) => candidate.path === path)
  if (routeCase === undefined || route.method !== 'POST') return false

  const response = await routeHandler(routeCase.route, 'POST')({
    request: new Request(route.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(routeCase.input),
    }),
    params: {},
  })
  if (response.status !== 200) return false
  return routeCase.outputSchema.safeParse(await response.json()).success
}

function routeHandler(route: unknown, method: 'GET' | 'POST'): RouteHandler {
  if (!isRecord(route) || !isRecord(route.options) || !isRecord(route.options.server)) {
    throw new Error('Market operation route handlers are missing.')
  }
  const handlers = route.options.server.handlers
  if (!isRecord(handlers)) {
    throw new Error('Market operation route handlers are missing.')
  }
  const handler = handlers[method]
  if (!isRouteHandler(handler)) {
    throw new Error(`Market operation ${method} handler is missing.`)
  }
  return handler
}

function isRouteHandler(value: unknown): value is RouteHandler {
  return typeof value === 'function'
}

function installMarketOperationSource(): () => void {
  return setPublicSourceTransportForTests(createPublicSourceTransport({
    env: { CONVEX_URL: 'https://ae.test' },
    fetch: async (_input, init) => {
      const payload: unknown = JSON.parse(String(init?.body ?? '{}'))
      if (!isRecord(payload) || typeof payload.path !== 'string') {
        throw new Error('market_operation_source_request_invalid')
      }
      switch (payload.path) {
        case 'rateLimit:admitHttp':
          return Response.json({ status: 'success', value: { ok: true } })
        case 'capabilitySupplyOperations:search':
          return Response.json({
            status: 'success',
            value: {
              kind: 'no_candidates',
              schemaVersion: 'registry-operations:v1',
              query: 'reference lookup',
              appliedFilters: {},
              matchedCount: 0,
              ranking: [],
              navigation: [],
            },
          })
        case 'capabilitySupplyOperations:detail':
          return Response.json({
            status: 'success',
            value: {
              kind: 'found',
              schemaVersion: 'registry-operations:v1',
              operation: MARKET_OPERATION_DETAIL_WIRE_DESCRIPTOR,
            },
          })
        case 'capabilitySupplyOperations:compare':
          return Response.json({
            status: 'success',
            value: {
              kind: 'unavailable',
              schemaVersion: 'registry-operations:v1',
              reason: 'operation_not_found',
              navigation: [],
            },
          })
        case 'capabilitySupplyOperations:inspectPlan':
          return Response.json({
            status: 'success',
            value: {
              kind: 'unavailable',
              schemaVersion: 'registry-operations:v1',
              reason: 'mapping_unavailable',
              navigation: [],
            },
          })
        default:
          throw new Error(`market_operation_source_unconfigured:${payload.path}`)
      }
    },
  }))
}

function sitemapLocs(body: string): readonly string[] {
  return Array.from(body.matchAll(/<loc>([^<]+)<\/loc>/gu), (match) => match[1] ?? '')
    .filter((url) => url.length > 0)
}

function uniqueRoutes(routes: readonly AdvertisedRoute[]): readonly AdvertisedRoute[] {
  const seen = new Set<string>()
  return routes.filter((route) => {
    const key = `${route.method} ${route.url}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}




function suppressFirstBusiness(state: DiscoverySourceState): void {
  const business = state.businesses.at(0)
  if (business === undefined) {
    throw new Error('Expected a business to suppress.')
  }

  business.publicStatus = 'suppressed'
  business.suppressedAt = 12_000
}
