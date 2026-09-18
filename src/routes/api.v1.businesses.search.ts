import { createFileRoute } from '@tanstack/react-router'

import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { defineRouteHandlers } from '@/lib/server/gateway-json-route'
import { registryServicesSearchAction } from '@/modules/registry/registry.actions'
import { runRegistrySearchRequest } from './api.businesses'

export const Route = createFileRoute('/api/v1/businesses/search')({
  server: {
    handlers: defineRouteHandlers({
      GET: ({ request }) => withHttpRateLimit(request, 'public-read', () => handleDurableSearchServicesRequest(request)),
    }),
  },
})

export async function handleDurableSearchServicesRequest(request: Request): Promise<Response> {
  return runRegistrySearchRequest(request, registryServicesSearchAction)
}
