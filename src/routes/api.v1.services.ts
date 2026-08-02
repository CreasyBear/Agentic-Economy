import { createFileRoute } from '@tanstack/react-router'

import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { registryServicesListAction } from '@/modules/registry/registry.actions'
import { runRegistryListRequest } from './api.businesses'


export const Route = createFileRoute('/api/v1/services')({
  server: {
    handlers: {
      GET: ({ request }) => withHttpRateLimit(request, 'public-read', () => handleDurableListServicesRequest(request)),
    },
  },
})

export async function handleDurableListServicesRequest(request: Request): Promise<Response> {
  return runRegistryListRequest(request, { collection: 'services', action: registryServicesListAction })
}
