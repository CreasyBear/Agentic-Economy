import { buildProblem } from '@/lib/errors'

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
  const details = buildProblem({
    status: 410,
    kind: 'NOT_FOUND',
    code: 'routing_v1_retired',
    extras: { requestApi: '/api/v1/requests' },
  })
  return new Response(JSON.stringify(details), {
    status: details.status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/problem+json',
    },
  })
}
