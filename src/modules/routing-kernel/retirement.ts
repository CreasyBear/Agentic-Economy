export const ROUTING_V1_RETIRED_PATHS = [
  '/v1/route',
  '/v1/authorize',
  '/v1/execute',
  '/v1/reconcile',
  '/v1/inspect',
  '/v1/cancel',
  '/mcp',
  '/.well-known/ae-routing.json',
  '/.well-known/ae-routing-topology.json',
] as const

export function routingV1RetiredResponse(): Response {
  return Response.json({
    error: {
      code: 'routing_v1_retired',
      requestApi: '/api/v1/requests',
    },
  }, {
    status: 410,
    headers: { 'Cache-Control': 'no-store' },
  })
}
