import { createFileRoute } from '@tanstack/react-router'

import {
  handleSandboxRouteProviderRequest,
  readSandboxRouteProviderDiscovery,
} from '@/lib/server/sandbox-capability-provider'

export const Route = createFileRoute('/api/sandbox/providers/route-quoter')({
  server: {
    handlers: {
      GET: ({ request }) => readSandboxRouteProviderDiscovery('quoter', request),
      POST: ({ request }) => handleSandboxRouteProviderRequest('quoter', request),
    },
  },
})
