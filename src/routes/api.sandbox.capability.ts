import { createFileRoute } from '@tanstack/react-router'

import { handleSandboxCapabilityRequest } from '@/lib/server/sandbox-capability-provider'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/sandbox/capability')({
  server: {
    handlers: {
      POST: ({ request }) => handleSandboxCapabilityRequest(request),
      GET: () => methodNotAllowed(['POST']),
      PUT: () => methodNotAllowed(['POST']),
      PATCH: () => methodNotAllowed(['POST']),
      DELETE: () => methodNotAllowed(['POST']),
      HEAD: () => methodNotAllowed(['POST']),
      OPTIONS: () => methodNotAllowed(['POST']),
      TRACE: () => methodNotAllowed(['POST']),
      CONNECT: () => methodNotAllowed(['POST']),
    },
  },
})
