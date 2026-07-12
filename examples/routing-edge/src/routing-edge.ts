import { createRoutingEdgeEnvelope } from '../../../src/modules/routing-kernel/routing-edge-envelope'

const MAX_BODY_BYTES = 64 * 1024
const UPSTREAM_TIMEOUT_MS = 30_000
const descriptorPath = '/.well-known/ae-routing.json'
const topologyPath = '/.well-known/ae-routing-topology.json'
const postPaths = new Set(['/v1/route', '/v1/authorize', '/v1/execute', '/v1/reconcile', '/v1/inspect', '/v1/cancel', '/mcp'])

type RoutingEdgeEnv = Readonly<Record<'AE_ROUTING_ORIGIN' | 'AE_EDGE_ENVIRONMENT' | 'AE_EDGE_SOURCE_REVISION' | 'AE_EDGE_ORIGIN_HMAC_KEY', string>>
type EdgeFetcher = (request: Request) => Promise<Response>

export async function handleRoutingEdgeRequest(
  request: Request,
  env: RoutingEdgeEnv,
  fetcher: EdgeFetcher = fetch,
): Promise<Response> {
  const startedAt = Date.now()
  const requestId = request.headers.get('CF-Ray') ?? crypto.randomUUID()
  const url = new URL(request.url)
  if (url.pathname === topologyPath && request.method === 'GET') return topologyResponse(url, env, requestId)
  const methodAllowed = (url.pathname === descriptorPath && request.method === 'GET')
    || (postPaths.has(url.pathname) && request.method === 'POST')
  if (!methodAllowed) return edgeError(requestId, url.pathname === descriptorPath || postPaths.has(url.pathname) ? 405 : 404, url.pathname === descriptorPath || postPaths.has(url.pathname) ? 'method_not_allowed' : 'route_not_found')

  let origin: URL
  try { origin = new URL(env.AE_ROUTING_ORIGIN) } catch { return edgeError(requestId, 500, 'edge_configuration_invalid') }
  if (origin.protocol !== 'https:' || origin.pathname !== '/') return edgeError(requestId, 500, 'edge_configuration_invalid')

  const body = request.method === 'POST' ? await readBoundedBody(request, MAX_BODY_BYTES) : { ok: true as const, bytes: undefined }
  if (!body.ok) return edgeError(requestId, 413, 'payload_too_large')

  const observedAt = Date.now()
  const headers = new Headers(request.headers)
  headers.set('X-AE-Edge-Authority', url.host)
  headers.set('X-AE-Edge-Environment', env.AE_EDGE_ENVIRONMENT)
  headers.set('X-AE-Edge-Request-Id', requestId)
  headers.set('X-AE-Edge-Source-Revision', env.AE_EDGE_SOURCE_REVISION)
  headers.set('X-AE-Edge-Timestamp', String(observedAt))
  const envelope = await createRoutingEdgeEnvelope({
    key: env.AE_EDGE_ORIGIN_HMAC_KEY,
    method: request.method,
    path: url.pathname,
    authority: url.host,
    contentDigest: headers.get('Content-Digest') ?? '',
    requestId,
    timestamp: observedAt,
  })
  headers.set('X-AE-Edge-Signature', envelope.signature)
  headers.delete('Host')
  headers.delete('Content-Length')

  const upstreamUrl = new URL(url.pathname, origin)
  try {
    const upstream = await fetcher(new Request(upstreamUrl, {
      method: request.method,
      headers,
      ...(body.bytes === undefined ? {} : { body: new Uint8Array(body.bytes).buffer }),
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    }))
    return projectResponse(upstream, requestId, Date.now() - startedAt)
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === 'TimeoutError'
    console.error(JSON.stringify({ event: 'routing_edge_upstream_failed', requestId, timeout, environment: env.AE_EDGE_ENVIRONMENT }))
    return edgeError(requestId, timeout ? 504 : 502, timeout ? 'origin_timeout' : 'origin_unavailable')
  }
}

function topologyResponse(url: URL, env: RoutingEdgeEnv, requestId: string): Response {
  return Response.json({
    schemaVersion: 'ae-routing-topology:v1',
    environment: env.AE_EDGE_ENVIRONMENT,
    sourceRevision: env.AE_EDGE_SOURCE_REVISION,
    edge: { authority: url.host, state: 'stateless', requestId },
    canonicalAuthority: { runtime: 'convex', origin: env.AE_ROUTING_ORIGIN },
    admission: { authority: 'convex', contract: 'transactional-fixed-window-and-lease:v1' },
    telemetry: { protocolRecordsSeparated: true, providerWaitSeparated: true, retentionDays: 7 },
  }, { headers: { 'Cache-Control': 'no-store', 'X-AE-Edge-Request-Id': requestId } })
}

async function readBoundedBody(request: Request, maximumBytes: number): Promise<{ ok: true; bytes: Uint8Array } | { ok: false }> {
  const declaredLength = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) return { ok: false }
  if (request.body === null) return { ok: true, bytes: new Uint8Array() }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    length += next.value.byteLength
    if (length > maximumBytes) {
      await reader.cancel()
      return { ok: false }
    }
    chunks.push(next.value)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return { ok: true, bytes }
}

function projectResponse(upstream: Response, requestId: string, edgeDurationMs: number): Response {
  const headers = new Headers(upstream.headers)
  headers.set('X-AE-Edge-Request-Id', requestId)
  headers.set('Server-Timing', `ae-edge;dur=${Math.max(0, edgeDurationMs)}`)
  headers.set('Cache-Control', 'no-store')
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers })
}

function edgeError(requestId: string, status: number, code: string): Response {
  return Response.json({ protocolVersion: 'ae-routing:v1', edge: { requestId }, error: { code, retryable: status >= 500 } }, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-AE-Edge-Request-Id': requestId },
  })
}
