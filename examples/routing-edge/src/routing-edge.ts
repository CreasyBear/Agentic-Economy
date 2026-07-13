import { ROUTING_V1_RETIRED_PATHS, routingV1RetiredResponse } from '../../../src/modules/routing-kernel/retirement'

type RoutingEdgeEnv = Readonly<Record<'AE_ROUTING_ORIGIN' | 'AE_EDGE_ENVIRONMENT' | 'AE_EDGE_SOURCE_REVISION' | 'AE_EDGE_ORIGIN_HMAC_KEY', string>>
type EdgeFetcher = (request: Request) => Promise<Response>

const retiredPaths = new Set<string>(ROUTING_V1_RETIRED_PATHS)

export async function handleRoutingEdgeRequest(
  request: Request,
  _env: RoutingEdgeEnv,
  _fetcher: EdgeFetcher = fetch,
): Promise<Response> {
  const path = new URL(request.url).pathname
  return retiredPaths.has(path) ? routingV1RetiredResponse() : new Response(null, { status: 404 })
}
