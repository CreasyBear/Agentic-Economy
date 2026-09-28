import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { buildDeveloperDiscoveryRouteSnapshot } from '@/modules/discovery/developer-discovery-route'
import { readDirectoryFreshnessField, type X402DirectoryFreshnessField } from '@/modules/market/x402-directory-index.server'
import {
  generateDeveloperDiscoverySchema,
  recordDeveloperDiscoveryFetch,
} from '@/modules/discovery/developer-discovery'
import type {
  DeveloperDiscoveryArtifact,
  DeveloperDiscoveryFetchKind,
  DeveloperDiscoveryFetchReadback,
  DeveloperDiscoveryFetchStatus,
  ReadDeveloperDiscoveryRouteOptions,
} from '@/modules/discovery/developer-discovery'
import type { DiscoverySourceState } from '@/modules/discovery/public'

export const Route = createFileRoute('/api/discovery/schema')({
  server: {
    handlers: {
      GET: ({ request }) => handleDeveloperDiscoverySchemaRequest(request),
      POST: () => methodNotAllowed(['GET']),
      PUT: () => methodNotAllowed(['GET']),
      PATCH: () => methodNotAllowed(['GET']),
      DELETE: () => methodNotAllowed(['GET']),
      HEAD: () => methodNotAllowed(['GET']),
      OPTIONS: () => methodNotAllowed(['GET']),
      TRACE: () => methodNotAllowed(['GET']),
      CONNECT: () => methodNotAllowed(['GET']),
    },
  },
})

export async function handleDeveloperDiscoverySchemaRequest(
  request: Request,
  state?: DiscoverySourceState,
  options: ReadDeveloperDiscoveryRouteOptions = {}
): Promise<Response> {
  return await withHttpRateLimit(request, 'public-read', async () => {
  const routeOptions = await readDeveloperDiscoveryRuntimeOptions(request, state, options)
  const artifact = generateDeveloperDiscoverySchema(state, routeOptions)
  const fetchReadback = readDeveloperDiscoveryFetchReadback('schema', '/api/discovery/schema', artifact, routeOptions.now ?? 0)

  return developerDiscoveryJsonResponse(await withDirectoryFreshness(artifact), fetchReadback)
  })
}

/**
 * Fix for swarm row 21: this route (and `/api/discovery/examples`) used to emit
 * a zero-valued `generatedAt` alongside a hardcoded always-current `freshness`
 * reading - a contradiction, since a real-current readback cannot have been
 * generated at the epoch. Both now carry the x402 directory's own completion
 * time and the same `freshness` shape `/api/v1/registry` reports, replacing
 * that hardcoded literal.
 */
export async function withDirectoryFreshness(
  artifact: DeveloperDiscoveryArtifact
): Promise<Omit<DeveloperDiscoveryArtifact, 'freshness'> & { freshness: X402DirectoryFreshnessField }> {
  const freshness = await readDirectoryFreshnessField()
  const { freshness: _priorFreshness, ...rest } = artifact
  return { ...rest, generatedAt: freshness.completedAt ?? artifact.generatedAt, freshness }
}

export function developerDiscoveryJsonResponse(
  body: Omit<DeveloperDiscoveryArtifact, 'freshness'> & { freshness: X402DirectoryFreshnessField },
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
  const canonicalBaseUrl = options.canonicalBaseUrl ?? resolveCanonicalBaseUrl(request).baseUrl
  return {
    ...options,
    canonicalBaseUrl,
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

function fetchStatusForArtifact(artifact: DeveloperDiscoveryArtifact): DeveloperDiscoveryFetchStatus {
  if (artifact.state === 'available') {
    return 'successful'
  }

  if (artifact.state === 'degraded') {
    return 'stale'
  }

  return artifact.parityStatus === 'withheld' ? 'invalid' : 'not_found'
}
