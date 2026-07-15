import { createFileRoute } from '@tanstack/react-router'

import {
  handleSandboxRouteProviderRequest,
  readSandboxRouteProviderDiscovery,
} from '@/lib/server/sandbox-capability-provider'

export const Route = createFileRoute('/api/sandbox/providers/route-resolver')({
  server: {
    handlers: {
      GET: ({ request }) => readSandboxRouteProviderDiscovery('resolver', request),
      POST: ({ request }) => handleSandboxRouteProviderRequest('resolver', request),
    },
  },
})
