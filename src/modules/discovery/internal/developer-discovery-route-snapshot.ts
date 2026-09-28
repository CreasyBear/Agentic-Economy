import { degrade } from '@/lib/observability/degrade'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { readDeveloperDiscoveryRoute } from '@/modules/discovery/developer-discovery'
import type {
  DeveloperDiscoveryRouteExecution,
  DeveloperDiscoveryRouteHealthErrorCode,
  DeveloperDiscoveryRouteSnapshot,
  DeveloperDiscoveryRouteSnapshotResponse,
  ReadDeveloperDiscoveryRouteOptions,
} from '@/modules/discovery/developer-discovery'
import type {
  PublicBusinessCatalogApiV2Page,
  PublicBusinessCatalogApiV2SearchPage,
  PublicBusinessCatalogV2DetailResult,
} from '@/modules/registry/public'
import { handleDurableBusinessDetailRequest } from '@/routes/api.businesses.$slug'
import { handleDurableListBusinessesRequest } from '@/routes/api.businesses'
import { handleDurableSearchBusinessesRequest } from '@/routes/api.businesses.search'
import { handleDurableUcpManifestRequest } from '@/routes/$slug.ucp'
import { handleDurableLlmsTxtRequest } from '@/routes/llms[.]txt'
import { handleRobotsTxtRequest } from '@/routes/robots[.]txt'
import { handleDurableSitemapXmlRequest } from '@/routes/sitemap[.]xml'

export async function loadDeveloperDiscoveryRoute(
  request: Request,
  now = 0,
) {
  const canonicalBaseUrl = resolveCanonicalBaseUrl(request).baseUrl
  const routeSnapshot = await buildDeveloperDiscoveryRouteSnapshot(request, { canonicalBaseUrl, now })
  const readback = readDeveloperDiscoveryRoute(undefined, { canonicalBaseUrl, now, routeSnapshot })

  return {
    ...readback,
    artifacts: readback.artifacts.map((artifact) => ({ ...artifact, checkedAt: readback.generatedAt })),
    copy: {
      ...readback.copy,
      title: 'Discovery status',
    },
  }
}

export async function buildDeveloperDiscoveryRouteSnapshot(
  request: Request,
  options: ReadDeveloperDiscoveryRouteOptions = {}
): Promise<DeveloperDiscoveryRouteSnapshot> {
  const origin = options.canonicalBaseUrl ?? resolveCanonicalBaseUrl(request).baseUrl
  const checkedAt = options.now ?? 0
  const listRoute = `${origin}/api/businesses`
  const list = await executeJsonRoute<PublicBusinessCatalogApiV2Page>({
    route: listRoute,
    label: 'Public catalog list JSON',
    checkedAt,
    expectedSchemaVersion: 'public-business-catalog-api:v2',
    run: () => handleDurableListBusinessesRequest(new Request(listRoute)),
  })
  const firstCatalog = list.body?.kind === 'ok' && Array.isArray(list.body.page)
    ? list.body.page[0]
    : undefined
  const searchQuery = firstCatalog?.category ?? firstCatalog?.name ?? ''
  const searchRoute = `${origin}/api/businesses/search?q=${encodeURIComponent(searchQuery)}`
  const search = await executeJsonRoute<PublicBusinessCatalogApiV2SearchPage>({
    route: searchRoute,
    label: 'Public catalog search JSON',
    checkedAt,
    expectedSchemaVersion: 'public-business-catalog-api:v2',
    run: () => handleDurableSearchBusinessesRequest(new Request(searchRoute)),
  })
  const detail =
    firstCatalog === undefined
      ? unavailableJsonRoute<PublicBusinessCatalogV2DetailResult>({
          route: `${origin}/api/businesses/{slug}`,
          label: 'Public catalog detail JSON',
          checkedAt,
          reason: 'No public slug was returned by /api/businesses.',
        })
      : await executeJsonRoute<PublicBusinessCatalogV2DetailResult>({
          route: `${origin}/api/businesses/${encodeURIComponent(firstCatalog.slug)}`,
          label: 'Public catalog detail JSON',
          checkedAt,
          expectedSchemaVersion: 'public-business-catalog-api:v2',
          run: () => handleDurableBusinessDetailRequest(firstCatalog.slug),
        })
  const missingDetail = await executeJsonRoute<PublicBusinessCatalogV2DetailResult>({
    route: `${origin}/api/businesses/__missing_discovery_slug__`,
    label: 'Public catalog missing detail JSON',
    checkedAt,
    run: () => handleDurableBusinessDetailRequest('__missing_discovery_slug__'),
  })
  const ucp =
    firstCatalog === undefined
      ? unavailableJsonRoute<unknown>({
          route: `${origin}/{slug}/ucp`,
          label: 'AE-hosted UCP manifest',
          checkedAt,
          reason: 'No public slug was returned by /api/businesses.',
        })
      : await executeJsonRoute<unknown>({
          route: `${origin}/${encodeURIComponent(firstCatalog.slug)}/ucp`,
          label: 'AE-hosted UCP manifest',
          checkedAt,
          expectedSchemaVersion: 'ae-ucp:v2',
          run: () => handleDurableUcpManifestRequest(new Request(`${origin}/${firstCatalog.slug}/ucp`), firstCatalog.slug),
        })
  const [llms, sitemap, robots] = await Promise.all([
    executeTextRoute({
      route: `${origin}/llms.txt`,
      label: 'LLMs text discovery file',
      checkedAt,
      run: () => handleDurableLlmsTxtRequest(new Request(`${origin}/llms.txt`)),
    }),
    executeTextRoute({
      route: `${origin}/sitemap.xml`,
      label: 'Sitemap discovery file',
      checkedAt,
      run: () => handleDurableSitemapXmlRequest(new Request(`${origin}/sitemap.xml`)),
    }),
    executeTextRoute({
      route: `${origin}/robots.txt`,
      label: 'Robots discovery file',
      checkedAt,
      run: () => handleRobotsTxtRequest(new Request(`${origin}/robots.txt`)),
    }),
  ])

  return {
    list,
    search,
    detail,
    missingDetail,
    routeExecutions: [list, search, detail, ucp, llms, sitemap, robots],
  }
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
    const body = (await response.json()) as Body
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
  } catch (cause) {
    return degrade(cause, routeOutage(input.route, input.label, input.checkedAt), {
      site: 'executeDiscoveryJsonRoute',
      reason: 'source_unavailable',
    })
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
    await response.text()
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
  } catch (cause) {
    return degrade(cause, routeOutage(input.route, input.label, input.checkedAt), {
      site: 'executeDiscoveryTextRoute',
      reason: 'source_unavailable',
    })
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
