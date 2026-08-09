import { problem } from '@/lib/server/problem'

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
  return problem({
    status: 410,
    kind: 'NOT_FOUND',
    code: 'routing_v1_retired',
    extras: { requestApi: '/api/v1/requests' },
  })
}
