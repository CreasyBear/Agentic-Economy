import { createFileRoute } from '@tanstack/react-router'

import {
  handleSandboxWorkflowProviderRequest,
  readSandboxWorkflowProviderDiscovery,
} from '@/lib/server/sandbox-capability-provider'
import { methodNotAllowed } from '@/lib/server/method-guard'

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
      PUT: () => methodNotAllowed(['GET', 'POST']),
      PATCH: () => methodNotAllowed(['GET', 'POST']),
      DELETE: () => methodNotAllowed(['GET', 'POST']),
      HEAD: () => methodNotAllowed(['GET', 'POST']),
      OPTIONS: () => methodNotAllowed(['GET', 'POST']),
      TRACE: () => methodNotAllowed(['GET', 'POST']),
      CONNECT: () => methodNotAllowed(['GET', 'POST']),
    },
  },
})
