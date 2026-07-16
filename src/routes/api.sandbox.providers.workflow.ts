import { createFileRoute } from '@tanstack/react-router'

import {
  handleSandboxWorkflowProviderRequest,
  readSandboxWorkflowProviderDiscovery,
} from '@/lib/server/sandbox-capability-provider'

export const Route = createFileRoute('/api/sandbox/providers/workflow')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const providerKey = new URL(request.url).searchParams.get('provider') ?? ''
        return readSandboxWorkflowProviderDiscovery(providerKey, request)
      },
      POST: ({ request }) => {
        const providerKey = new URL(request.url).searchParams.get('provider') ?? ''
        return handleSandboxWorkflowProviderRequest(providerKey, request)
      },
    },
  },
})
