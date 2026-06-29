import { createFileRoute } from '@tanstack/react-router'

import { createDefaultDiscoverySourceState } from '@/modules/discovery/public'
import {
  generateDeveloperDiscoverySchema,
  recordDeveloperDiscoveryFetch,
} from '@/modules/discovery/developer-discovery'
import type {
  DeveloperDiscoveryArtifact,
  DeveloperDiscoveryFetchKind,
  DeveloperDiscoveryFetchReadback,
  DeveloperDiscoveryFetchStatus,
  DeveloperDiscoveryRouteExecution,
  DeveloperDiscoveryRouteHealthErrorCode,
  DeveloperDiscoveryRouteSnapshot,
  DeveloperDiscoveryRouteSnapshotResponse,
  ReadDeveloperDiscoveryRouteOptions,
} from '@/modules/discovery/developer-discovery'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import type { PublicBusinessCatalogApiPage, PublicBusinessCatalogDetailResult } from '@/modules/registry/public'
import { handleDurableBusinessDetailRequest } from './api.businesses.$slug'
import { handleDurableListBusinessesRequest } from './api.businesses'
import { handleDurableSearchBusinessesRequest } from './api.businesses.search'
import { handleDurableUcpManifestRequest } from './$slug.ucp'
import { handleDurableLlmsTxtRequest } from './llms[.]txt'
import { handleRobotsTxtRequest } from './robots[.]txt'
import { handleDurableSitemapXmlRequest } from './sitemap[.]xml'

export const Route = createFileRoute('/api/discovery/schema')({
  server: {
    handlers: {
      GET: ({ request }) => handleDeveloperDiscoverySchemaRequest(request),
    },
  },
})

export async function handleDeveloperDiscoverySchemaRequest(
  request: Request,
  state?: DiscoverySourceState,
  options: ReadDeveloperDiscoveryRouteOptions = {}
): Promise<Response> {
  const routeOptions = await readDeveloperDiscoveryRuntimeOptions(request, state, options)
  const artifact = generateDeveloperDiscoverySchema(state ?? createDefaultDiscoverySourceState(), routeOptions)
  const fetchReadback = readDeveloperDiscoveryFetchReadback('schema', '/api/discovery/schema', artifact, routeOptions.now ?? 0)

  return developerDiscoveryJsonResponse(artifact, fetchReadback)
}

export function developerDiscoveryJsonResponse(
  body: DeveloperDiscoveryArtifact,
  fetchReadback: DeveloperDiscoveryFetchReadback,
  init: ResponseInit = {}
): Response {
  const headers = new Headers(init.headers)
  headers.set('Cache-Control', headers.get('Cache-Control') ?? 'public, max-age=60, stale-while-revalidate=300')
  headers.set('Access-Control-Allow-Origin', headers.get('Access-Control-Allow-Origin') ?? '*')
  headers.set('X-Content-Type-Options', headers.get('X-Content-Type-Options') ?? 'nosniff')
  headers.set('X-AE-Discovery-Schema-Version', fetchReadback.telemetry.schemaVersion)
  headers.set('X-AE-Discovery-Cache-Version', fetchReadback.telemetry.cacheVersion)
  headers.set('X-AE-Discovery-Fetch-Status', fetchReadback.telemetry.status)
  headers.set('X-AE-Discovery-Operator-State', fetchReadback.operatorState)
  headers.set('X-AE-Required-Funnel-Event', fetchReadback.requiredFunnelEvent)

  return Response.json(body, { ...init, headers })
}

export function readDeveloperDiscoveryRequestOptions(
  request: Request,
  options: ReadDeveloperDiscoveryRouteOptions = {}
): ReadDeveloperDiscoveryRouteOptions {
  return {
    ...options,
    canonicalBaseUrl: options.canonicalBaseUrl ?? requestOrigin(request),
    now: options.now ?? 0,
  }
}

export async function readDeveloperDiscoveryRuntimeOptions(
  request: Request,
  state: DiscoverySourceState | undefined,
  options: ReadDeveloperDiscoveryRouteOptions = {}
): Promise<ReadDeveloperDiscoveryRouteOptions> {
  const routeOptions = readDeveloperDiscoveryRequestOptions(request, options)
  if (state !== undefined || routeOptions.routeSnapshot !== undefined) {
    return routeOptions
  }

  return {
    ...routeOptions,
    routeSnapshot: await buildDeveloperDiscoveryRouteSnapshot(request, routeOptions),
  }
}

