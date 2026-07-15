import { httpRouter } from 'convex/server'

import { routingV1RetiredResponse } from '@/modules/routing-kernel/retirement'
import {
  handleSandboxRouteProviderRequest,
  readSandboxRouteProviderDiscovery,
} from '@/lib/server/sandbox-capability-provider'

import { httpAction } from './_generated/server'

const http = httpRouter()
const sandboxRouteProviders = [
  ['resolver', '/api/sandbox/providers/route-resolver'],
  ['quoter', '/api/sandbox/providers/route-quoter'],
] as const

for (const [routeKey, path] of sandboxRouteProviders) {
  http.route({
    path,
    method: 'GET',
    handler: httpAction(async (_ctx, request) => readSandboxRouteProviderDiscovery(routeKey, request)),
  })
  http.route({
    path,
    method: 'POST',
    handler: httpAction(async (_ctx, request) => handleSandboxRouteProviderRequest(routeKey, request)),
  })
}
const retiredPostPaths = [
  '/v1/route',
  '/v1/authorize',
  '/v1/execute',
  '/v1/reconcile',
  '/v1/inspect',
  '/v1/cancel',
] as const

for (const path of retiredPostPaths) {
  http.route({ path, method: 'POST', handler: httpAction(async () => routingV1RetiredResponse()) })
}

http.route({ path: '/mcp', method: 'POST', handler: httpAction(async () => routingV1RetiredResponse()) })
http.route({ path: '/mcp', method: 'GET', handler: httpAction(async () => routingV1RetiredResponse()) })
http.route({
  path: '/.well-known/ae-routing.json',
  method: 'GET',
  handler: httpAction(async () => routingV1RetiredResponse()),
})

export default http
