import { createFileRoute } from '@tanstack/react-router'

import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { defineRouteHandlers } from '@/lib/server/gateway-json-route'
import { registryServicesListAction } from '@/modules/registry/registry.actions'
import { runRegistryListRequest } from './api.businesses'

export const Route = createFileRoute('/api/v1/businesses')({
  server: {
    handlers: defineRouteHandlers({
      GET: ({ request }) => withHttpRateLimit(request, 'public-read', () => handleDurableListServicesRequest(request)),
    }),
  },
})

export async function handleDurableListServicesRequest(request: Request): Promise<Response> {
  return runRegistryListRequest(request, { collection: 'services', action: registryServicesListAction })
}