export async function buildDeveloperDiscoveryRouteSnapshot(
  request: Request,
  options: ReadDeveloperDiscoveryRouteOptions = {}
): Promise<DeveloperDiscoveryRouteSnapshot> {
  const origin = options.canonicalBaseUrl ?? requestOrigin(request)
  const checkedAt = options.now ?? 0
  const listRoute = `${origin}/api/businesses`
  const list = await executeJsonRoute<PublicBusinessCatalogApiPage>({
    route: listRoute,
    label: 'Public catalog list JSON',
    checkedAt,
    expectedSchemaVersion: 'public-business-catalog-api:v1',
    run: () => handleDurableListBusinessesRequest(new Request(listRoute)),
  })
  const firstCatalog = list.body?.kind === 'ok' ? list.body.items.at(0) : undefined
  const searchQuery = firstCatalog?.category ?? firstCatalog?.name ?? ''
  const searchRoute = `${origin}/api/businesses/search?q=${encodeURIComponent(searchQuery)}`
  const search = await executeJsonRoute<PublicBusinessCatalogApiPage>({
    route: searchRoute,
    label: 'Public catalog search JSON',
    checkedAt,
    expectedSchemaVersion: 'public-business-catalog-api:v1',
    run: () => handleDurableSearchBusinessesRequest(new Request(searchRoute)),
  })
  const detail =
    firstCatalog === undefined
      ? unavailableJsonRoute<PublicBusinessCatalogDetailResult>({
          route: `${origin}/api/businesses/{slug}`,
          label: 'Public catalog detail JSON',
          checkedAt,
          reason: 'No public slug was returned by /api/businesses.',
        })
      : await executeJsonRoute<PublicBusinessCatalogDetailResult>({
          route: `${origin}/api/businesses/${encodeURIComponent(firstCatalog.slug)}`,
          label: 'Public catalog detail JSON',
          checkedAt,
          expectedSchemaVersion: 'public-business-catalog-api:v1',
          run: () => handleDurableBusinessDetailRequest(firstCatalog.slug),
        })
  const missingDetail = await executeJsonRoute<PublicBusinessCatalogDetailResult>({
    route: `${origin}/api/businesses/__missing_discovery_slug__`,
    label: 'Public catalog missing detail JSON',
    checkedAt,
    run: () => handleDurableBusinessDetailRequest('__missing_discovery_slug__'),
  })
  const ucp =
    firstCatalog === undefined
      ? unavailableJsonRoute<unknown>({
          route: `${origin}/{slug}/ucp`,
          label: 'AE-hosted UCP fallback',
          checkedAt,
          reason: 'No public slug was returned by /api/businesses.',
        })
      : await executeJsonRoute<unknown>({
          route: `${origin}/${encodeURIComponent(firstCatalog.slug)}/ucp`,
          label: 'AE-hosted UCP fallback',
          checkedAt,
          expectedSchemaVersion: 'ae-ucp-fallback:v1',
          run: () => handleDurableUcpManifestRequest(new Request(`${origin}/${firstCatalog.slug}/ucp`), firstCatalog.slug),
        })
  const llms = await executeTextRoute({
    route: `${origin}/llms.txt`,
    label: 'LLMs text discovery file',
    checkedAt,
    run: () => handleDurableLlmsTxtRequest(new Request(`${origin}/llms.txt`)),
  })
  const sitemap = await executeTextRoute({
    route: `${origin}/sitemap.xml`,
    label: 'Sitemap discovery file',
    checkedAt,
    run: () => handleDurableSitemapXmlRequest(new Request(`${origin}/sitemap.xml`)),
  })
  const robots = await executeTextRoute({
    route: `${origin}/robots.txt`,
    label: 'Robots discovery file',
    checkedAt,
    run: () => handleRobotsTxtRequest(new Request(`${origin}/robots.txt`)),
  })

  return {
    list,
    search,
    detail,
    missingDetail,
    routeExecutions: [list, search, detail, ucp, llms, sitemap, robots],
  }
}

