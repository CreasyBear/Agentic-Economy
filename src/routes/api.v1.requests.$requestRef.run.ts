import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerRequestRunPost } from '@/lib/server/customer-request-agent-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/v1/requests/$requestRef/run')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleAgentCustomerRequestRunPost(request, params.requestRef),
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