export function readDeveloperDiscoveryFetchReadback(
  kind: DeveloperDiscoveryFetchKind,
  route: string,
  artifact: DeveloperDiscoveryArtifact,
  timestamp: number
): DeveloperDiscoveryFetchReadback {
  const status = fetchStatusForArtifact(artifact)

  return recordDeveloperDiscoveryFetch({
    kind,
    route,
    status,
    freshness: artifact.freshness.state,
    ...(status === 'successful' ? {} : { errorCode: `developer_discovery_${status}` }),
    botClass: 'human',
    timestamp,
  })
}

export function requestOrigin(request: Request): string {
  try {
    return new URL(request.url).origin
  } catch {
    return 'https://ae.example'
  }
}

function fetchStatusForArtifact(artifact: DeveloperDiscoveryArtifact): DeveloperDiscoveryFetchStatus {
  if (artifact.state === 'available') {
    return 'successful'
  }

  if (artifact.state === 'degraded') {
    return 'stale'
  }

  return artifact.parityStatus === 'withheld' ? 'invalid' : 'not_found'
}

async function executeJsonRoute<Body>(input: {
  route: string
  label: string
  checkedAt: number
  expectedSchemaVersion?: string
  run: () => Promise<Response> | Response
}): Promise<DeveloperDiscoveryRouteSnapshotResponse<Body>> {
  try {
    const response = await input.run()
    const body = (await response.json().catch(() => undefined)) as Body | undefined
    const schemaVersion = readRouteSchemaVersion(body)
    const errorCode = routeErrorCode(response, schemaVersion, input.expectedSchemaVersion)
    const cacheControl = response.headers.get('Cache-Control') ?? undefined

    return {
      route: input.route,
      label: input.label,
      ok: response.ok && errorCode === undefined,
      checkedAt: input.checkedAt,
      httpStatus: response.status,
      ...(cacheControl === undefined ? {} : { cacheControl }),
      ...(schemaVersion === undefined ? {} : { schemaVersion }),
      ...(input.expectedSchemaVersion === undefined ? {} : { expectedSchemaVersion: input.expectedSchemaVersion }),
      ...(errorCode === undefined ? {} : { errorCode }),
      ...(body === undefined ? {} : { body }),
    }
  } catch {
    return routeOutage(input.route, input.label, input.checkedAt)
  }
}

async function executeTextRoute(input: {
  route: string
  label: string
  checkedAt: number
  run: () => Promise<Response> | Response
}): Promise<DeveloperDiscoveryRouteExecution> {
  try {
    const response = await input.run()
    await response.text().catch(() => '')
    const cacheControl = response.headers.get('Cache-Control') ?? undefined
    return {
      route: input.route,
      label: input.label,
      ok: response.ok,
      checkedAt: input.checkedAt,
      httpStatus: response.status,
      ...(cacheControl === undefined ? {} : { cacheControl }),
      ...(response.ok ? {} : { errorCode: response.status === 404 ? 'not_found' : 'route_outage' }),
    }
  } catch {
    return routeOutage(input.route, input.label, input.checkedAt)
  }
}

function unavailableJsonRoute<Body>(input: {
  route: string
  label: string
  checkedAt: number
  reason: string
}): DeveloperDiscoveryRouteSnapshotResponse<Body> {
  return {
    route: input.route,
    label: input.label,
    ok: false,
    checkedAt: input.checkedAt,
    httpStatus: 404,
    errorCode: 'unavailable',
    reason: input.reason,
  }
}

function routeOutage(route: string, label: string, checkedAt: number): DeveloperDiscoveryRouteExecution {
  return {
    route,
    label,
    ok: false,
    checkedAt,
    errorCode: 'route_outage',
    reason: 'Route handler could not be read back.',
  }
}

function routeErrorCode(
  response: Response,
  schemaVersion: string | undefined,
  expectedSchemaVersion: string | undefined
): DeveloperDiscoveryRouteHealthErrorCode | undefined {
  if (!response.ok) {
    return response.status === 404 ? 'not_found' : 'route_outage'
  }

  if (expectedSchemaVersion !== undefined && schemaVersion !== expectedSchemaVersion) {
    return 'schema_version_mismatch'
  }

  return undefined
}

function readRouteSchemaVersion(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('schemaVersion' in body)) {
    return undefined
  }

  const value = (body as { schemaVersion?: unknown }).schemaVersion
  return typeof value === 'string' ? value : undefined
}
